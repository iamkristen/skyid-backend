import { Response, Request } from "express";
import Bcrypt from "../utils/bcryptService";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import User from "../user/user.model";
import ValidateAuthSchema from "./auth.schema";
import Otp from "../user/user.otp.model";
import EmailService from "../utils/EmailService";
import generate from "../utils/generate";
import { generateOtp } from "../utils/generateOtp";
import AgentCode from "../agent/agent.code.model";
import Wallet from "../wallet/wallet.model";
import { type ClientSession, startSession } from "mongoose";
import axios from "axios";

dotenv.config();

export default class AuthController {
  static async signin(req: Request, res: Response) {
    const { email, password } = req.body;
    try {
      const { error } = ValidateAuthSchema.signIn({ email, password });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
      if (!user) return res.status(400).send({ message: "Invalid email or password." });

      if (user.status === "blocked") {
        return res.status(403).send({ message: "Your account has been blocked. Please contact support." });
      }

      if (!Bcrypt.shared().compare(password, user.password as string))
        return res.status(400).send({ message: "Invalid email or password." });

      const JWT_KEY = process.env.JWT_PRIVATE_KEY as string;

      // If 2FA is enabled, return pending token so frontend can show 2FA verify step
      if ((user as any).twoFactorEnabled) {
        const pendingToken = jwt.sign(
          { _id: user._id, pending2FA: true, purpose: "verify" },
          JWT_KEY,
          { expiresIn: "15m" }
        );
        return res.status(200).json({
          message: "success",
          accessToken: pendingToken,
          requiresTwoFactorVerify: true,
        });
      }

      const token = jwt.sign({ _id: user._id }, JWT_KEY, { expiresIn: "7d" });

      // Get user profile data (excluding password)
      const profileData = await User.findById(user._id).select("-password -__v -twoFactorSecret");

      if (!profileData) {
        return res.status(500).json({ message: "Error fetching user data" });
      }

      // If user is an agent, get their agentCode
      if (profileData.accountType === "Agent") {
        const agentCodeData = await AgentCode.findOne({ createdFor: profileData._id });
        if (agentCodeData) {
          profileData.agentCode = agentCodeData.code;
        }
      }

      // If user is a VSO, get their parent Channel Partner's level to determine wallet/agentCode access
      if (profileData.accountType === "VSO" && profileData.createdBy) {
        const parentChannelPartner = await User.findById(profileData.createdBy).select("channelPartnerLevel");
        if (parentChannelPartner) {
          (profileData as any).parentChannelPartnerLevel = parentChannelPartner.channelPartnerLevel;
        }
      }

      return res.status(200).json({
        message: "success",
        accessToken: token,
        data: profileData,
        mustChangePassword: !!(profileData as any).mustChangePassword,
      });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async resetPassword(req: Request, res: Response) {
    const { email, otp, password } = req.body;
    try {
      const { value, error } = ValidateAuthSchema.resetPassword({
        email,
        password,
        otp,
      });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ email: value.email });
      if (!user) return res.status(400).send({ message: "Email does not exist." });

      const getOtp = await Otp.findOne({ email: value.email });
      if (!getOtp) return res.status(400).send({ message: "No otp records found" });

      // checking for expired code
      const { expiresAt } = getOtp;
      if (Number(expiresAt) < Date.now()) {
        await Otp.deleteOne({ email: value.email });
        return res.status(400).send({ message: "Code has expired. Request for a new one." });
      }

      //comparing otp
      if (!Bcrypt.shared().compare(otp, getOtp.otp)) return res.status(400).send({ message: "Invalid otp code." });

      // updating password
      await User.updateOne({ email: value.email }, { password: Bcrypt.shared().encode(value.password) });
      // clear any old record
      await Otp.deleteOne({ email: user.email });

      // send email
      EmailService.sendResetPasswordConfirmation(email, user.firstName!);

      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async setNewPassword(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { error, value } = ValidateAuthSchema.setNewPassword(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!(user as any).mustChangePassword) {
        return res.status(400).json({ message: "Password was already changed. You can use the normal change password flow from your profile." });
      }

      await User.updateOne(
        { _id: userId },
        { password: Bcrypt.shared().encode(value.newPassword), mustChangePassword: false }
      );

      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async changePassword(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { error, value } = ValidateAuthSchema.changePassword(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!Bcrypt.shared().compare(value.currentPassword, user.password as string)) {
        return res.status(400).json({ message: "Current password is incorrect." });
      }

      await User.updateOne({ _id: userId }, { password: Bcrypt.shared().encode(value.newPassword) });
      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async twoFactorSetup(req: Request, res: Response) {
    try {
      const userId = req.user!._id;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found." });
      if ((user as any).twoFactorEnabled) return res.status(400).json({ message: "2FA is already enabled." });

      const secret = speakeasy.generateSecret({
        name: `SkyID (${user.email})`,
        length: 20,
      });

      await User.updateOne({ _id: userId }, { twoFactorSecret: secret.base32 });
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

      const user = await User.findById(req.user!._id);
      if (!user || !(user as any).twoFactorSecret)
        return res.status(400).json({ message: "2FA setup not started. Please request setup again." });

      const valid = speakeasy.totp.verify({
        secret: (user as any).twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1,
      });
      if (!valid) return res.status(400).json({ message: "Invalid code. Please try again." });

      await User.updateOne({ _id: user._id }, { twoFactorEnabled: true });
      const token = jwt.sign(
        { _id: user._id },
        process.env.JWT_PRIVATE_KEY as string,
        { expiresIn: "7d" }
      );
      return res.status(200).json({ message: "success", accessToken: token });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async twoFactorVerify(req: Request, res: Response) {
    try {
      const { code } = req.body as { code: string };
      if (!code || !/^\d{6}$/.test(code))
        return res.status(400).json({ message: "Please enter a valid 6-digit code." });

      const user = await User.findById(req.user!._id);
      if (!user || !(user as any).twoFactorEnabled || !(user as any).twoFactorSecret)
        return res.status(400).json({ message: "2FA is not enabled for this account." });

      const valid = speakeasy.totp.verify({
        secret: (user as any).twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1,
      });
      if (!valid) return res.status(400).json({ message: "Invalid code. Please try again." });

      const token = jwt.sign(
        { _id: user._id },
        process.env.JWT_PRIVATE_KEY as string,
        { expiresIn: "7d" }
      );
      const profileData = await User.findById(user._id).select("-password -__v -twoFactorSecret");
      if (!profileData) return res.status(500).json({ message: "Error fetching user data" });
      if (profileData.accountType === "Agent") {
        const agentCodeData = await AgentCode.findOne({ createdFor: profileData._id });
        if (agentCodeData) (profileData as any).agentCode = agentCodeData.code;
      }
      if (profileData.accountType === "VSO" && profileData.createdBy) {
        const parent = await User.findById(profileData.createdBy).select("channelPartnerLevel");
        if (parent) (profileData as any).parentChannelPartnerLevel = parent.channelPartnerLevel;
      }
      return res.status(200).json({ message: "success", accessToken: token, data: profileData });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async twoFactorDisable(req: Request, res: Response) {
    try {
      const { code } = req.body as { code: string };
      if (!code || !/^\d{6}$/.test(code))
        return res.status(400).json({ message: "Please enter a valid 6-digit code from your authenticator app." });

      const user = await User.findById(req.user!._id);
      if (!user || !(user as any).twoFactorEnabled || !(user as any).twoFactorSecret)
        return res.status(400).json({ message: "2FA is not enabled for this account." });

      const valid = speakeasy.totp.verify({
        secret: (user as any).twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1,
      });
      if (!valid) return res.status(400).json({ message: "Invalid code. Please try again." });

      await User.updateOne(
        { _id: user._id },
        { $set: { twoFactorEnabled: false }, $unset: { twoFactorSecret: "" } }
      );
      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async verifyUserEmail(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const { value, error } = ValidateAuthSchema.forgotPassword({ email });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ email: value.email });
      if (!user) return res.status(400).send({ message: "User does not exist" });

      // clear any old record
      await Otp.deleteOne({ email: user.email });

      const getOtp = generate.otp();
      await new Otp({
        email,
        otp: Bcrypt.shared().encode(getOtp),
        createdAt: Date.now(),
        expiresAt: Date.now() + 5_00_000,
      }).save();

      // send email
      EmailService.sendOTPEmail(email, user.firstName!, getOtp);

      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Service Error" });
    }
  }

  static async confirmUserEmail(req: Request, res: Response) {
    const { email, otp } = req.body;
    try {
      const { value, error } = ValidateAuthSchema.confirmEmail({ email, otp });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ email: value.email });
      if (!user) return res.status(400).send({ message: "Email does not exist." });

      const getOtp = await Otp.findOne({ email: value.email });
      if (!getOtp) return res.status(400).send({ message: "No otp records found" });

      // checking for expired code
      const { expiresAt } = getOtp;
      if (Number(expiresAt) < Date.now()) {
        await Otp.deleteOne({ email: value.email });
        return res.status(400).send({ message: "Code has expired. Request for a new one." });
      }

      //comparing otp
      if (!Bcrypt.shared().compare(otp, getOtp.otp)) return res.status(400).send({ message: "Invalid otp code." });

      // clear any old record
      await Otp.deleteOne({ email: user.email });

      const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });
      return res.status(200).json({ message: "success", token });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const { value, error } = ValidateAuthSchema.forgotPassword({ email });
      if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ email: value.email });
      if (!user) return res.status(400).send({ message: "User does not exist" });

      // clear any old record
      await Otp.deleteOne({ email: user.email });

      const getOtp = generateOtp();
      await new Otp({
        email,
        otp: Bcrypt.shared().encode(getOtp),
        createdAt: Date.now(),
        expiresAt: Date.now() + 5_00_000,
      }).save();

      EmailService.sendForgotPasswordEmail(email, user.firstName!, getOtp);

      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Service Error" });
    }
  }

  static async checkEmail(req: Request, res: Response) {
    const { email, firstName } = req.body;
    try {
      const { error } = ValidateAuthSchema.checkEmail(email);
      if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ email });
      if (user) return res.status(400).send({ message: "email is already taken." });

      await Otp.deleteOne({ email });

      const getOtp = generate.otp();
      console.log({ getOtp });
      await new Otp({
        email,
        otp: Bcrypt.shared().encode(getOtp),
        createdAt: Date.now(),
        expiresAt: Date.now() + 5_00_000,
      }).save();

      EmailService.sendOTPEmail(email, firstName, getOtp);

      res.status(201).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async verifyNewUser(req: Request, res: Response) {
    const { email, otp } = req.body;
    try {
      const { value, error } = ValidateAuthSchema.confirmEmail({ email, otp });
      if (error) return res.status(400).send(error.details[0].message);

      const getOtp = await Otp.findOne({ email: value.email });
      if (!getOtp) return res.status(400).send({ message: "No otp records found" });

      // checking for expired code
      const { expiresAt } = getOtp;
      if (Number(expiresAt) < Date.now()) {
        await Otp.deleteOne({ email: value.email });
        return res.status(400).send({ message: "Code has expired. Request for a new one." });
      }

      //comparing otp
      if (!Bcrypt.shared().compare(otp, getOtp.otp)) return res.status(400).send({ message: "Invalid otp code." });

      // clear any old record
      await Otp.deleteOne({ email });
      return res.status(200).json({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async googleSignIn(req: Request, res: Response) {
    try {
      const { error, value } = ValidateAuthSchema.googleSignIn(req.body);
      if (error) return res.status(400).send(error.details[0].message);

      // Verify the Google OAuth ID token using Google's tokeninfo endpoint
      let decodedToken: any;
      try {
        const response = await axios.get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${value.idToken}`
        );
        decodedToken = response.data;

        // Verify the audience (client ID) matches
        const expectedClientId = "76702274216-9fnpr1k03fcsbvroda2c5ckq32o8qnov.apps.googleusercontent.com";
        if (decodedToken.aud !== expectedClientId) {
          console.error('❌ [GOOGLE SIGN-IN] Audience mismatch. Expected:', expectedClientId, 'Got:', decodedToken.aud);
          return res.status(401).send({
            message: "Invalid Google token - audience mismatch."
          });
        }
      } catch (error: any) {
        console.error('❌ [GOOGLE SIGN-IN] Token verification failed:', error);
        console.error('❌ [GOOGLE SIGN-IN] Error message:', error?.message);
        console.error('❌ [GOOGLE SIGN-IN] Token length:', value.idToken?.length);
        console.error('❌ [GOOGLE SIGN-IN] Token preview:', value.idToken?.substring(0, 50));
        return res.status(401).send({
          message: "Invalid Google token.",
          error: error?.message || "Token verification failed"
        });
      }

      const email = decodedToken.email;
      const name = decodedToken.name;
      const picture = decodedToken.picture;
      if (!email) {
        return res.status(400).send({ message: "Email not provided by Google." });
      }

      // Check if user already exists
      let user = await User.findOne({ email: email.toLowerCase().trim() });

      if (user) {
        // User exists - just sign them in
        if (user.status === "blocked") {
          return res.status(403).send({ message: "Your account has been blocked. Please contact support." });
        }

        // Get user profile data
        const profileData = await User.findById(user._id).select("-password -__v");

        if (!profileData) {
          return res.status(500).json({ message: "Error fetching user data" });
        }

        // If user is an agent, get their agentCode
        if (profileData.accountType === "Agent") {
          const agentCodeData = await AgentCode.findOne({ createdFor: profileData._id });
          if (agentCodeData) {
            profileData.agentCode = agentCodeData.code;
          }
        }

        // If user is a VSO, get their parent Channel Partner's level
        if (profileData.accountType === "VSO" && profileData.createdBy) {
          const parentChannelPartner = await User.findById(profileData.createdBy).select("channelPartnerLevel");
          if (parentChannelPartner) {
            (profileData as any).parentChannelPartnerLevel = parentChannelPartner.channelPartnerLevel;
          }
        }

        const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });

        return res.status(200).json({
          message: "success",
          accessToken: token,
          data: profileData
        });
      } else {
        // New user - return needs_signup response with Google user info
        const nameParts = name ? name.split(" ") : [];
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        return res.status(200).json({
          message: "needs_signup",
          needsSignup: true,
          googleUser: {
            email: email.toLowerCase().trim(),
            firstName,
            lastName,
            picture: picture || null,
          }
        });
      }
    } catch (error) {
      console.error('Error in Google Sign-In:', error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async completeGoogleSignIn(req: Request, res: Response) {
    let session: ClientSession | undefined = undefined;
    const useTransactions = process.env.USE_MONGODB_TRANSACTIONS === 'true';

    try {
      const { idToken, phoneNumber, country, state, accountType, businessName, businessType } = req.body;

      if (!idToken || !phoneNumber || !country) {
        return res.status(400).send({ message: "idToken, phoneNumber, and country are required." });
      }

      // Verify the Google OAuth ID token using Google's tokeninfo endpoint
      let decodedToken: any;
      try {
        const response = await axios.get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
        );
        decodedToken = response.data;

        const expectedClientId = "76702274216-9fnpr1k03fcsbvroda2c5ckq32o8qnov.apps.googleusercontent.com";
        if (decodedToken.aud !== expectedClientId) {
          console.error('❌ [COMPLETE GOOGLE SIGN-IN] Audience mismatch. Expected:', expectedClientId, 'Got:', decodedToken.aud);
          return res.status(401).send({
            message: "Invalid Google token - audience mismatch."
          });
        }
      } catch (error: any) {
        console.error('❌ [COMPLETE GOOGLE SIGN-IN] Token verification failed:', error);
        console.error('❌ [COMPLETE GOOGLE SIGN-IN] Error message:', error?.message);
        return res.status(401).send({
          message: "Invalid Google token.",
          error: error?.message || "Token verification failed"
        });
      }

      const email = decodedToken.email;
      const name = decodedToken.name;
      if (!email) {
        return res.status(400).send({ message: "Email not provided by Google." });
      }

      // Check if user already exists (should not exist at this point, but check anyway)
      let user = await User.findOne({ email: email.toLowerCase().trim() });
      if (user) {
        // User already exists - sign them in instead
        if (user.status === "blocked") {
          return res.status(403).send({ message: "Your account has been blocked. Please contact support." });
        }

        const profileData = await User.findById(user._id).select("-password -__v");
        if (!profileData) {
          return res.status(500).json({ message: "Error fetching user data" });
        }

        if (profileData.accountType === "Agent") {
          const agentCodeData = await AgentCode.findOne({ createdFor: profileData._id });
          if (agentCodeData) {
            profileData.agentCode = agentCodeData.code;
          }
        }

        if (profileData.accountType === "VSO" && profileData.createdBy) {
          const parentChannelPartner = await User.findById(profileData.createdBy).select("channelPartnerLevel");
          if (parentChannelPartner) {
            (profileData as any).parentChannelPartnerLevel = parentChannelPartner.channelPartnerLevel;
          }
        }

        const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });

        return res.status(200).json({
          message: "success",
          accessToken: token,
          data: profileData
        });
      }

      // Create new user account
      if (useTransactions) {
        session = await startSession();
        session.startTransaction();
      }

      const nameParts = name ? name.split(" ") : [];
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      user = new User({
        firstName,
        lastName,
        email: email.toLowerCase().trim(),
        phoneNumber,
        country,
        state: state || undefined,
        accountType: accountType || "Individual",
        businessName: businessName || undefined,
        businessType: businessType || undefined,
        verified: "true", // Google verified email
        status: "active",
      });

      await user.save(session ? { session } : {});

      // Create wallet for new user
      let accountNumber;
      let isUnique = false;
      while (!isUnique) {
        accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
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

      // Send welcome email
      EmailService.sendWelcomeEmail(email, firstName);

      const profileData = await User.findById(user._id).select("-password -__v");

      if (profileData?.accountType === "Agent") {
        const agentCodeData = await AgentCode.findOne({ createdFor: profileData._id });
        if (agentCodeData) {
          profileData.agentCode = agentCodeData.code;
        }
      }

      const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });

      if (session) {
        await session.commitTransaction();
        await session.endSession();
      }

      return res.status(200).json({
        message: "success",
        accessToken: token,
        data: profileData
      });
    } catch (error) {
      if (session) {
        await session.abortTransaction();
        await session.endSession();
      }
      console.error('Error completing Google Sign-In:', error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
