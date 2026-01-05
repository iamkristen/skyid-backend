import { Response, Request } from "express";
import dotenv from "dotenv";
import mongoose, { startSession } from "mongoose";
import User from "../user/user.model";
import Wallet from "../wallet/wallet.model";
import { sendMail } from "../utils/sendMail";
import { registration, vsoRegistration } from "../views/email-template";
import Transaction from "../wallet/wallet.transaction.model";
import { generateOtp } from "../utils/generateOtp";
import Kyc from "../kyc/kyc.model";
import Bcrypt from "../utils/bcryptService";
import EmailService from "../utils/EmailService";
import SwitchTeamRequest from "../switch/switch.model";
import ValidateSchema from "./partner.schema";
import ChannelPartner from "./partner.model";
import jwt from "jsonwebtoken";

dotenv.config();

export default class ChannelPartnerController {
  static async signupChannelPartner(req: Request, res: Response) {
    // const session = await startSession();
    // session.startTransaction();
    // try {
    //   const { error, value } = ValidateSchema.signupChannelPartner(req.body);
    //   if (error) return res.status(400).send(error.details[0].message);
    //   const { signupSecret } = jwt.verify(req.body.signupSecret as string, process.env.JWT_PRIVATE_KEY as string) as {
    //     signupSecret: string;
    //   };
    //   const channelPartner = await ChannelPartner.findOne({ signupSecret });
    //   if (!channelPartner) return res.status(400).send({ message: "Invalid signup secret." });
    //   if (channelPartner.status === "pending")
    //     return res.status(400).send({ message: "Channel partner has not been approved" });
    //   const userCheck = await User.findOne({ email: channelPartner.email });
    //   if (userCheck) return res.status(400).send({ message: "Email is taken already." });
    //   const user = new User({
    //     email: channelPartner.email,
    //     firstName: value.firstName,
    //     lastName: value.lastName,
    //     password: Bcrypt.shared().encode(req.body.password), // encrypt password
    //     phoneNumber: channelPartner.phoneNumber,
    //     businessName: channelPartner.businessName,
    //     businessType: value.businessType,
    //     region: channelPartner.region,
    //     accountType: "Channel_Partner",
    //     channelPartnerLevel: value.channelPartnerLevel,
    //     verified: "false",
    //   });
    //   await user.save({ session });
    //   let accountNumber;
    //   let isUnique = false;
    //   while (!isUnique) {
    //     accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    //     // Check if account number already exists
    //     const existingWallet = await Wallet.findOne({ accountNumber });
    //     if (!existingWallet) {
    //       isUnique = true;
    //     }
    //   }
    //   const wallet = new Wallet({
    //     _id: user._id,
    //     amount: 0,
    //     status: "active",
    //     accountNumber,
    //   });
    //   await wallet.save({ session });
    //   // SEND THE EMAIL HERE
    //   EmailService.sendWelcomeEmail(channelPartner.email, channelPartner.businessName);
    //   const token = jwt.sign({ _id: user._id }, process.env.JWT_PRIVATE_KEY as string);
    //   await session.commitTransaction();
    //   return res.status(200).json({ message: "success", accessToken: token });
    // } catch (error) {
    //   await session.abortTransaction();
    //   console.error(`Failed to sign up channel partner: ${error}`);
    //   return res.status(500).json({ message: "Internal Server Error!" });
    // } finally {
    //   await session.endSession();
    // }
  }

  // get all VSO clients
  static async getClients(req: Request, res: Response) {}
}
