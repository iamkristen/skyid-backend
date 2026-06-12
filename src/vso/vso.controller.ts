import { Response, Request } from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../user/user.model";
import Wallet from "../wallet/wallet.model";
import Kyc from "../kyc/kyc.model";
import SkyId from "../smart-number/number.skyId.model";
import ValidateVSOSchema from "./vso.schema";
import SwitchTeamRequest from "../switch/switch.model";
import Transaction from "../wallet/wallet.transaction.model";
import EmailService from "../utils/EmailService";
import VSOTopUpRequest from "./vso-topup.model";
import { generateOtp } from "../utils/generateOtp";
import Bcrypt from "../utils/bcryptService";
import KYCController from "../kyc/kyc.controller";
import { capitalize } from "../utils/string.utils";
import AgentCode, { generateCode } from "../agent/agent.code.model";
import AdminUser from "../admin/admin.model";

dotenv.config();

export default class VsoController {
  static async createVSO(req: Request, res: Response) {
    const userId = req.user!._id;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { error, value } = ValidateVSOSchema.createVSO(req.body);
      if (error) return res.status(400).send(error.details[0].message);

      const user = await User.findById(userId);
      if (!user) return res.status(400).send({ message: "User does not exist." });

      if (user.accountType !== "Channel_Partner")
        return res.status(400).send({ message: "You are not a channel partner." });

      // Validate bank details for Silver Channel Partners
      if (user.channelPartnerLevel === "Silver") {
        if (!value.bankCode || !value.bankName || !value.accountNumber || !value.accountHolderName) {
          return res.status(400).send({ 
            message: "Bank details (bankCode, bankName, accountNumber, accountHolderName) are required for VSOs under Silver Channel Partners" 
          });
        }
      }

      const checkUser = await User.findOne({ email: value.email });
      if (checkUser) return res.status(400).send({ message: "Email already exists." });

      const checkNin = await User.findOne({ nin: value.nin });
      if (checkNin) return res.status(400).send({ message: "Nin already exists." });

      // verify NIN
      const ninData = await KYCController.getNINData(value.nin!);
      if (!ninData || !ninData.nin_data)
        return res.status(400).send({ message: "Invalid NIN or NIN verification failed" });

      const vsoPassword = generateOtp();
      const vso = new User({
        firstName: capitalize(ninData.nin_data.firstname),
        lastName: capitalize(ninData.nin_data.surname),
        // country: value.country,
        email: value.email?.toLowerCase(),
        businessName: capitalize(value.businessName!),
        businessType: user.businessType,
        phoneNumber: value.phoneNumber,
        password: Bcrypt.shared().encode(vsoPassword),
        accountType: "VSO",
        state: value.state,
        nin: value.nin,
        status: "active",
        verified: "true",
        createdBy: userId,
        mustChangePassword: true,
        parentChannelPartnerLevel: user.channelPartnerLevel, // Track parent Channel Partner level
        // Bank details for Silver Channel Partner's VSOs
        ...(user.channelPartnerLevel === "Silver" && {
          bankCode: value.bankCode,
          bankName: value.bankName,
          accountNumber: value.accountNumber,
          accountHolderName: value.accountHolderName,
        }),
      });
      await vso.save({ session });

      if (user.channelPartnerLevel === "Platinum") {
        // Platinum Channel Partner - Create Wallet for VSO
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
          _id: vso._id,
          amount: 0,
          status: "active",
          accountNumber,
        });
        await wallet.save({ session });
      } else {
        // Silver Channel Partner - Create Agent Code for VSO (optional allocation: 0% or 10–15%)
        const vsoAllocation = value.allocationPercent ?? 0;
        const channelPartnerAgentCode = await AgentCode.findOne({ createdFor: userId, createdForType: "channel_partner" });
        if (!channelPartnerAgentCode) {
          await session.abortTransaction();
          return res.status(400).send({ message: "Channel Partner agent code not found." });
        }

        const code = `${(value.state as string).substring(0, 3).toUpperCase()}_${generateCode()}`;

        if (vsoAllocation > 0) {
          if (vsoAllocation > channelPartnerAgentCode.allocationPercent) {
            await session.abortTransaction();
            return res.status(400).send({
              message: `You cannot allocate more than the channel partner's ${channelPartnerAgentCode.allocationPercent}% to this VSO.`,
            });
          }

          const agentCode = new AgentCode({
            code,
            createdFor: vso.id,
            createdForType: "vso",
            discountPercent: 0,
            allocationPercent: vsoAllocation,
            status: "active",
          });
          await agentCode.save({ session });
        } else {
          // VSO gets 0% – channel partner keeps full allocation
          const agentCode = new AgentCode({
            code,
            createdFor: vso.id,
            createdForType: "vso",
            discountPercent: 0,
            allocationPercent: 0,
            status: "active",
          });
          await agentCode.save({ session });
        }
      }

      // Sending email to VSO
      EmailService.sendVSORegistration(
        req.body.email,
        capitalize(ninData.nin_data.firstname),
        user.businessName ?? `${user.lastName} ${user.firstName}`,
        vsoPassword
      );

      await session.commitTransaction();
      return res.status(201).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }


  static async creditVSO(req: Request, res: Response) {
    const userId = req.user!._id;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { error, value } = ValidateVSOSchema.creditVSO(req.body);
      if (error) return res.status(400).send(error.details[0].message);

      let { amount, vsoId } = value;
      const user = await User.findById(userId);
      if (!user) return res.status(404).send({ message: "User does not exist." });
      if (user.accountType !== "Channel_Partner") {
        return res.status(403).send({ message: "You are not a channel partner." });
      }
      const wallet = await Wallet.findById(userId);
      if (!wallet) return res.status(404).send({ message: "Wallet does not exist." });

      amount *= 100;
      if (amount > wallet.amount) {
        return res.status(400).send({ message: "Insufficient balance." });
      }

      wallet.amount -= amount;
      await wallet.save({ session });

      const vsoWallet = await Wallet.findById(vsoId);
      if (!vsoWallet) return res.status(404).send({ message: "VSO wallet does not exist." });
      vsoWallet.amount += amount;
      await vsoWallet.save({ session });

      const transaction = new Transaction({
        amount: -amount,
        status: "success",
        type: "transfer",
        accountNumber: wallet.accountNumber,
        transferRecepient: vsoWallet.accountNumber,
      });
      await transaction.save({ session });

      await session.commitTransaction();
      return res.status(201).json({ message: "VSO credited successfully.", data: transaction });
    } catch (error) {
      await session.abortTransaction();
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async getVSOs(req: Request, res: Response) {
    const userId = req.user!._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send({ message: "User does not exist." });
    if (user.accountType !== "Channel_Partner") {
      return res.status(403).send({ message: "You are not a channel partner." });
    }
    const vsos = await User.find({ accountType: "VSO", createdBy: userId });
    
    // Get allocation percentages and calculate totalSales for each VSO
    const vsosWithAllocation = await Promise.all(
      vsos.map(async (vso) => {
        const agentCode = await AgentCode.findOne({ createdFor: vso._id });
        
        // Calculate totalSales from approved SwitchTeamRequest records
        const totalSalesResult = await SwitchTeamRequest.aggregate([
          {
            $match: {
              createdBy: vso._id.toString(),
              status: "approved",
            },
          },
          {
            $group: {
              _id: null,
              totalSales: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
        ]);
        
        const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalSales : 0;
        
        return {
          ...vso.toObject(),
          allocationPercent: agentCode?.allocationPercent ?? 0,
          totalSales: totalSales,
        };
      })
    );
    
    return res.status(200).json({ data: vsosWithAllocation });
  }

  static async updateVSOAllocation(req: Request, res: Response) {
    const userId = req.user!._id;
    const { vsoId, allocationPercent } = req.body;

    try {
      // Verify the user is a Channel Partner
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.accountType !== "Channel_Partner") {
        return res.status(403).json({ message: "You are not a channel partner" });
      }

      // Verify the VSO belongs to this Channel Partner
      const vso = await User.findById(vsoId);
      if (!vso) return res.status(404).json({ message: "VSO not found" });
      if (vso.createdBy !== userId) {
        return res.status(403).json({ message: "You can only manage your own VSOs" });
      }

      // Validate allocation percentage (0 = revoke allocation; otherwise 0–100 within CP's available pool)
      if (typeof allocationPercent !== "number" || allocationPercent < 0) {
        return res.status(400).json({ message: "VSO allocation must be 0 or a positive number" });
      }

      // Get current VSO agent code
      const vsoAgentCode = await AgentCode.findOne({ createdFor: vsoId, createdForType: "vso" });
      if (!vsoAgentCode) {
        return res.status(404).json({ message: "VSO agent code not found" });
      }

      // CP's allocationPercent is their fixed original grant — never mutated by VSO sub-allocations
      const channelPartnerAgentCode = await AgentCode.findOne({ createdFor: userId, createdForType: "channel_partner" });
      if (!channelPartnerAgentCode) {
        return res.status(404).json({ message: "Channel Partner agent code not found" });
      }

      if (allocationPercent > channelPartnerAgentCode.allocationPercent) {
        return res.status(400).json({
          message: `You cannot allocate more than the channel partner's ${channelPartnerAgentCode.allocationPercent}% to this VSO.`,
        });
      }

      // Only update the VSO's allocation — CP's allocationPercent is never modified
      vsoAgentCode.allocationPercent = allocationPercent;
      await vsoAgentCode.save();

      return res.status(200).json({ 
        message: "Allocation updated successfully",
        data: {
          vsoAllocation: allocationPercent,
          channelPartnerAllocation: channelPartnerAgentCode.allocationPercent,
        }
      });

    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
  
  static async getVSOActivity(req: Request, res: Response) {
    const userId = req.user!._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).send({ message: "User does not exist." });
    
    const { vsoId } = req.params;
    let vso;
    
    if (user.accountType === "Channel_Partner") {
      // Channel Partners can only view their own VSOs' activities
      vso = await User.findOne({ accountType: "VSO", _id: vsoId, createdBy: userId });
      if (!vso) return res.status(404).send({ message: "VSO does not exist or you don't have permission to view this VSO." });
    } else {
      // Check if current user is an Admin user
      const adminUser = await AdminUser.findById(userId);
      if (adminUser && (adminUser.role === "Admin" || adminUser.role === "Super_Admin")) {
        // Admin and Super Admin can view any VSO's activities
        vso = await User.findOne({ accountType: "VSO", _id: vsoId });
        if (!vso) return res.status(404).send({ message: "VSO does not exist." });
      } else {
        return res.status(403).send({ message: "You are not authorized to view VSO activities." });
      }
    }

    // Find activities where createdBy matches the vsoId
    // createdBy is stored as String in the schema, but may be ObjectId string representation
    // Use $or to match both string formats
    let activity: any[] = [];
    
    try {
      // Query with both string formats to handle different storage methods
      const vsoIdString = vsoId.toString();
      let query: any = { createdBy: vsoIdString };
      
      // Try to also match ObjectId string representation if valid
      try {
        const objectIdString = new mongoose.Types.ObjectId(vsoId).toString();
        if (objectIdString !== vsoIdString) {
          query = { $or: [{ createdBy: vsoIdString }, { createdBy: objectIdString }] };
        }
      } catch (err) {
        // If ObjectId conversion fails, just use the string match
      }
      
      activity = await SwitchTeamRequest.find(query).sort({ createdAt: -1 });
      
      console.log(`Found ${activity.length} activities for VSO ${vsoIdString}`);
    } catch (error) {
      console.error(`Error fetching VSO activity for ${vsoId}:`, error);
      activity = [];
    }
    
    return res.status(200).json({ 
      message: "success",
      data: { 
        ...vso.toObject(), 
        activity: activity || [] 
      } 
    });
  }
  // static async getVSOActivity(req: Request, res: Response) {
  //   const userId = req.user!._id;
  //   const user = await User.findById(userId);
  //   if (!user) return res.status(404).send({ message: "User does not exist." });
  //   if (user.accountType !== "Channel_Partner") {
  //     return res.status(403).send({ message: "You are not a channel partner." });
  //   }
  //   const { vsoId } = req.params;
  //   const vso = await User.findOne({ accountType: "VSO", _id: vsoId, createdBy: userId });
  //   if (!vso) return res.status(404).send({ message: "VSO does not exist." });

  //   const activity = await SwitchTeamRequest.find({ createdBy: vsoId });
  //   return res.status(200).json({ data: { ...vso.toObject(), activity } });
  // }

  // create customer under VSO
  static async createCustomer(req: Request, res: Response) {
    const vsoId = req.user!._id;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { error, value } = ValidateVSOSchema.createCustomer(req.body);
      if (error) return res.status(400).send(error.details[0].message);

      const vso = await User.findById(vsoId);
      if (!vso) return res.status(404).send({ message: "User does not exist." });
      if (vso.accountType !== "VSO") {
        return res.status(403).send({ message: "You are not a VSO." });
      }

      const skyId = await SkyId.findOne({ skyId: value.skyId, userId: vsoId });
      if (!skyId) return res.status(400).send({ message: "SkyId not owned by VSO" });

      const newUser = new User({
        firstName: value.firstName,
        lastName: value.lastName,
        country: value.country,
        email: value.email,
        businessName: value.businessName,
        businessType: value.businessType,
        phoneNumber: value.phoneNumber,
        accountType: "Individual",
        status: "active",
        verified: "true",
        createdBy: vsoId,
      });
      await newUser.save({ session });
      skyId.customerId = newUser._id.toString();
      await skyId.save({ session });

      const kyc = new Kyc({
        user_id: newUser._id.toString(),
        phone: value.phoneNumber,
        address: value.address,
        state: value.state,
        nin: value.nin,
      });
      await kyc.save({ session });

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
        _id: newUser._id,
        amount: 0,
        status: "active",
        accountNumber,
      });
      await wallet.save({ session });

      await session.commitTransaction();
      return res.status(200).send({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async getCustomers(req: Request, res: Response) {
    const vsoId = req.user!._id;
    try {
      const vso = await User.findById(vsoId);
      if (!vso) return res.status(404).send({ message: "User does not exist." });
      if (vso.accountType !== "VSO") {
        return res.status(403).send({ message: "You are not a VSO." });
      }
      const customers = await User.find({ createdBy: vsoId });
      return res.status(200).send({ message: "success", data: customers });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  // VSO Top-Up Request Methods
  static async requestTopUp(req: Request, res: Response) {
    const vsoId = req.user!._id;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { error, value } = ValidateVSOSchema.requestTopUp(req.body);
      if (error) return res.status(400).send(error.details[0].message);

      const vso = await User.findById(vsoId);
      if (!vso) return res.status(404).send({ message: "User does not exist." });
      if (vso.accountType !== "VSO") {
        return res.status(403).send({ message: "You are not a VSO." });
      }

      if (!vso.createdBy) {
        return res.status(400).send({ message: "VSO does not have a Channel Partner." });
      }

      // Check if there's already a pending request
      const existingRequest = await VSOTopUpRequest.findOne({
        vsoId: vsoId.toString(),
        status: "pending",
      });

      if (existingRequest) {
        return res.status(400).send({ message: "You already have a pending top-up request." });
      }

      // Convert amount to kobo (smallest currency unit)
      const amountInKobo = value.amount * 100;

      // Get VSO wallet
      const vsoWallet = await Wallet.findById(vsoId);
      if (!vsoWallet) {
        await session.abortTransaction();
        return res.status(404).send({ message: "VSO wallet not found." });
      }

      const topUpRequest = new VSOTopUpRequest({
        vsoId: vsoId.toString(),
        channelPartnerId: vso.createdBy,
        amount: amountInKobo,
        status: "pending",
      });

      await topUpRequest.save({ session });

      // Create pending transaction record for VSO
      const pendingTransaction = new Transaction({
        amount: amountInKobo,
        status: "pending",
        type: "transfer",
        accountNumber: vsoWallet.accountNumber,
        txnRef: topUpRequest._id.toString(),
      });
      await pendingTransaction.save({ session });

      // Update request with transaction reference
      topUpRequest.txnRef = pendingTransaction._id.toString();
      await topUpRequest.save({ session });

      await session.commitTransaction();

      // Send notification email to Channel Partner
      try {
        const channelPartner = await User.findById(vso.createdBy);
        if (channelPartner && channelPartner.email) {
          const vsoFullName = `${vso.firstName} ${vso.lastName}`;
          const channelPartnerFullName = `${channelPartner.firstName} ${channelPartner.lastName}`;
          await EmailService.sendVSOTopUpRequested(
            channelPartner.email,
            channelPartnerFullName,
            vsoFullName,
            amountInKobo
          );
          console.info(`Top-up request notification email sent to Channel Partner: ${channelPartner.email}`);
        }
      } catch (emailError) {
        console.error("Failed to send top-up request notification email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(201).json({
        message: "Top-up request created successfully.",
        data: topUpRequest,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to create top-up request: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async getTopUpRequests(req: Request, res: Response) {
    const userId = req.user!._id;
    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).send({ message: "User does not exist." });

      if (user.accountType === "Channel_Partner") {
        // Channel Partner gets all pending requests from their VSOs
        const requests = await VSOTopUpRequest.find({
          channelPartnerId: userId.toString(),
          status: "pending",
        }).sort({ createdAt: -1 });

        // Manually populate VSO details
        const requestsWithVSO = await Promise.all(
          requests.map(async (req) => {
            const vso = await User.findById(req.vsoId).select("firstName lastName email phoneNumber");
            return {
              ...req.toObject(),
              vsoId: vso ? {
                _id: vso._id,
                firstName: vso.firstName,
                lastName: vso.lastName,
                email: vso.email,
                phoneNumber: vso.phoneNumber,
              } : null,
            };
          })
        );

        return res.status(200).json({ message: "success", data: requestsWithVSO });
      } else if (user.accountType === "VSO") {
        // VSO gets their own requests
        const requests = await VSOTopUpRequest.find({
          vsoId: userId.toString(),
        }).sort({ createdAt: -1 });

        // Manually populate Channel Partner details
        const requestsWithCP = await Promise.all(
          requests.map(async (req) => {
            const cp = await User.findById(req.channelPartnerId).select("firstName lastName email businessName");
            return {
              ...req.toObject(),
              channelPartnerId: cp ? {
                _id: cp._id,
                firstName: cp.firstName,
                lastName: cp.lastName,
                email: cp.email,
                businessName: cp.businessName,
              } : null,
            };
          })
        );

        return res.status(200).json({ message: "success", data: requestsWithCP });
      } else {
        return res.status(403).send({ message: "You are not authorized to view top-up requests." });
      }
    } catch (error) {
      console.error(`Failed to get top-up requests: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async approveTopUpRequest(req: Request, res: Response) {
    const userId = req.user!._id;
    const { requestId } = req.params;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).send({ message: "User does not exist." });
      if (user.accountType !== "Channel_Partner") {
        return res.status(403).send({ message: "You are not a Channel Partner." });
      }

      const topUpRequest = await VSOTopUpRequest.findById(requestId);
      if (!topUpRequest) {
        return res.status(404).send({ message: "Top-up request not found." });
      }

      if (topUpRequest.channelPartnerId !== userId.toString()) {
        return res.status(403).send({ message: "You are not authorized to approve this request." });
      }

      if (topUpRequest.status !== "pending") {
        return res.status(400).send({ message: "Request has already been processed." });
      }

      // Check Channel Partner wallet balance
      const channelPartnerWallet = await Wallet.findById(userId);
      if (!channelPartnerWallet) {
        return res.status(404).send({ message: "Channel Partner wallet not found." });
      }

      if (channelPartnerWallet.amount < topUpRequest.amount) {
        await session.abortTransaction();
        return res.status(400).send({ message: "Insufficient balance to top up VSO wallet." });
      }

      // Deduct from Channel Partner wallet
      channelPartnerWallet.amount -= topUpRequest.amount;
      await channelPartnerWallet.save({ session });

      // Add to VSO wallet
      const vsoWallet = await Wallet.findById(topUpRequest.vsoId);
      if (!vsoWallet) {
        await session.abortTransaction();
        return res.status(404).send({ message: "VSO wallet not found." });
      }

      vsoWallet.amount += topUpRequest.amount;
      await vsoWallet.save({ session });

      // Update the existing pending transaction to success
      if (topUpRequest.txnRef) {
        const existingTransaction = await Transaction.findById(topUpRequest.txnRef);
        if (existingTransaction) {
          existingTransaction.status = "success";
          existingTransaction.transferRecepient = channelPartnerWallet.accountNumber;
          await existingTransaction.save({ session });
        }
      }

      // Create transaction record for Channel Partner (outgoing)
      const channelPartnerTransaction = new Transaction({
        amount: -topUpRequest.amount,
        status: "success",
        type: "transfer",
        accountNumber: channelPartnerWallet.accountNumber,
        transferRecepient: vsoWallet.accountNumber,
      });
      await channelPartnerTransaction.save({ session });

      // Update request status
      topUpRequest.status = "approved";
      topUpRequest.handledBy = userId.toString();
      await topUpRequest.save({ session });

      await session.commitTransaction();

      // Send notification email to VSO
      try {
        const vso = await User.findById(topUpRequest.vsoId);
        if (vso && vso.email) {
          await EmailService.sendVSOTopUpApproved(
            vso.email,
            `${vso.firstName} ${vso.lastName}`,
            topUpRequest.amount
          );
        }
      } catch (emailError) {
        console.error("Failed to send top-up approval email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({
        message: "Top-up request approved successfully.",
        data: topUpRequest,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to approve top-up request: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async rejectTopUpRequest(req: Request, res: Response) {
    const userId = req.user!._id;
    const { requestId } = req.params;
    const { remark } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).send({ message: "User does not exist." });
      if (user.accountType !== "Channel_Partner") {
        return res.status(403).send({ message: "You are not a Channel Partner." });
      }

      const topUpRequest = await VSOTopUpRequest.findById(requestId);
      if (!topUpRequest) {
        return res.status(404).send({ message: "Top-up request not found." });
      }

      if (topUpRequest.channelPartnerId !== userId.toString()) {
        return res.status(403).send({ message: "You are not authorized to reject this request." });
      }

      if (topUpRequest.status !== "pending") {
        return res.status(400).send({ message: "Request has already been processed." });
      }

      // Update the existing pending transaction to failed
      if (topUpRequest.txnRef) {
        const existingTransaction = await Transaction.findById(topUpRequest.txnRef);
        if (existingTransaction) {
          existingTransaction.status = "failed";
          await existingTransaction.save({ session });
        }
      }

      // Update request status
      topUpRequest.status = "rejected";
      topUpRequest.handledBy = userId.toString();
      if (remark) {
        topUpRequest.remark = remark;
      }
      await topUpRequest.save({ session });

      await session.commitTransaction();

      // Send notification email to VSO
      try {
        const vso = await User.findById(topUpRequest.vsoId);
        if (vso && vso.email) {
          await EmailService.sendVSOTopUpRejected(
            vso.email,
            `${vso.firstName} ${vso.lastName}`,
            topUpRequest.amount,
            remark
          );
        }
      } catch (emailError) {
        console.error("Failed to send top-up rejection email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({
        message: "Top-up request rejected successfully.",
        data: topUpRequest,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to reject top-up request: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }
}
