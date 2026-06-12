import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../user/user.model";
import AdminUser from "../admin/admin.model";

dotenv.config();

const BLOCKED_MESSAGE = "Your account has been blocked. Please contact support.";

export const validateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: "Access Denied. No token provided" });

  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_PRIVATE_KEY as string) as {
      _id: string;
      pending2FA?: boolean;
      purpose?: "setup" | "verify" | "email_otp" | "choose";
    };
    req.user = decoded;
    const userId = decoded._id;

    // If admin has pending 2FA token, only allow specific routes by purpose
    if (decoded.pending2FA && decoded.purpose) {
      const is2faRoute = req.originalUrl.includes("/2fa/");
      const isSendLoginOtpRoute = req.originalUrl.includes("/send-login-otp");
      const isVerifyLoginOtpRoute = req.originalUrl.includes("/verify-login-otp");
      const allowed =
        is2faRoute ||
        (decoded.purpose === "email_otp" && isVerifyLoginOtpRoute) ||
        (decoded.purpose === "choose" && (is2faRoute || isSendLoginOtpRoute || isVerifyLoginOtpRoute));
      if (!allowed) {
        return res.status(403).json({
          message: "Complete verification to continue.",
          requiresTwoFactorSetup: decoded.purpose === "setup",
          requiresTwoFactorVerify: decoded.purpose === "verify",
          requiresEmailOtp: decoded.purpose === "email_otp",
          requiresVerificationChoice: decoded.purpose === "choose",
        });
      }
    }

    // Check User collection (Individual, Channel Partner, VSO, Agent, etc.)
    const user = await User.findById(userId).select("status").lean();
    if (user) {
      if (user.status === "blocked") return res.status(403).send({ message: BLOCKED_MESSAGE });
      return next();
    }

    // Check Admin collection (admins)
    const admin = await AdminUser.findById(userId).select("status").lean();
    if (admin?.status === "blocked") {
      return res.status(403).send({ message: BLOCKED_MESSAGE });
    }

    next();
  } catch (error) {
    res.status(401).send({ message: "Invalid token." });
  }
};
