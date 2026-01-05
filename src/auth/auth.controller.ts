import { Response, Request } from "express";
import Bcrypt from "../utils/bcryptService";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
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

      const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });

      // Get user profile data (excluding password)
      const profileData = await User.findById(user._id).select("-password -__v");
      
      if (!profileData) {
        return res.status(500).json({ message: "Error fetching user data" });
      }

      // Debug logging for verified status
      console.log('🔍 [LOGIN] User email:', profileData.email);
      console.log('🔍 [LOGIN] User verified status:', profileData.verified);
      console.log('🔍 [LOGIN] User verified type:', typeof profileData.verified);

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
        data: profileData 
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

  static async verifyUserEmail(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const { value, error } = ValidateAuthSchema.forgotPassword({ email });
      if (error) return res.status(400).send(error.details[0].message);

      // Normalize email (lowercase and trim) to match how it's stored in User model
      const normalizedEmail = value.email.toLowerCase().trim();

      let user = await User.findOne({ email: normalizedEmail });
      if (!user) return res.status(400).send({ message: "User does not exist" });

      // clear any old record - use normalized email
      await Otp.deleteOne({ email: normalizedEmail });

      const getOtp = generate.otp();
      console.log('🔑 [OTP] Generated OTP for existing user:', getOtp);
      console.log('📧 [OTP] Email:', normalizedEmail);
      await new Otp({
        email: normalizedEmail, // Store normalized email to match lookup
        otp: Bcrypt.shared().encode(getOtp),
        createdAt: Date.now(),
        expiresAt: Date.now() + 5_00_000,
      }).save();

      // send email - use original email for sending
      EmailService.sendOTPEmail(value.email, user.firstName!, getOtp);

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

      // Normalize email (lowercase and trim) to match how it's stored
      const normalizedEmail = value.email.toLowerCase().trim();

      let user = await User.findOne({ email: normalizedEmail });
      if (!user) return res.status(400).send({ message: "Email does not exist." });

      const getOtp = await Otp.findOne({ email: normalizedEmail });
      if (!getOtp) return res.status(400).send({ message: "No otp records found" });

      // checking for expired code
      const { expiresAt } = getOtp;
      if (Number(expiresAt) < Date.now()) {
        await Otp.deleteOne({ email: normalizedEmail });
        return res.status(400).send({ message: "Code has expired. Request for a new one." });
      }

      //comparing otp
      if (!Bcrypt.shared().compare(otp, getOtp.otp)) return res.status(400).send({ message: "Invalid otp code." });

      // Update user's verified status to true using the user's _id for more reliable update
      const updateResult = await User.updateOne({ _id: user._id }, { verified: "true" });
      console.log('✅ [VERIFY] Updated user verified status:', updateResult.modifiedCount > 0 ? 'SUCCESS' : 'FAILED');
      console.log('✅ [VERIFY] User email:', normalizedEmail);
      console.log('✅ [VERIFY] User _id:', user._id);
      console.log('✅ [VERIFY] Update result:', JSON.stringify(updateResult));

      // Refresh user to get updated data
      const updatedUser = await User.findById(user._id);
      console.log('✅ [VERIFY] User verified status after update:', updatedUser?.verified);
      if (!updatedUser || updatedUser.verified !== "true") {
        console.error('❌ [VERIFY] WARNING: User verified status was not updated correctly!');
      }

      // clear any old record
      await Otp.deleteOne({ email: normalizedEmail });

      const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });
      return res.status(200).json({ message: "success", token });
    } catch (error) {
      console.error('❌ [VERIFY] Error in confirmUserEmail:', error);
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

      // Normalize email (lowercase and trim) to match how it's stored
      const normalizedEmail = email.toLowerCase().trim();

      let user = await User.findOne({ email: normalizedEmail });
      if (user) return res.status(400).send({ message: "Email is already used." });

      await Otp.deleteOne({ email: normalizedEmail });

      const getOtp = generate.otp();
      console.log('🔑 [OTP] Generated OTP for email verification:', getOtp);
      console.log('📧 [OTP] Email:', normalizedEmail);
      await new Otp({
        email: normalizedEmail, // Store normalized email to match lookup
        otp: Bcrypt.shared().encode(getOtp),
        createdAt: Date.now(),
        expiresAt: Date.now() + 5_00_000,
      }).save();

      EmailService.sendOTPEmail(email, firstName, getOtp); // Use original email for sending

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

      // Normalize email (lowercase and trim) to match how it's stored
      const normalizedEmail = value.email.toLowerCase().trim();

      // Find user first to get their _id
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) return res.status(400).send({ message: "User does not exist." });

      const getOtp = await Otp.findOne({ email: normalizedEmail });
      if (!getOtp) return res.status(400).send({ message: "No otp records found" });

      // checking for expired code
      const { expiresAt } = getOtp;
      if (Number(expiresAt) < Date.now()) {
        await Otp.deleteOne({ email: normalizedEmail });
        return res.status(400).send({ message: "Code has expired. Request for a new one." });
      }

      //comparing otp
      if (!Bcrypt.shared().compare(otp, getOtp.otp)) return res.status(400).send({ message: "Invalid otp code." });

      // Update user's verified status to true using _id for more reliable update
      const updateResult = await User.updateOne({ _id: user._id }, { verified: "true" });
      console.log('✅ [VERIFY NEW USER] Updated user verified status:', updateResult.modifiedCount > 0 ? 'SUCCESS' : 'FAILED');
      console.log('✅ [VERIFY NEW USER] User email:', normalizedEmail);
      console.log('✅ [VERIFY NEW USER] User _id:', user._id);

      // Refresh user to get updated data
      const updatedUser = await User.findById(user._id);
      console.log('✅ [VERIFY NEW USER] User verified status after update:', updatedUser?.verified);
      if (!updatedUser || updatedUser.verified !== "true") {
        console.error('❌ [VERIFY NEW USER] WARNING: User verified status was not updated correctly!');
      }

      // clear any old record
      await Otp.deleteOne({ email: normalizedEmail });
      return res.status(200).json({ message: "success" });
    } catch (error) {
      console.error('❌ [VERIFY NEW USER] Error:', error);
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
        // The client ID from google-services.json: 76702274216-9fnpr1k03fcsbvroda2c5ckq32o8qnov.apps.googleusercontent.com
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
        // Parse name into firstName and lastName
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
        
        // Verify the audience (client ID) matches
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
      }

      // Create new user account
      session = await startSession();
      session.startTransaction();

      // Parse name into firstName and lastName
      const nameParts = name ? name.split(" ") : [];
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Create new user
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
        // No password for Google users
      });

      await user.save({ session });

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
      await wallet.save({ session });

      // Send welcome email
      EmailService.sendWelcomeEmail(email, firstName);

      // Get user profile data
      const profileData = await User.findById(user._id).select("-password -__v");
      
      // If user is an agent, get their agentCode
      if (profileData?.accountType === "Agent") {
        const agentCodeData = await AgentCode.findOne({ createdFor: profileData._id });
        if (agentCodeData) {
          profileData.agentCode = agentCodeData.code;
        }
      }

      const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });
      
      await session.commitTransaction();
      
      return res.status(200).json({ 
        message: "success", 
        accessToken: token,
        data: profileData 
      });
    } catch (error) {
      await session?.abortTransaction();
      await session?.endSession();
      console.error('Error completing Google Sign-In:', error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
