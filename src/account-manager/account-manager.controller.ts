import { Response, Request } from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose, { startSession } from "mongoose";
import ChannelPartner from "../partner/partner.model";
import AgentCode, { generateCode } from "../agent/agent.code.model";
import { channelPartner, channelPartnerApproved, registration } from "../views/email-template";
import { sendMail } from "../utils/sendMail";
import User from "../user/user.model";
import validation from "./account-manager.schema";
import { generateOtp } from "../utils/generateOtp";
import Bcrypt from "../utils/bcryptService";
import Kyc from "../kyc/kyc.model";
import Wallet from "../wallet/wallet.model";
import SwitchTeamRequest from "../switch/switch.model";
import EmailService from "../utils/EmailService";
import AdminUser from "../admin/admin.model";
import { getAdminRoles } from "../admin/admin.controller";
import KYCController from "../kyc/kyc.controller";
import { capitalize } from "../utils/string.utils";

dotenv.config();

export default class AccountManagerController {
  static async createChannelPartner(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { error, value } = validation.createChannelPartner(req.body);
      if (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send({ message: error.details[0].message });
      }

      const user = await AdminUser.findById(req.user?._id);
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send({ message: "User does not exist." });
      }

      const adminRoles = getAdminRoles(user);
      if (!adminRoles.some((r) => ["admin", "account_manager", "super_admin"].includes(r))) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send({ message: "You are not authorized to perform this action." });
      }

      const checkUser = await User.findOne({ email: value.email });
      if (checkUser) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send({ message: "Email already exists." });
      }

      const checkNin = await User.findOne({ nin: value.nin });
      if (checkNin) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send({ message: "Nin already exists." });
      }

      const ninData = await KYCController.getNINData(value.nin!);
      if (!ninData || !ninData.nin_data) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send({ message: "Invalid NIN or NIN verification failed" });
      }

      const randomPassword = generateOtp();
      const channelPartner = new User({
        firstName: capitalize(ninData.nin_data.firstname),
        lastName: capitalize(ninData.nin_data.surname),
        businessName: capitalize(value.businessName),
        businessType: value.businessType,
        ...(value.cacRnNumber && { cacRnNumber: value.cacRnNumber.trim() }),
        email: value.email.toLowerCase(),
        phoneNumber: value.phoneNumber,
        password: Bcrypt.shared().encode(randomPassword),
        accountType: "Channel_Partner",
        state: value.state,
        ...(value.bvn && value.bvn.length === 11 && { bvn: value.bvn }),
        channelPartnerLevel: value.channelPartnerLevel,
        nin: value.nin,
        status: "active", //pending
        createdBy: req.user?._id,
        mustChangePassword: true,
        // verified: "true",
        // Bank details for Silver partners
        ...(value.channelPartnerLevel === "Silver" && {
          bankCode: value.bankCode,
          bankName: value.bankName,
          accountNumber: value.accountNumber,
          accountHolderName: value.accountHolderName,
        }),
      });
      await channelPartner.save({ session });

      //Wallet
      if (value.channelPartnerLevel === "Platinum") {
        let accountNumber;
        let isUnique = false;
        while (!isUnique) {
          accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
          // Check if account number already exists
          const existingWallet = await Wallet.findOne({ accountNumber });
          if (!existingWallet) {
            isUnique = true;
          }
        }
        const wallet = new Wallet({
          _id: channelPartner._id,
          amount: 0,
          status: "active",
          accountNumber,
        });
        await wallet.save({ session });

        console.log(accountNumber, "accountNumber in createChannelPartner");
      } else {
        const code = `${(value.state as string).substring(0, 3).toUpperCase()}_${generateCode()}`;
        console.log(`Creating new agent code ${code}`);
        const agentCode = new AgentCode({
          code,
          createdFor: channelPartner.id,
          createdForType: "channel_partner",
          discountPercent: 0,
          allocationPercent: value.allocationPercent ?? 15,
          status: "active",
        });
        await agentCode.save({ session });
      }

      EmailService.sendChannelPartnerCreation(
        req.body.email,
        capitalize(ninData.nin_data.firstname),
        "",
        randomPassword
      );
      await session.commitTransaction();
      session.endSession();
      return res.status(200).send({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error(`Failed to create channel partner: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async checkNinExists(req: Request, res: Response) {
    try {
      const nin = typeof req.body?.nin === "string" ? req.body.nin.trim().replace(/\s+/g, "") : "";
      if (!nin || nin.length !== 11) {
        return res.status(400).json({ message: "Valid 11-digit NIN is required." });
      }
      const existing = await User.findOne({ nin });
      if (existing) {
        return res.status(400).json({ message: "Nin already exists." });
      }
      return res.status(200).json({ exists: false });
    } catch (error) {
      console.error("checkNinExists error:", error);
      return res.status(500).json({ message: "An error occurred while checking NIN." });
    }
  }

  static async getChannelPartners(req: Request, res: Response) {
    try {
      // Channel partners with vsos count and totalSales = sum of all their VSOs' approved switch request amounts
      const switchCollection = SwitchTeamRequest.collection.name;

      const currentUser = await AdminUser.findById(req.user?._id).lean();
      const currentRoles = getAdminRoles(currentUser as { role?: string; roles?: string[] });
      const isAccountManagerOnly =
        currentRoles.includes("account_manager") && !currentRoles.some((r) => ["admin", "super_admin"].includes(r));

      const matchStage: Record<string, unknown> = { accountType: "Channel_Partner" };
      if (isAccountManagerOnly && currentUser?._id) {
        matchStage.createdBy = String(currentUser._id);
      }

      const channelPartnersWithStats = await User.aggregate([
        { $match: matchStage },

        // All VSOs created by this channel partner
        {
          $lookup: {
            from: "users",
            let: { cpId: { $toString: "$_id" } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$accountType", "VSO"] }, { $eq: ["$createdBy", "$$cpId"] }],
                  },
                },
              },
            ],
            as: "vsoList",
          },
        },

        // vsos = count; vsoIds = list of VSO _ids for summing their sales
        {
          $addFields: {
            vsos: { $size: "$vsoList" },
            vsoIds: {
              $map: {
                input: "$vsoList",
                as: "v",
                in: { $toString: "$$v._id" },
              },
            },
          },
        },

        // Total sales of entire VSOs: sum(amount) for all approved switch requests where createdBy is any of this CP's VSOs
        {
          $lookup: {
            from: switchCollection,
            let: { vsoIds: "$vsoIds" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $in: ["$createdBy", "$$vsoIds"] }, { $eq: ["$status", "approved"] }],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  totalSales: { $sum: { $ifNull: ["$amount", 0] } },
                },
              },
            ],
            as: "salesResult",
          },
        },

        {
          $addFields: {
            totalSales: {
              $let: {
                vars: { first: { $arrayElemAt: ["$salesResult", 0] } },
                in: { $ifNull: ["$$first.totalSales", 0] },
              },
            },
          },
        },

        // Allocation % (Silver partners only – from AgentCode)
        {
          $lookup: {
            from: "agentcodes",
            let: { cpId: { $toString: "$_id" } },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$createdFor", "$$cpId"] },
                  createdForType: "channel_partner",
                },
              },
              { $limit: 1 },
              { $project: { allocationPercent: 1 } },
            ],
            as: "agentCodeDoc",
          },
        },
        {
          $addFields: {
            allocationPercent: {
              $let: {
                vars: { ac: { $arrayElemAt: ["$agentCodeDoc", 0] } },
                in: { $ifNull: ["$$ac.allocationPercent", null] },
              },
            },
          },
        },

        { $unset: ["password", "vsoList", "vsoIds", "salesResult", "agentCodeDoc"] },
      ]);

      return res.status(200).send({ message: "success", data: channelPartnersWithStats });
    } catch (error) {
      console.error(`Failed to get channel partners: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  // static async getChannelPartnerActivities(req: Request, res: Response) {
  //   const { id } = req.params;
  //   try {
  //     const channelPartner = await User.findOne({ _id: id, accountType: "Channel_Partner", })
  //     if (!channelPartner) return res.status(404).send({ message: "Channel partner not found" });
  //     const switchRequests = await SwitchTeamRequest.find({ })
  //   } catch (error) {
  //     console.error(`Failed to get channel partners: ${error}`);
  //     return res.status(500).json({ message: "Internal Server Error!" });
  //   }
  // }

  static async getRequests(req: Request, res: Response) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string) : 0;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const skip = page * limit;

      const requests = await ChannelPartner.find({ status: "pending" }).sort({ createdAt: -1 }).skip(skip).limit(limit);

      return res.status(200).send({ message: "success", data: requests });
    } catch (error) {
      console.error(`Failed to get channel partner requests: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async approveRequest(req: Request, res: Response) {
    const { id } = req.params;
    const session = await startSession();
    await session.startTransaction();
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const signupSecret = generateCode();
      const channelPartnerReq = await ChannelPartner.findOneAndUpdate(
        { _id: id },
        { $set: { status: "approved", handledBy: req.user._id, signupSecret } },
        { session }
      );
      if (!channelPartnerReq) return res.status(404).json({ message: "Channel partner request not found" });

      const secretToken = jwt.sign({ signupSecret }, process.env.JWT_PRIVATE_KEY as string);
      const signUpLink = `https://skyid.ng/addNewChannelPartner?token=${encodeURIComponent(secretToken)}`;

      EmailService.sendChannelPartnerApproval(channelPartnerReq.email, channelPartnerReq.name, signUpLink);

      await session.commitTransaction();

      return res.status(200).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to approve channel partner request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async rejectRequest(req: Request, res: Response) {
    const { id } = req.params;
    // const { remark } = req.body;
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const channelPartnerReq = await ChannelPartner.findOneAndUpdate(
        { _id: id },
        { $set: { status: "rejected", handledBy: req.user._id } }
      );

      if (!channelPartnerReq) return res.status(404).json({ message: "Channel partner request not found" });

      return res.status(200).json({ message: "success" });
    } catch (error) {
      console.error(`Failed to reject channel partner request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async updateChannelPartner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        firstName,
        lastName,
        email,
        phoneNumber,
        businessName,
        businessType,
        state,
        channelPartnerLevel,
        allocationPercent,
      } = req.body;

      // Check if current user is an Admin user with permission to edit channel partners
      const adminUser = await AdminUser.findById(req.user!._id);
      if (!adminUser) {
        return res.status(403).send({ message: "You are not authorized to update channel partners." });
      }

      const allowedRoles: string[] = ["admin", "super_admin", "account_manager"];
      const adminRoles = getAdminRoles(adminUser);
      if (!adminRoles.some((r) => allowedRoles.includes(r))) {
        return res
          .status(403)
          .send({ message: "Only Admin, Super Admin, or Account Manager can edit channel partners." });
      }

      // Find the channel partner
      const channelPartner = await User.findOne({ _id: id, accountType: "Channel_Partner" });
      if (!channelPartner) {
        return res.status(404).send({ message: "Channel partner not found." });
      }

      // Check if email is already taken by another user
      if (email && email !== channelPartner.email) {
        const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: id } });
        if (existingUser) {
          return res.status(400).send({ message: "Email is already taken by another user." });
        }
      }

      // Validate allocation percentage if provided (0–25, Silver partners only)
      if (allocationPercent !== undefined && allocationPercent !== null) {
        const num = Number(allocationPercent);
        if (Number.isNaN(num) || num < 0 || num > 25) {
          return res.status(400).send({ message: "Allocation percentage must be between 0 and 25." });
        }
        // Only Silver partners have an AgentCode; update it
        if (channelPartner.channelPartnerLevel === "Silver") {
          const agentCode = await AgentCode.findOne({ createdFor: id, createdForType: "channel_partner" });
          if (agentCode) {
            agentCode.allocationPercent = num;
            await agentCode.save();
          }
        }
      }

      // Update the channel partner
      const updateData: Record<string, unknown> = {};
      if (firstName) updateData.firstName = capitalize(firstName);
      if (lastName) updateData.lastName = capitalize(lastName);
      if (email) updateData.email = email.toLowerCase();
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (businessName) updateData.businessName = capitalize(businessName);
      if (businessType) updateData.businessType = businessType;
      if (state) updateData.state = state;
      if (channelPartnerLevel) updateData.channelPartnerLevel = channelPartnerLevel;

      const updatedChannelPartner = await User.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, select: "-password -__v" }
      );

      return res.status(200).json({
        message: "Channel partner updated successfully",
        data: updatedChannelPartner,
      });
    } catch (error) {
      console.error(`Failed to update channel partner: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getChannelPartnerActivities(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Check if current user is an Admin user
      const adminUser = await AdminUser.findById(req.user!._id);
      if (!adminUser) {
        return res.status(403).send({ message: "You are not authorized to view channel partner activities." });
      }

      const adminRoles = getAdminRoles(adminUser);
      if (!adminRoles.some((r) => ["admin", "account_manager", "super_admin"].includes(r))) {
        return res.status(403).send({ message: "You are not authorized to perform this action." });
      }

      // Find the channel partner
      const channelPartner = await User.findOne({ _id: id, accountType: "Channel_Partner" });
      if (!channelPartner) {
        return res.status(404).send({ message: "Channel partner not found." });
      }

      // Get all VSOs created by this channel partner
      const vsos = await User.find({ createdBy: id, accountType: "VSO" }).select("-password -__v");

      // Get activities for each VSO
      const activities = [];
      for (const vso of vsos) {
        const vsoActivities = await SwitchTeamRequest.find({ createdBy: vso._id }).sort({ createdAt: -1 });
        activities.push({
          vso: vso,
          activities: vsoActivities,
        });
      }

      // Get channel partner's own activities (if any)
      const channelPartnerActivities = await SwitchTeamRequest.find({ createdBy: id }).sort({ createdAt: -1 });

      return res.status(200).json({
        message: "success",
        data: {
          channelPartner,
          vsos,
          activities,
          channelPartnerActivities,
        },
      });
    } catch (error) {
      console.error(`Failed to get channel partner activities: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
