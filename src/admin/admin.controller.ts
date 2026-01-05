import { Response, Request, NextFunction } from "express";
import Bcrypt from "../utils/bcryptService";
import { sendMail } from "../utils/sendMail";
import { registration } from "../views/email-template";
import dotenv from "dotenv";
import AdminUser from "./admin.model";
import validation from "./admin.schema";
import jwt from "jsonwebtoken";
import EmailService from "../utils/EmailService";
import User from "../user/user.model";
import Wallet from "../wallet/wallet.model";
import AgentCode from "../agent/agent.code.model";
import SkyId from "../smart-number/number.skyId.model";
import Transaction from "../wallet/wallet.transaction.model";
import Kyc from "../kyc/kyc.model";
import SwitchTeamRequest from "../switch/switch.model";
import CustomerEnablementRequest from "../customer-enablement/customer.model";
import FinanceTeamRequest from "../finance/finance.model";

dotenv.config();

export default class UserManagementController {
  static async signup(req: Request, res: Response) {
    try {
      const { error } = validation.signup({ ...req.body });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await AdminUser.findOne({ email: req.body.email });
      if (user) return res.status(400).send({ message: "Email is taken already." });

      user = new AdminUser({
        ...req.body,
        verified: "false",
        password: Bcrypt.shared().encode(req.body.password), // encrypt password
      });

      await user.save();

      EmailService.sendWelcomeEmail(req.body.email, req.body.firstName);

      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async signin(req: Request, res: Response) {
    const { email, password } = req.body;
    try {
      const { error } = validation.signIn({ email, password });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await AdminUser.findOne({ email: req.body.email });
      if (!user) return res.status(400).send({ message: "Invalid email or password." });

      if (!Bcrypt.shared().compare(password, user.password as string))
        return res.status(400).send({ message: "Invalid email or password." });

      const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });

      return res.status(200).json({ message: "success", accessToken: token });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async userProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profileData = await AdminUser.findById(req.user?._id).select("-password -__v");
      return res.status(200).json({ message: "success", data: profileData });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async getAllUsers(req: Request, res: Response) {
    try {
      const users = await User.find({}).select("-password -__v").sort({ createdAt: -1 });
      return res.status(200).json({ message: "success", data: users });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getAllAdmins(req: Request, res: Response) {
    try {
      const admins = await AdminUser.find({}).select("-password -__v").sort({ date: -1 });
      return res.status(200).json({ message: "success", data: admins });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async deleteUser(req: Request, res: Response) {
    const { userId } = req.params;
    const currentUserId = req.user!._id;
    
    try {
      // Check if current user is an Admin user
      const adminUser = await AdminUser.findById(currentUserId);
      if (!adminUser) {
        return res.status(403).send({ message: "You are not authorized to delete users." });
      }

      // Prevent admin from deleting themselves
      if (userId === currentUserId) {
        return res.status(400).send({ message: "You cannot delete your own account." });
      }

      // Check if trying to delete an admin user first
      const targetAdminUser = await AdminUser.findById(userId);
      if (targetAdminUser) {
        if (adminUser.role !== "Super_Admin") {
          return res.status(403).send({ message: "Only Super Admin can delete admin users." });
        }
        // Delete from AdminUser collection if it's an admin
        await AdminUser.findByIdAndDelete(userId);
        return res.status(200).json({ message: "Admin user deleted successfully." });
      }

      // If not an admin user, check if it's a regular user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).send({ message: "User not found." });
      }

      // Clean up all related data
      console.log(`Starting cleanup for user ${userId}...`);

      // 1. Delete Wallet (if exists)
      const wallet = await Wallet.findById(userId);
      if (wallet) {
        console.log(`Deleting wallet for user ${userId}`);
        await Wallet.findByIdAndDelete(userId);
      }

      // 2. Delete Agent Code (if exists)
      const agentCode = await AgentCode.findOne({ createdFor: userId });
      if (agentCode) {
        console.log(`Deleting agent code ${agentCode.code} for user ${userId}`);
        await AgentCode.findByIdAndDelete(agentCode._id);
      }

      // 3. Delete SkyIDs owned by this user
      const skyIds = await SkyId.find({ userId: userId });
      if (skyIds.length > 0) {
        console.log(`Deleting ${skyIds.length} SkyIDs for user ${userId}`);
        for (const skyId of skyIds) {
          // Delete related transactions for this SkyID
          await Transaction.deleteMany({ skyId: skyId.skyId });
          // Delete related switch team requests
          await SwitchTeamRequest.deleteMany({ skyId: skyId.skyId });
          // Delete related customer enablement requests
          await CustomerEnablementRequest.deleteMany({ skyId: skyId.skyId });
        }
        await SkyId.deleteMany({ userId: userId });
      }

      // 4. Delete Transactions (by account number if wallet existed)
      if (wallet) {
        console.log(`Deleting transactions for account ${wallet.accountNumber}`);
        await Transaction.deleteMany({ accountNumber: wallet.accountNumber });
      }

      // 5. Delete KYC data
      const kyc = await Kyc.findOne({ user_id: userId });
      if (kyc) {
        console.log(`Deleting KYC data for user ${userId}`);
        await Kyc.findByIdAndDelete(kyc._id);
      }

      // 6. Delete Switch Team Requests created by this user
      const switchRequests = await SwitchTeamRequest.find({ createdBy: userId });
      if (switchRequests.length > 0) {
        console.log(`Deleting ${switchRequests.length} switch team requests created by user ${userId}`);
        await SwitchTeamRequest.deleteMany({ createdBy: userId });
      }

      // 7. Delete Customer Enablement Requests handled by this user
      const customerRequests = await CustomerEnablementRequest.find({ handledBy: userId });
      if (customerRequests.length > 0) {
        console.log(`Deleting ${customerRequests.length} customer enablement requests handled by user ${userId}`);
        await CustomerEnablementRequest.deleteMany({ handledBy: userId });
      }

      // 8. If this user is a Channel Partner, clean up VSOs created by them
      if (user.accountType === "Channel_Partner") {
        console.log(`Cleaning up VSOs created by Channel Partner ${userId}`);
        const vsos = await User.find({ createdBy: userId, accountType: "VSO" });
        
        for (const vso of vsos) {
          // Recursively clean up VSO data
          console.log(`Cleaning up VSO ${vso._id} created by Channel Partner ${userId}`);
          
          // Delete VSO's wallet
          const vsoWallet = await Wallet.findById(vso._id);
          if (vsoWallet) {
            await Wallet.findByIdAndDelete(vso._id);
            await Transaction.deleteMany({ accountNumber: vsoWallet.accountNumber });
          }
          
          // Delete VSO's agent code
          const vsoAgentCode = await AgentCode.findOne({ createdFor: vso._id });
          if (vsoAgentCode) {
            await AgentCode.findByIdAndDelete(vsoAgentCode._id);
          }
          
          // Delete VSO's SkyIDs
          const vsoSkyIds = await SkyId.find({ userId: vso._id });
          for (const vsoSkyId of vsoSkyIds) {
            await Transaction.deleteMany({ skyId: vsoSkyId.skyId });
            await SwitchTeamRequest.deleteMany({ skyId: vsoSkyId.skyId });
            await CustomerEnablementRequest.deleteMany({ skyId: vsoSkyId.skyId });
          }
          await SkyId.deleteMany({ userId: vso._id });
          
          // Delete VSO's KYC
          const vsoKyc = await Kyc.findOne({ user_id: vso._id });
          if (vsoKyc) {
            await Kyc.findByIdAndDelete(vsoKyc._id);
          }
          
          // Delete VSO's switch requests
          await SwitchTeamRequest.deleteMany({ createdBy: vso._id });
          await CustomerEnablementRequest.deleteMany({ handledBy: vso._id });
          
          // Finally delete the VSO user
          await User.findByIdAndDelete(vso._id);
        }
      }

      // 9. Finally delete the user
      console.log(`Deleting user ${userId}`);
      await User.findByIdAndDelete(userId);

      console.log(`Successfully deleted user ${userId} and all related data`);
      return res.status(200).json({ message: "User and all related data have been deleted successfully." });
    } catch (error) {
      console.error(`Error deleting user ${userId}:`, error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getDashboardStats(req: Request, res: Response) {
    try {
      // Check if current user is an Admin user
      const adminUser = await AdminUser.findById(req.user!._id);
      if (!adminUser) {
        return res.status(403).send({ message: "You are not authorized to access dashboard statistics." });
      }

      // Get all statistics in parallel
      const [
        totalSkyIds,
        activeSkyIds,
        totalMappedLines,
        totalAddOns,
        totalChannelPartners,
        blockedAccounts,
        pendingSwitchRequests,
        completedSwitchRequests,
        allTimeSwitchRequests,
        pendingFinanceRequests,
        completedFinanceRequests,
        allTimeFinanceRequests,
        pendingCustomerRequests,
        completedCustomerRequests,
        allTimeCustomerRequests,
      ] = await Promise.all([
        // SkyID Numbers
        SkyId.countDocuments(),
        SkyId.countDocuments({ status: "active" }),
        
        // Mapped Lines (total mapped numbers across all SkyIDs)
        SkyId.aggregate([
          { $unwind: "$mappedNumbers" },
          { $count: "total" }
        ]).then(result => result[0]?.total || 0),
        
        // Add Ons (SkyIDs with IVR or IVM)
        SkyId.countDocuments({ $or: [{ withIVR: true }, { withIVM: true }] }),
        
        // Channel Partners
        User.countDocuments({ accountType: "Channel_Partner" }),
        
        // Blocked Accounts
        User.countDocuments({ status: "blocked" }),
        
        // Switch Team Requests
        SwitchTeamRequest.countDocuments({ status: "pending" }),
        SwitchTeamRequest.countDocuments({ status: "completed" }),
        SwitchTeamRequest.countDocuments(),
        
        // Finance Team Requests
        FinanceTeamRequest.countDocuments({ status: "pending" }),
        FinanceTeamRequest.countDocuments({ status: "completed" }),
        FinanceTeamRequest.countDocuments(),
        
        // Customer Enablement Requests
        CustomerEnablementRequest.countDocuments({ status: "pending" }),
        CustomerEnablementRequest.countDocuments({ status: "completed" }),
        CustomerEnablementRequest.countDocuments(),
      ]);

      const stats = {
        skyIdNumbers: totalSkyIds,
        mappedLines: totalMappedLines,
        addOns: totalAddOns,
        channelPartners: totalChannelPartners,
        blockedAccounts: blockedAccounts,
        pendingRequests: pendingSwitchRequests + pendingFinanceRequests,
        completedRequests: completedSwitchRequests + completedFinanceRequests,
        allTimeRequests: allTimeSwitchRequests + allTimeFinanceRequests,
        pendingIvrRequests: pendingCustomerRequests,
        completedIvrRequests: completedCustomerRequests,
        allTimeIvrRequests: allTimeCustomerRequests,
      };

      return res.status(200).json({ 
        message: "success", 
        data: stats 
      });
    } catch (error) {
      console.error("Error fetching dashboard statistics:", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
