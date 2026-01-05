import { Response, Request, NextFunction } from "express";
import User from "./user.model";
import Bcrypt from "../utils/bcryptService";
import { sendMail } from "../utils/sendMail";
import {
  channelPartner,
  forgotPasswordTemplate,
  kycHTML,
  registration,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "../views/email-template";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import Otp from "./user.otp.model";
import AdminUser from "../admin/admin.model";
import { generateOtp } from "../utils/generateOtp";
import generate from "../utils/generate";
import Kyc from "../kyc/kyc.model";
import { type ClientSession, startSession } from "mongoose";
import Wallet from "../wallet/wallet.model";
import ChannelPartner from "../partner/partner.model";
import EmailService from "../utils/EmailService";
import ValidateSchema from "../account-manager/account-manager.schema";
import ValidateUserSchema from "./user.schema";
import AgentCode from "../agent/agent.code.model";
import SkyId from "../smart-number/number.skyId.model";

dotenv.config();

export default class UserController {
  static async signup(req: Request, res: Response) {
    let session: ClientSession | undefined = undefined;
    const useTransactions = process.env.USE_MONGODB_TRANSACTIONS === 'true';
    
    try {
      const { error, value } = ValidateUserSchema.signup({ ...req.body });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
      if (user) return res.status(400).send({ message: "Email is already used." });

      // Only use transactions if explicitly enabled (for production/replica sets)
      if (useTransactions) {
        session = await startSession();
        session.startTransaction();
      }

      user = new User({
        ...req.body,
        email: req.body.email.toLowerCase().trim(),
        verified: "false",
        password: Bcrypt.shared().encode(req.body.password), // encrypt password
      });

      await user.save(session ? { session } : {});

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
        _id: user._id,
        amount: 0,
        status: "active",
        accountNumber,
      });
      await wallet.save(session ? { session } : {});

      EmailService.sendWelcomeEmail(req.body.email, req.body.firstName);

      const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });
      
      if (session) {
        await session.commitTransaction();
        await session.endSession();
      }
      
      return res.status(200).json({ message: "success", accessToken: token });
    } catch (error) {
      if (session) {
        await session.abortTransaction();
        await session.endSession();
      }
      console.error("Signup Error:", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async sendEmailToAccountManager(req: Request, res: Response) {
    try {
      const { error, value } = ValidateSchema.sendEmailToAccountManager(req.body);
      if (error) return res.status(400).send(error.details[0].message);

      // store channel partner request in database
      const cp = new ChannelPartner({ ...value, status: "pending" });
      await cp.save();

      EmailService.sendChannelPartnerRegistration("sales@itskysolutions.com", req.body.name, cp);

      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async userProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profileData = await User.findById(req.user?._id).select("-password -__v");
      
      // If user is an agent, get their agentCode
      if (profileData?.accountType === "Agent") { 
        const agentCodeData = await AgentCode.findOne({ createdFor: profileData._id });
        if (agentCodeData) {
          profileData.agentCode = agentCodeData.code;
        }
      }
      
      // If user is a VSO, get their parent Channel Partner's level to determine wallet/agentCode access
      if (profileData?.accountType === "VSO" && profileData?.createdBy) {
        const parentChannelPartner = await User.findById(profileData.createdBy).select("channelPartnerLevel");
        if (parentChannelPartner) {
          (profileData as any).parentChannelPartnerLevel = parentChannelPartner.channelPartnerLevel;
        }
      }
      
      return res.status(200).json({ message: "success", data: profileData });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const profileData = await User.find().select("-password -__v");
      return res.status(200).json({ message: "success", data: profileData });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async blockUser(req: Request, res: Response) {
    const { userId } = req.params;
    const currentUserId = req.user!._id;
    
    try {
      const currentUser = await User.findById(currentUserId);
      if (!currentUser) return res.status(404).send({ message: "Current user not found." });

      const user = await User.findById(userId);
      if (!user) return res.status(404).send({ message: "User not found." });

      // Check authorization based on account type
      if (currentUser.accountType === "Channel_Partner") {
        // Channel Partners can only block their own VSOs
        if (user.createdBy !== currentUserId) {
          return res.status(403).send({ message: "You can only block your own VSOs." });
        }
        if (user.accountType !== "VSO") {
          return res.status(403).send({ message: "You can only block VSOs." });
        }
      } else {
        // Check if current user is an Admin user
        const adminUser = await AdminUser.findById(currentUserId);
        if (adminUser && (adminUser.role === "Admin" || adminUser.role === "Super_Admin")) {
          // Admin and Super Admin can block any user
          // No additional restrictions
          user.status = "blocked";
          await user.save();
          return res.status(200).json({ message: "User has been blocked successfully." });
        } else {
          // Other account types are not authorized to block users
          return res.status(403).send({ message: "You are not authorized to block users." });
        }
      }

      if (user.status === "blocked") {
        return res.status(400).send({ message: "User is already blocked." });
      }

      user.status = "blocked";
      await user.save();

      return res.status(200).json({ message: "User has been blocked successfully." });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async unblockUser(req: Request, res: Response) {
    const { userId } = req.params;
    const currentUserId = req.user!._id;
    
    try {
      const currentUser = await User.findById(currentUserId);
      if (!currentUser) return res.status(404).send({ message: "Current user not found." });

      const user = await User.findById(userId);
      if (!user) return res.status(404).send({ message: "User not found." });

      // Check authorization based on account type
      if (currentUser.accountType === "Channel_Partner") {
        // Channel Partners can only unblock their own VSOs
        if (user.createdBy !== currentUserId) {
          return res.status(403).send({ message: "You can only unblock your own VSOs." });
        }
        if (user.accountType !== "VSO") {
          return res.status(403).send({ message: "You can only unblock VSOs." });
        }
      } else {
        // Check if current user is an Admin user
        const adminUser = await AdminUser.findById(currentUserId);
        if (adminUser && (adminUser.role === "Admin" || adminUser.role === "Super_Admin")) {
          // Admin and Super Admin can unblock any user
          // No additional restrictions

      user.status = "active"; // Update the status to "active" or whatever your unblocked status is
      await user.save();

      return res.status(200).json({ message: "User has been unblocked successfully." });
        } else {
          // Other account types are not authorized to unblock users
          return res.status(403).send({ message: "You are not authorized to unblock users." });
        }
      }

      // Check if the user is not blocked
      if (user.status !== "blocked") {
        return res.status(400).send({ message: "User is not blocked." });
      }

      user.status = "active"; // Update the status to "active" or whatever your unblocked status is
      await user.save();

      return res.status(200).json({ message: "User has been unblocked successfully." });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async kyc(req: Request, res: Response) {
    try {
      const { error, value } = ValidateUserSchema.kyc({ ...req.body });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ _id: req.user?._id });
      if (!user) return res.status(400).send({ message: "User does not exist." });

      let kycOld = await Kyc.findOne({ user_id: user._id });
      if (kycOld) return res.status(400).send({ message: "User has already completed their kyc." });

      // update user verified status
      user.verified = "true";
      await user.save();

      let kyc = new Kyc({ ...value, user_id: user._id });
      await kyc.save();

      EmailService.sendKYCCompletionEmail(user?.email!, user?.firstName!);
      return res.status(200).json({ message: "success" });

      // sending user an email confirming that his account has been verified
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getUserStats(req: Request, res: Response) {
    try {
      const userId = req.user!._id;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User does not exist." });

      const accountType = user.accountType;

      let stats: any = {
        skyIdNumbers: 0,
        mappedLines: 0,
        addOns: 0,
      };

      // For Channel Partners, aggregate stats from all their VSOs
      if (accountType === "Channel_Partner") {
        // Get all VSO IDs created by this Channel Partner
        const vsos = await User.find({
          accountType: "VSO",
          createdBy: userId.toString(),
        }).select("_id");

        // Get VSO count
        const vsoCount = vsos.length;
        stats.vsos = vsoCount;

        // Get all VSO IDs
        const vsoIds = vsos.map((vso) => vso._id);

        if (vsoIds.length > 0) {
          // Aggregate Sky ID stats from all VSOs using aggregation
          const skyIdStats = await SkyId.aggregate([
            {
              $match: {
                userId: { $in: vsoIds },
              },
            },
            {
              $group: {
                _id: null,
                skyIdCount: { $sum: 1 },
                mappedLinesCount: {
                  $sum: {
                    $cond: [
                      { $isArray: "$mappedNumbers" },
                      { $size: "$mappedNumbers" },
                      0,
                    ],
                  },
                },
                addOnsCount: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ["$withIVR", true] },
                          { $eq: ["$withIVM", true] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ]);

          if (skyIdStats.length > 0) {
            stats.skyIdNumbers = skyIdStats[0].skyIdCount || 0;
            stats.mappedLines = skyIdStats[0].mappedLinesCount || 0;
            stats.addOns = skyIdStats[0].addOnsCount || 0;
          }
        }
      } else {
        // For Individual and VSO accounts, get their own stats
        const skyIds = await SkyId.find({ userId });
        const skyIdCount = skyIds.length;

        // Count mapped lines (sum of all mappedNumbers arrays)
        const mappedLinesCount = skyIds.reduce((total, skyId) => {
          return total + (skyId.mappedNumbers?.length || 0);
        }, 0);

        // Count add-ons (Sky IDs with IVR or IVM)
        const addOnsCount = skyIds.filter(
          (skyId) => skyId.withIVR === true || skyId.withIVM === true
        ).length;

        stats = {
          skyIdNumbers: skyIdCount,
          mappedLines: mappedLinesCount,
          addOns: addOnsCount,
        };

        // For VSOs, add customers count
        if (accountType === "VSO") {
          const customersCount = await User.countDocuments({
            accountType: "Individual",
            createdBy: userId.toString(),
          });
          stats.customers = customersCount;
        }
      }

      return res.status(200).json({
        message: "success",
        data: stats,
      });
    } catch (error) {
      console.error(`Failed to get user stats: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async validatePublicSignupEmail(req: Request, res: Response) {
    const { email } = req.body;
    try {
      const { error } = ValidateUserSchema.validatePublicSignupEmail(email);
      
      if (error) {
        return res.status(400).json({ 
          message: error.details[0].message,
          valid: false 
        });
      }
      // Check if email already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });

      if (existingUser) {
        return res.status(400).json({ 
          message: "This email is already registered",
          valid: false 
        });
      }

      return res.status(200).json({ 
        message: "Email is valid and available",
        valid: true 
      });
    } catch (error: any) {
      console.error("Error validating email:", error);
      return res.status(500).json({ 
        message: "An error occurred while validating email. Please try again.",
        valid: false 
      });
    }
  }
}
