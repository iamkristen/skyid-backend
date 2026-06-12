import { Response, Request, NextFunction } from "express";
import Bcrypt from "../utils/bcryptService";
import { sendMail } from "../utils/sendMail";
import { registration } from "../views/email-template";
import dotenv from "dotenv";
import AdminUser from "./admin.model";
import validation from "./admin.schema";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import EmailService from "../utils/EmailService";
import { generatePassword, generateOtp } from "../utils/generateOtp";
import User from "../user/user.model";
import Otp from "../user/user.otp.model";
import Wallet from "../wallet/wallet.model";
import AgentCode from "../agent/agent.code.model";
import SkyId from "../smart-number/number.skyId.model";
import Transaction from "../wallet/wallet.transaction.model";
import Kyc from "../kyc/kyc.model";
import SwitchTeamRequest from "../switch/switch.model";
import CustomerEnablementRequest from "../customer-enablement/customer.model";
import AddonSync from "../smart-number/addon.model";
import FinanceTeamRequest from "../finance/finance.model";

dotenv.config();

/** Normalize admin document to array of role keys (lowercase). Supports both legacy `role` and new `roles`. */
export function getAdminRoles(admin: { role?: string; roles?: string[] } | null): string[] {
  if (!admin) return [];
  const raw = admin.roles?.length ? admin.roles : admin.role ? [admin.role] : [];
  return raw.map((r) => (r || "").toLowerCase().replace(/\s+/g, "_"));
}

function getBrowserFromUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return "Unknown browser";
  const ua = userAgent.toLowerCase();
  if (ua.includes("edg/")) return "Microsoft Edge";
  if (ua.includes("chrome")) return "Chrome";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("safari") && !ua.includes("chrome")) return "Safari";
  if (ua.includes("opr") || ua.includes("opera")) return "Opera";
  return "Unknown browser";
}

/** Normalize to IPv4 when possible (e.g. ::ffff:192.168.1.1 -> 192.168.1.1). */
function toIPv4(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return trimmed;
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(trimmed);
  if (mapped) return mapped[1];
  return trimmed;
}

function getLocationFromRequest(req: Request): string {
  const forwarded = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim();
  const remote = req.socket?.remoteAddress;
  const raw = forwarded || remote || "";
  if (!raw || raw === "1" || raw === "::1" || raw === "127.0.0.1") return "Unknown location";
  if (raw === "::ffff:127.0.0.1") return "Unknown location";
  const looksLikeIp = /^[\da-f.:]+$/i.test(raw) && (raw.includes(".") || raw.includes(":"));
  if (!looksLikeIp) return raw;
  const ipV4 = toIPv4(raw);
  return `IP: ${ipV4}`;
}

export default class UserManagementController {
  static async signup(req: Request, res: Response) {
    try {
      const { error } = validation.signup({ ...req.body });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await AdminUser.findOne({ email: req.body.email });
      if (user) return res.status(400).send({ message: "Email is taken already." });

      const tempPassword = generatePassword(12);
      const rolesArr =
        Array.isArray(req.body.roles) && req.body.roles.length > 0
          ? req.body.roles.map((r: string) => (r || "").toLowerCase().replace(/\s+/g, "_"))
          : req.body.role
            ? [(req.body.role as string).toLowerCase().replace(/\s+/g, "_")]
            : [];
      user = new AdminUser({
        ...req.body,
        role: rolesArr[0] ?? req.body.role,
        roles: rolesArr.length > 0 ? rolesArr : undefined,
        verified: "false",
        password: Bcrypt.shared().encode(tempPassword),
      });

      await user.save();

      const loginUrl = "https://admin.dev.skyid.ng";
      await EmailService.sendAdminAccountCreated(
        req.body.email,
        [req.body.firstName, req.body.lastName].filter(Boolean).join(" ") || "Admin",
        req.body.email,
        tempPassword,
        loginUrl
      );

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

      const user = await AdminUser.findOne({ email: req.body.email });
      if (!user) return res.status(400).send({ message: "Invalid email or password." });

      if (!Bcrypt.shared().compare(password, user.password as string))
        return res.status(400).send({ message: "Invalid email or password." });

      const JWT_KEY = process.env.JWT_PRIVATE_KEY as string;

      // 2FA enabled: require authenticator code
      if (user.twoFactorEnabled) {
        const pendingToken = jwt.sign({ _id: user._id, pending2FA: true, purpose: "verify" }, JWT_KEY, {
          expiresIn: "15m",
        });
        return res.status(200).json({
          message: "success",
          accessToken: pendingToken,
          requiresTwoFactorVerify: true,
        });
      }

      // 2FA disabled: ask admin to choose 2FA or email OTP (first-time or after disabling)
      const pendingToken = jwt.sign({ _id: user._id, pending2FA: true, purpose: "choose" }, JWT_KEY, {
        expiresIn: "15m",
      });
      return res.status(200).json({
        message: "success",
        accessToken: pendingToken,
        requiresVerificationChoice: true,
      });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async twoFactorSetup(req: Request, res: Response) {
    try {
      const adminId = req.user!._id;
      const admin = await AdminUser.findById(adminId);
      if (!admin) return res.status(404).json({ message: "Admin not found." });
      if (admin.twoFactorEnabled) return res.status(400).json({ message: "2FA is already enabled." });

      const secret = speakeasy.generateSecret({
        name: `SkyID Admin (${admin.email})`,
        length: 20,
      });

      admin.twoFactorSecret = secret.base32;
      await admin.save();

      const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url!);
      return res.status(200).json({
        message: "success",
        data: { secret: secret.base32, qrCodeUrl: qrDataUrl },
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async twoFactorConfirmSetup(req: Request, res: Response) {
    try {
      const { code } = req.body as { code: string };
      if (!code || !/^\d{6}$/.test(code))
        return res.status(400).json({ message: "Please enter a valid 6-digit code." });

      const admin = await AdminUser.findById(req.user!._id);
      if (!admin || !admin.twoFactorSecret)
        return res.status(400).json({ message: "2FA setup not started. Please request setup again." });

      const valid = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1,
      });
      if (!valid) return res.status(400).json({ message: "Invalid code. Please try again." });

      admin.twoFactorEnabled = true;
      await admin.save();

      const fullToken = jwt.sign({ _id: admin._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: "7d" });

      const location = getLocationFromRequest(req);
      const browser = getBrowserFromUserAgent(req.headers["user-agent"]);
      const loginTime = new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
      EmailService.sendAdminLoginSecurityAlert(
        admin.email!,
        [admin.firstName, admin.lastName].filter(Boolean).join(" ") || "Admin",
        location,
        browser,
        loginTime
      ).catch((err) => console.error("Admin login security email failed:", err));

      return res.status(200).json({ message: "success", accessToken: fullToken });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async twoFactorVerify(req: Request, res: Response) {
    try {
      const { code } = req.body as { code: string };
      if (!code || !/^\d{6}$/.test(code))
        return res.status(400).json({ message: "Please enter a valid 6-digit code." });

      const admin = await AdminUser.findById(req.user!._id);
      if (!admin || !admin.twoFactorEnabled || !admin.twoFactorSecret)
        return res.status(400).json({ message: "2FA is not enabled for this account." });

      const valid = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1,
      });
      if (!valid) return res.status(400).json({ message: "Invalid code. Please try again." });

      const fullToken = jwt.sign({ _id: admin._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: "7d" });

      const location = getLocationFromRequest(req);
      const browser = getBrowserFromUserAgent(req.headers["user-agent"]);
      const loginTime = new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
      EmailService.sendAdminLoginSecurityAlert(
        admin.email!,
        [admin.firstName, admin.lastName].filter(Boolean).join(" ") || "Admin",
        location,
        browser,
        loginTime
      ).catch((err) => console.error("Admin login security email failed:", err));

      return res.status(200).json({ message: "success", accessToken: fullToken });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async twoFactorDisable(req: Request, res: Response) {
    try {
      const { code } = req.body as { code: string };
      if (!code || !/^\d{6}$/.test(code))
        return res.status(400).json({ message: "Please enter a valid 6-digit code from your authenticator app." });

      const admin = await AdminUser.findById(req.user!._id);
      if (!admin || !admin.twoFactorEnabled || !admin.twoFactorSecret)
        return res.status(400).json({ message: "2FA is not enabled for this account." });

      const valid = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1,
      });
      if (!valid) return res.status(400).json({ message: "Invalid code. Please try again." });

      await AdminUser.updateOne(
        { _id: admin._id },
        { $set: { twoFactorEnabled: false }, $unset: { twoFactorSecret: 1 } }
      );
      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async sendLoginOtp(req: Request, res: Response) {
    try {
      const admin = await AdminUser.findById(req.user!._id);
      if (!admin) return res.status(404).json({ message: "Admin not found." });

      await Otp.deleteMany({ email: admin.email });
      const loginOtp = generateOtp();
      await new Otp({
        email: admin.email,
        otp: Bcrypt.shared().encode(loginOtp),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      }).save();
      await EmailService.sendAdminLoginOtp(
        admin.email!,
        [admin.firstName, admin.lastName].filter(Boolean).join(" ") || "Admin",
        loginOtp
      ).catch((err) => console.error("Admin login OTP email failed:", err));

      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async verifyLoginOtp(req: Request, res: Response) {
    try {
      const { code } = req.body as { code: string };
      if (!code || !/^\d{6}$/.test(code))
        return res.status(400).json({ message: "Please enter a valid 6-digit code." });

      const admin = await AdminUser.findById(req.user!._id);
      if (!admin) return res.status(404).json({ message: "Admin not found." });

      const otpDoc = await Otp.findOne({ email: admin.email });
      if (!otpDoc) return res.status(400).json({ message: "No login code found. Please sign in again." });
      const expiresAt = otpDoc.expiresAt ? new Date(otpDoc.expiresAt).getTime() : 0;
      if (expiresAt < Date.now()) {
        await Otp.deleteOne({ email: admin.email });
        return res.status(400).json({ message: "Code has expired. Please sign in again." });
      }
      if (!Bcrypt.shared().compare(code, otpDoc.otp as string))
        return res.status(400).json({ message: "Invalid code. Please try again." });

      await Otp.deleteOne({ email: admin.email });

      const fullToken = jwt.sign({ _id: admin._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: "7d" });

      const location = getLocationFromRequest(req);
      const browser = getBrowserFromUserAgent(req.headers["user-agent"]);
      const loginTime = new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
      EmailService.sendAdminLoginSecurityAlert(
        admin.email!,
        [admin.firstName, admin.lastName].filter(Boolean).join(" ") || "Admin",
        location,
        browser,
        loginTime
      ).catch((err) => console.error("Admin login security email failed:", err));

      return res.status(200).json({ message: "success", accessToken: fullToken });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async userProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profileData = await AdminUser.findById(req.user?._id).select("-password -__v -twoFactorSecret").lean();
      const roles = getAdminRoles(profileData as { role?: string; roles?: string[] });
      return res.status(200).json({ message: "success", data: { ...profileData, roles } });
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
      const admins = await AdminUser.find({}).select("-password -__v").sort({ date: -1 }).lean();
      const withRoles = admins.map((a) => ({ ...a, roles: getAdminRoles(a as { role?: string; roles?: string[] }) }));
      return res.status(200).json({ message: "success", data: withRoles });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async updateAdmin(req: Request, res: Response) {
    const { userId } = req.params;
    const currentUserId = req.user!._id;

    try {
      const currentAdmin = await AdminUser.findById(currentUserId);
      if (!currentAdmin) {
        return res.status(403).send({ message: "You are not authorized to update admin users." });
      }
      if (!getAdminRoles(currentAdmin).includes("super_admin")) {
        return res.status(403).send({ message: "Only Super Admin can update admin users." });
      }

      const adminToUpdate = await AdminUser.findById(userId);
      if (!adminToUpdate) {
        return res.status(404).send({ message: "Admin not found." });
      }

      const { firstName, lastName, email, phoneNumber, role, roles, verified, status } = req.body;
      const updates: Record<string, unknown> = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (email !== undefined) updates.email = email;
      if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
      if (roles !== undefined && Array.isArray(roles)) {
        const rolesArr = roles.map((r: string) => (r || "").toLowerCase().replace(/\s+/g, "_"));
        updates.roles = rolesArr;
        updates.role = rolesArr[0] ?? null;
      } else if (role !== undefined) {
        updates.role = role;
        const rolesArr = [(role as string).toLowerCase().replace(/\s+/g, "_")];
        updates.roles = rolesArr;
      }
      if (verified !== undefined) updates.verified = verified;
      if (status !== undefined) updates.status = status;

      await AdminUser.findByIdAndUpdate(userId, { $set: updates });
      const updated = await AdminUser.findById(userId).select("-password -__v").lean();
      const withRoles = updated
        ? { ...updated, roles: getAdminRoles(updated as { role?: string; roles?: string[] }) }
        : updated;
      return res.status(200).json({ message: "Admin updated successfully.", data: withRoles });
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
        if (!getAdminRoles(adminUser).includes("super_admin")) {
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
          await AddonSync.deleteMany({ skyId: skyId.skyId });
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
            await AddonSync.deleteMany({ skyId: vsoSkyId.skyId });
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
        SkyId.aggregate([{ $unwind: "$mappedNumbers" }, { $count: "total" }]).then((result) => result[0]?.total || 0),

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
        data: stats,
      });
    } catch (error) {
      console.error("Error fetching dashboard statistics:", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** Zainpay transactions: allowed for super_admin and finance. */
  private static async requireZainpayAccess(req: Request): Promise<string[] | null> {
    const admin = await AdminUser.findById(req.user?._id).select("role roles").lean();
    const roles = getAdminRoles(admin as { role?: string; roles?: string[] });
    if (roles.includes("super_admin") || roles.includes("finance")) return roles;
    return null;
  }

  /** Money-in summary for Zainpay transactions (success only): today, week, month, all time. */
  static async getZainpayTransactionsSummary(req: Request, res: Response) {
    try {
      if (!(await UserManagementController.requireZainpayAccess(req))) {
        return res.status(403).json({ message: "Only Super Admin or Finance can view Zainpay transactions." });
      }
      const ZAINPAY_PAYMENT_TYPES = ["buyNumber", "replaceMappedLines", "buyAddons", "addMappedNumbers"];
      const baseMatch = { paymentType: { $in: ZAINPAY_PAYMENT_TYPES }, status: "success" };
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [today, week, month, allTime, failedCount] = await Promise.all([
        Transaction.aggregate([
          { $match: { ...baseMatch, createdAt: { $gte: startOfDay } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).then((r) => r[0]?.total ?? 0),
        Transaction.aggregate([
          { $match: { ...baseMatch, createdAt: { $gte: startOfWeek } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).then((r) => r[0]?.total ?? 0),
        Transaction.aggregate([
          { $match: { ...baseMatch, createdAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).then((r) => r[0]?.total ?? 0),
        Transaction.aggregate([
          { $match: { paymentType: { $in: ZAINPAY_PAYMENT_TYPES }, status: "success" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).then((r) => r[0]?.total ?? 0),
        Transaction.countDocuments({ paymentType: { $in: ZAINPAY_PAYMENT_TYPES }, status: "failed" }),
      ]);

      return res.status(200).json({
        message: "success",
        data: { today, week, month, allTime, failedCount },
      });
    } catch (error) {
      console.error("getZainpayTransactionsSummary error:", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** List Zainpay transactions with pagination; optional status filter. */
  static async getZainpayTransactions(req: Request, res: Response) {
    try {
      if (!(await UserManagementController.requireZainpayAccess(req))) {
        return res.status(403).json({ message: "Only Super Admin or Finance can view Zainpay transactions." });
      }
      const ZAINPAY_PAYMENT_TYPES = ["buyNumber", "replaceMappedLines", "buyAddons", "addMappedNumbers"];
      const page = Math.max(1, parseInt((req.query.page as string) || "1"));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
      const status = req.query.status as string | undefined;
      const match: Record<string, unknown> = { paymentType: { $in: ZAINPAY_PAYMENT_TYPES } };
      if (status && ["pending", "success", "failed"].includes(status)) match.status = status;

      const [list, total] = await Promise.all([
        Transaction.find(match)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Transaction.countDocuments(match),
      ]);

      return res.status(200).json({
        message: "success",
        data: { list, total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error("getZainpayTransactions error:", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
