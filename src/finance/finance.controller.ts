import { Response, Request } from "express";
import dotenv from "dotenv";
import FinanceTeamRequest from "./finance.model";
import { startSession } from "mongoose";
import Wallet from "../wallet/wallet.model";
import Transaction from "../wallet/wallet.transaction.model";
import AgentCode from "../agent/agent.code.model";
import validation from "./finance.schema";
import User from "../user/user.model";
import SwitchTeamRequest from "../switch/switch.model";
import SkyId from "../smart-number/number.skyId.model";
import EmailService from "../utils/EmailService";
import VSOTopUpRequest from "../vso/vso-topup.model";
import NotificationRead from "./notification-read.model";

dotenv.config();

export default class FinanceTeamController {
  static async _resolveRequestUser(financeReq: any) {
    try {
      if (financeReq?.userId) {
        const userById = await User.findById(financeReq.userId);
        if (userById) {
          if (userById.accountType !== "Channel_Partner" && userById.createdBy) {
            const creator = await User.findById(userById.createdBy);
            if (creator && creator.accountType === "Channel_Partner") return creator;
          }
          return userById;
        }
      }
      if (financeReq?.txnRef) {
        const txn = await Transaction.findById(financeReq.txnRef);
        if (txn?.transferRecepient) {
          const user = await User.findById(txn.transferRecepient);
          if (user) {
            if (user.accountType !== "Channel_Partner" && user.createdBy) {
              const creator = await User.findById(user.createdBy);
              if (creator && creator.accountType === "Channel_Partner") return creator;
            }
            return user;
          }
        }
      }
      if (financeReq?.accountNumber) {
        const userByAcct = await User.findOne({ accountNumber: financeReq.accountNumber });
        if (userByAcct) return userByAcct;
      }
    } catch (e) {
      console.error("Failed to resolve finance request user:", e);
    }
    return null;
  }
  static async getRequests(req: Request, res: Response) {
    try {
      // const page = req.query.page ? parseInt(req.query.page as string) : 0;
      // const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      // const skip = page * limit;

      const requests = await FinanceTeamRequest.find({
        status: { $in: ["pending", "approved"] },
      }).sort({ createdAt: -1 });
      // .skip(skip)
      // .limit(limit);

      return res.status(200).send({ message: "success", data: requests });
    } catch (error) {
      console.error(`Failed to get finance team requests: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async approveRequest(req: Request, res: Response) {
    const { id, amount } = req.params;

    const session = await startSession();
    await session.startTransaction();
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const financeReq = await FinanceTeamRequest.findOneAndUpdate(
        { _id: id, status: "pending" },
        { $set: { status: "approved", handledBy: req.user._id, amount } },
        { session }
      );
      if (!financeReq) return res.status(404).json({ message: "Finance team request not found" });

      const wallet =
        financeReq.accountNumber &&
        (await Wallet.findOne({
          accountNumber: financeReq.accountNumber,
        }));
      if (financeReq.accountNumber && !wallet) throw new Error(`Wallet ${financeReq.accountNumber} not found`);

      const { request_type } = financeReq;
      switch (request_type) {
        case "withdraw": {
          await Transaction.updateOne({ _id: financeReq.txnRef }, { $set: { status: "success" } }, { session });
          break;
        }
        case "deposit": {
          const transaction = await Transaction.findOneAndUpdate(
            { _id: financeReq.txnRef },
            { $set: { status: "success" } },
            { session }
          );
          if (!transaction) {
            throw new Error(`Transaction ${financeReq.txnRef} not found`);
          }
          if (transaction.type === "payment") {
            switch (transaction.paymentType) {
              case "buyNumber":
              case "replaceMappedLines":
                await SwitchTeamRequest.updateOne(
                  { txnRef: transaction._id.toString() },
                  { $set: { status: "pending" } },
                  { session }
                );
                break;
              case "buyAddons":
                const updates: Record<string, boolean> = {};
                if (transaction.ivr) updates["withIVR"] = true;
                if (transaction.ivm) updates["withIVM"] = true;
                await SkyId.updateOne({ skyId: transaction.skyId }, { $set: updates }, { session });
                break;
            }
          }
          if (financeReq.accountNumber)
            await Wallet.updateOne(
              { accountNumber: financeReq.accountNumber },
              { $inc: { amount: Number(amount) ?? financeReq.amount } },
              { session }
            );
          break;
        }
        default:
          throw new Error(`Invalid request type: ${request_type}`);
      }

      await session.commitTransaction();

      // Notify user on approval
      try {
        const user = await FinanceTeamController._resolveRequestUser(financeReq as any);
        if (user?.email) {
          await EmailService.sendFinanceRequestApproved(
            user.email,
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            financeReq.request_type,
            Number(amount || financeReq.amount || 0)
          );
        }
      } catch (err) {
        console.error("Failed to send approval email:", err);
      }

      return res.status(200).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to approve finance team request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async rejectRequest(req: Request, res: Response) {
    const { id } = req.params;
    const { remark } = req.body;
    const session = await startSession();
    session.startTransaction();
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const financeReq = await FinanceTeamRequest.findOneAndUpdate(
        { _id: id, status: "pending" },
        { $set: { status: "rejected", handledBy: req.user._id, remark } },
        { session }
      );

      if (!financeReq) return res.status(404).json({ message: "Finance team request not found" });

      const { request_type } = financeReq;
      switch (request_type) {
        case "withdraw": {
          await Transaction.updateOne({ _id: financeReq.txnRef }, { $set: { status: "failed" } }, { session });
          await Wallet.updateOne(
            { accountNumber: financeReq.accountNumber },
            { $inc: { amount: Math.abs(financeReq.amount) } }, // add the amount back
            { session }
          );
          break;
        }
        case "deposit": {
          await Transaction.updateOne({ _id: financeReq.txnRef }, { $set: { status: "failed" } }, { session });
          break;
        }
        default:
          throw new Error(`Invalid request type: ${request_type}`);
      }

      await session.commitTransaction();

      // Notify user on rejection
      try {
        const user = await FinanceTeamController._resolveRequestUser(financeReq as any);
        if (user?.email) {
          await EmailService.sendFinanceRequestRejected(
            user.email,
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            financeReq.request_type,
            Number(financeReq.amount || 0),
            remark
          );
        }
      } catch (err) {
        console.error("Failed to send rejection email:", err);
      }

      return res.status(200).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to reject finance team request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async getAgentCodes(req: Request, res: Response) {
    const { status } = req.query as { status: string | undefined };
    try {
      const filter = {} as Record<string, unknown>;
      if (status) filter.status = status;
      const codes = await AgentCode.find(filter).sort({ createdAt: -1 });
      return res.status(200).json({ message: "success", data: codes });
    } catch (error) {
      console.error(`Failed to get switch team requests: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  // static async createAgentCode(req: Request, res: Response) {
  //   try {
  //     const { error, value } = validation.createAgentCode(req.body);
  //     if (error) return res.status(400).send(error.details[0].message);
  //
  //     // generate random code if not provided
  //     if (!value.code) value.code = generateCode();
  //
  //     const code = new AgentCode({
  //       ...value,
  //       status: "active",
  //       createdBy: req.user?._id,
  //     });
  //     await code.save();
  //
  //     console.log(`${req.user?._id} created agent code: ${code.code}`);
  //     return res.status(200).json({ message: "success", data: code });
  //   } catch (error) {
  //     console.error(`Failed to create switch team request: ${error}`);
  //     return res.status(500).json({ message: "Internal Server Error!" });
  //   }
  // }

  static async editAgentCode(req: Request, res: Response) {
    const { code } = req.params;
    try {
      const { error, value } = validation.editAgentCode({ ...req.body, code });
      if (error) return res.status(400).send(error.details[0].message);

      await AgentCode.updateOne({ code }, { $set: { ...value, updatedBy: req.user?._id } });

      return res.status(200).json({ message: "success" });
    } catch (error) {
      console.error(`Failed to agent code(${code}): ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async agentCodeUsers(req: Request, res: Response) {
    const { code } = req.params;
    try {
      const agentCode = await AgentCode.findOne({ code });
      if (!agentCode) return res.status(404).json({ message: "Agent code not found" });

      const users = await User.find({ agentCode: code }).sort({
        createdAt: -1,
      });
      return res.status(200).json({ message: "success", data: users });
    } catch (error) {
      console.error(`Failed to get switch team requests: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getUserNotifications(req: Request, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.user._id.toString();

      // Get read notification IDs for this user
      const readData = await NotificationRead.findOne({ userId });
      const readNotificationIds = new Set(readData?.notificationIds || []);

      // Fetch finance requests (wallet notifications)
      const financeRequests = await FinanceTeamRequest.find({
        userId,
        status: { $in: ["approved", "rejected"] },
      })
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();

      // Fetch switch team requests (mapping number notifications)
      const switchRequests = await SwitchTeamRequest.find({
        createdBy: userId,
        status: { $in: ["approved", "rejected"] },
      })
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();

      // Fetch VSO top-up requests (for VSOs and Channel Partners)
      const user = await User.findById(userId);
      let topUpRequests: any[] = [];
      if (user?.accountType === "VSO") {
        // For VSOs: show approved/rejected requests
        topUpRequests = await VSOTopUpRequest.find({
          vsoId: userId.toString(),
          status: { $in: ["approved", "rejected"] },
        })
          .sort({ updatedAt: -1 })
          .limit(50)
          .lean();
      } else if (user?.accountType === "Channel_Partner") {
        // For Channel Partners: show pending requests (new requests from their VSOs)
        topUpRequests = await VSOTopUpRequest.find({
          channelPartnerId: userId.toString(),
          status: "pending",
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
      }

      // Transform finance requests to unified notification format
      const walletNotifications = financeRequests.map((req) => {
        const notificationId = req._id.toString();
        return {
          id: notificationId,
          type: "wallet",
          status: req.status,
          title: `${req.request_type === "deposit" ? "Deposit" : "Withdrawal"} Request ${req.status === "approved" ? "Approved" : "Rejected"}`,
          description: `Your ${req.request_type === "deposit" ? "deposit" : "withdrawal"} request of ₦${((req.amount || 0) / 100).toLocaleString()} has been ${req.status === "approved" ? "approved" : "rejected"}.`,
          amount: req.amount,
          requestType: req.request_type,
          remark: req.remark,
          isRead: readNotificationIds.has(notificationId),
          createdAt: req.createdAt,
          updatedAt: req.updatedAt,
        };
      });

      // Transform switch requests to unified notification format
      const mappingNotifications = switchRequests.map((req) => {
        const requestTypeDisplay =
          req.request_type === "buy"
            ? "Number Purchase"
            : req.request_type === "replace"
            ? "Number Replacement"
            : req.request_type === "addMappedNumbers"
            ? "Add Mapped Numbers"
            : req.request_type === "ivr"
            ? "IVR Add-on"
            : req.request_type === "ivm"
            ? "IVM Add-on"
            : req.request_type;

        const notificationId = req._id.toString();
        return {
          id: notificationId,
          type: "mapping",
          status: req.status,
          title: `${requestTypeDisplay} Request ${req.status === "approved" ? "Approved" : "Rejected"}`,
          description: `Your ${requestTypeDisplay.toLowerCase()} request for Sky ID ${req.skyId} has been ${req.status === "approved" ? "approved" : "rejected"}.`,
          skyId: req.skyId,
          requestType: req.request_type,
          requestTypeDisplay,
          remark: req.remark,
          isRead: readNotificationIds.has(notificationId),
          createdAt: req.createdAt,
          updatedAt: req.updatedAt,
        };
      });

      // Transform VSO top-up requests to unified notification format
      const topUpNotifications = topUpRequests.map((req) => {
        const notificationId = req._id.toString();
        if (user?.accountType === "Channel_Partner") {
          // For Channel Partners: show pending requests from their VSOs
          return {
            id: notificationId,
            type: "wallet",
            status: req.status,
            title: "New VSO Top-Up Request",
            description: `Your VSO has requested a wallet top-up of ₦${((req.amount || 0) / 100).toLocaleString()}. Please review and respond to this request.`,
            amount: req.amount,
            requestType: "topup",
            vsoId: req.vsoId,
            isRead: readNotificationIds.has(notificationId),
            createdAt: req.createdAt,
            updatedAt: req.updatedAt,
          };
        } else {
          // For VSOs: show approved/rejected requests
          return {
            id: notificationId,
            type: "wallet",
            status: req.status,
            title: `Top-Up Request ${req.status === "approved" ? "Approved" : "Rejected"}`,
            description: `Your wallet top-up request of ₦${((req.amount || 0) / 100).toLocaleString()} has been ${req.status === "approved" ? "approved" : "rejected"} by your Channel Partner.`,
            amount: req.amount,
            requestType: "topup",
            remark: req.remark,
            isRead: readNotificationIds.has(notificationId),
            createdAt: req.createdAt,
            updatedAt: req.updatedAt,
          };
        }
      });

      // Combine all notifications and sort by updatedAt
      const allNotifications = [...walletNotifications, ...mappingNotifications, ...topUpNotifications].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
      );

      // Limit to last 50 notifications
      const notifications = allNotifications.slice(0, 50);

      return res.status(200).json({ message: "success", data: notifications });
    } catch (error) {
      console.error(`Failed to get user notifications: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async markNotificationAsRead(req: Request, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      const userId = req.user._id.toString();
      const { notificationId } = req.body;

      if (!notificationId) {
        return res.status(400).json({ message: "Notification ID is required" });
      }

      // Use findOneAndUpdate with upsert to atomically add notification ID
      const readData = await NotificationRead.findOneAndUpdate(
        { userId },
        {
          $addToSet: { notificationIds: notificationId }, // $addToSet only adds if not already present
        },
        {
          upsert: true, // Create document if it doesn't exist
          new: true, // Return the updated document
          setDefaultsOnInsert: true, // Set default values on insert
        }
      );

      return res.status(200).json({ message: "Notification marked as read", data: { notificationId } });
    } catch (error: any) {
      console.error(`Failed to mark notification as read:`, error);
      console.error(`Error details:`, {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      return res.status(500).json({ 
        message: "Internal Server Error!",
        error: process.env.NODE_ENV === 'development' ? error?.message : undefined
      });
    }
  }
}
