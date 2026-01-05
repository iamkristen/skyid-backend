import { Response, Request } from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { startSession } from "mongoose";
import AgentCode, { generateCode } from "./agent.code.model";
import validation from "./agent.schema";
import Bcrypt from "../utils/bcryptService";
import User from "../user/user.model";
import Transaction from "../wallet/wallet.transaction.model";

dotenv.config();

export default class AgentController {
  static async createAgent(req: Request, res: Response) {
    const session = await startSession();
    session.startTransaction();

    try {
      const { email, password, nin } = req.body;

      const { error, value } = validation.createAgent(req.body);
      if (error) return res.status(400).send({ message: error.details[0].message });

      const agent = await User.findOne({ email });
      if (agent) return res.status(409).send({ message: "Agent already registered." });

      const ninCheck = await User.findOne({ nin });
      if (ninCheck) return res.status(409).send({ message: "NIN already exist." });

      const newAgent = new User({
        nin: value.nin,
        firstName: value.firstName,
        lastName: value.lastName,
        middleName: value.middleName,
        email: value.email.toLowerCase(),
        phoneNumber: value.phoneNumber,
        bankName: value.bankName,
        bankCode: value.bankCode,
        accountNumber: value.accountNumber,
        password: Bcrypt.shared().encode(password),
        state: value.state,
        accountType: "Agent",
        status: "active",
      });

      await newAgent.save({ session });

      // GENERATE AGENT CODE
      const code = `${(value.state as string).substring(0, 3).toUpperCase()}_${generateCode()}`;
      console.log(`Creating new agent code ${code}`);
      const agentCode = new AgentCode({
        code,
        createdFor: newAgent.id,
        discountPercent: 0,
        allocationPercent: 5,
        status: "active",
      });
      await agentCode.save({ session });

      const token = jwt.sign({ _id: newAgent.id }, process.env.JWT_PRIVATE_KEY as string, { expiresIn: '7d' });

      await session.commitTransaction();
      session.endSession();

      return res.status(200).send({ message: "success", data: newAgent, accessToken: token });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      // console.error(`Failed to get channel partners: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getAgentCode(req: Request, res: Response) {
    try {
      const userId = req.user?._id as string | undefined;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // Ensure the requester is an Agent, Channel Partner with Silver level, or VSO created by Silver Channel Partner
      const user = await User.findById(userId).select("accountType channelPartnerLevel createdBy");
      if (!user) return res.status(404).json({ message: "User not found" });
      
      const isAgent = user.accountType === "Agent";
      const isSilverChannelPartner = user.accountType === "Channel_Partner" && user.channelPartnerLevel === "Silver";
      
      // Check if VSO was created by Silver Channel Partner
      let isVSOCreatedBySilverPartner = false;
      if (user.accountType === "VSO" && user.createdBy) {
        const parentChannelPartner = await User.findById(user.createdBy).select("channelPartnerLevel");
        isVSOCreatedBySilverPartner = parentChannelPartner?.channelPartnerLevel === "Silver";
      }
      
      if (!isAgent && !isSilverChannelPartner && !isVSOCreatedBySilverPartner) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const codeDoc = await AgentCode.findOne({ createdFor: userId });
      if (!codeDoc) return res.status(404).json({ message: "Agent code not found" });

      return res.status(200).json({ message: "success", data: {...codeDoc ,code: codeDoc.code } });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getStats(req: Request, res: Response) {
    try {
      const userId = req.user?._id as string | undefined;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // Get agent code for this user
      const codeDoc = await AgentCode.findOne({ createdFor: userId });
      if (!codeDoc) return res.status(404).json({ message: "Agent code not found" });

      // Registered users count (users registered with this agent code)
      const registeredUsers = await User.countDocuments({ agentCode: codeDoc.code });

      // Total commission/amount from payouts to this agent
      const payoutAgg = await Transaction.aggregate([
        { $match: { type: "payout", transferRecepient: userId } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const totalCommission = payoutAgg[0]?.total ?? 0;

      return res.status(200).json({
        message: "success",
        data: {
          registeredUsers,
          totalCommission,
        },
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
