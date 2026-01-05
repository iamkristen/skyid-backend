import { Response, Request } from "express";
import dotenv from "dotenv";
import SwitchTeamRequest from "./switch.model";
import SkyId from "../smart-number/number.skyId.model";
import User from "../user/user.model";
import { startSession } from "mongoose";
import EmailService from "../utils/EmailService";
import Transaction from "../wallet/wallet.transaction.model";
import Wallet from "../wallet/wallet.model";

dotenv.config();

export default class SwitchTeamController {
  static async getRequests(req: Request, res: Response) {
    try {
      // const page = req.query.page ? parseInt(req.query.page as string) : 0;
      // const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      // const skip = page * limit;

      const requests = await SwitchTeamRequest.find({
        status: { $in: ["pending", "approved"] },
      }).sort({ createdAt: -1 });
      // .skip(skip)
      // .limit(limit);

      return res.status(200).send({ message: "success", data: requests });
    } catch (error) {
      console.error(`Failed to get switch team requests: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getRequestsBySkyId(req: Request, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const { skyId } = req.params;

      const requests = await SwitchTeamRequest.find({
        skyId,
        createdBy: req.user._id.toString(),
        request_type: { $in: ["replace", "remove", "addMappedNumbers"] },
        status: { $in: ["pending", "rejected", "approved"] },
      }).sort({ createdAt: -1 });

      return res.status(200).send({ message: "success", data: requests });
    } catch (error) {
      console.error(`Failed to get switch team requests by skyId: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async approveRequest(req: Request, res: Response) {
    const { id } = req.params;
    const session = await startSession();
    await session.startTransaction();
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const switchReq = await SwitchTeamRequest.findOneAndUpdate(
        { _id: id },
        { $set: { status: "approved", handledBy: req.user._id } },
        { session }
      );
      if (!switchReq) return res.status(404).json({ message: "Switch team request not found" });

      const skyIdNumber = await SkyId.findOne({ skyId: switchReq.skyId });
      if (!skyIdNumber) throw new Error(`SkyId ${switchReq.skyId} not found`);

      const { request_type } = switchReq;
      switch (request_type) {
        case "replace": {
          const { current_number, new_number } = switchReq;
          // find and replace number
          const numbers = skyIdNumber.mappedNumbers.map((number) =>
            number.number === current_number.number && number.network === current_number.network ? new_number : number
          );
          // update mapped numbers
          await SkyId.updateOne({ skyId: switchReq.skyId }, { $set: { mappedNumbers: numbers } }, { session });
          break;
        }
        case "buy": {
          // activate skyid
          await SkyId.updateOne({ skyId: switchReq.skyId }, { $set: { status: "active" } }, { session });
          break;
        }
        case "addMappedNumbers": {
          const { mappedNumbers } = switchReq;
          // Add the new number to existing mapped numbers
          const numbers = [...skyIdNumber.mappedNumbers, ...mappedNumbers];
          console.log(...skyIdNumber.mappedNumbers, "skyIdNumber MappedNumbers");
          console.log(mappedNumbers, "mappedNumbers");
          // update mapped numbers
          await SkyId.updateOne({ skyId: switchReq.skyId }, { $set: { mappedNumbers: numbers } }, { session });
          break;
        }
        case "remove": {
          const { current_number } = switchReq;
          if (!current_number) throw new Error("current_number is required for remove request");
          // Remove the number from mapped numbers
          const numbers = skyIdNumber.mappedNumbers.filter(
            (num) => !(num.number === current_number.number && num.network === current_number.network)
          );
          // update mapped numbers
          await SkyId.updateOne({ skyId: switchReq.skyId }, { $set: { mappedNumbers: numbers } }, { session });
          break;
        }
        case "ivr":
        case "ivm": {
          console.log(`${request_type} Addon request ${switchReq.id} approved by switch team`);
          break;
        }
        default:
          throw new Error(`Invalid request type: ${request_type}`);
      }

      await session.commitTransaction();

      // Send notification email to the user
      try {
        const user = await User.findById(switchReq.createdBy);
        if (user && user.email) {
          const requestTypeDisplay = switchReq.request_type === "buy" ? "Number Purchase" : 
                                   switchReq.request_type === "replace" ? "Number Replacement" :
                                   switchReq.request_type === "remove" ? "Remove Mapped Number" :
                                   switchReq.request_type === "addMappedNumbers" ? "Add Mapped Numbers" :
                                   switchReq.request_type === "ivr" ? "IVR Add-on" :
                                   switchReq.request_type === "ivm" ? "IVM Add-on" : switchReq.request_type;

          await EmailService.sendMappingRequestApproved(
            user.email,
            `${user.firstName} ${user.lastName}`,
            switchReq.skyId,
            requestTypeDisplay
          );
        }
      } catch (emailError) {
        console.error("Failed to send approval notification email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to approve switch team request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async rejectRequest(req: Request, res: Response) {
    const { id } = req.params;
    const { remark } = req.body;
    const session = await startSession();
    await session.startTransaction();
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const switchReq = await SwitchTeamRequest.findOneAndUpdate(
        { _id: id },
        { $set: { status: "rejected", handledBy: req.user._id, remark } },
        { session }
      );

      if (!switchReq) return res.status(404).json({ message: "Switch team request not found" });

      // Handle refund for replace requests
      if (switchReq.request_type === "replace" && switchReq.txnRef) {
        const transaction = await Transaction.findById(switchReq.txnRef).session(session);
        if (transaction) {
          // Update transaction status to failed
          transaction.status = "failed";
          await transaction.save({ session });

          // Refund based on payment method
          if (transaction.accountNumber) {
            // Payment was via wallet - refund to wallet
            const wallet = await Wallet.findOne({ accountNumber: transaction.accountNumber }).session(session);
            if (wallet) {
              await Wallet.updateOne(
                { accountNumber: transaction.accountNumber },
                { $inc: { amount: Math.abs(transaction.amount) } },
                { session }
              );
            }
          } else {
            // Payment was via Zainpay - add to user's wallet as refund
            const user = await User.findById(switchReq.createdBy).session(session);
            if (user) {
              // Check if user has a wallet
              let wallet = await Wallet.findOne({ _id: user._id }).session(session);
              if (!wallet) {
                // Create wallet if it doesn't exist (for Individual users who paid via Zainpay)
                let accountNumber;
                let isUnique = false;
                while (!isUnique) {
                  accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
                  const existingWallet = await Wallet.findOne({ accountNumber }).session(session);
                  if (!existingWallet) {
                    isUnique = true;
                  }
                }
                wallet = new Wallet({
                  _id: user._id,
                  amount: 0,
                  status: "active",
                  accountNumber,
                });
                await wallet.save({ session });
              }
              // Add refund amount to wallet
              await Wallet.updateOne(
                { _id: user._id },
                { $inc: { amount: Math.abs(transaction.amount) } },
                { session }
              );
            }
          }
        }
      }

      await session.commitTransaction();

      // Send notification email to the user
      try {
        const user = await User.findById(switchReq.createdBy);
        if (user && user.email) {
          const requestTypeDisplay = switchReq.request_type === "buy" ? "Number Purchase" : 
                                   switchReq.request_type === "replace" ? "Number Replacement" :
                                   switchReq.request_type === "remove" ? "Remove Mapped Number" :
                                   switchReq.request_type === "addMappedNumbers" ? "Add Mapped Numbers" :
                                   switchReq.request_type === "ivr" ? "IVR Add-on" :
                                   switchReq.request_type === "ivm" ? "IVM Add-on" : switchReq.request_type;

          await EmailService.sendMappingRequestRejected(
            user.email,
            `${user.firstName} ${user.lastName}`,
            switchReq.skyId,
            requestTypeDisplay,
            remark || "No specific reason provided"
          );
        }
      } catch (emailError) {
        console.error("Failed to send rejection notification email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to reject switch team request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }
}
