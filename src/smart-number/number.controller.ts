import { Response, Request } from "express";
import User from "../user/user.model";
import dotenv from "dotenv";
import PhoneNumber from "./number.phoneNumbers.model";
import SkyId from "./number.skyId.model";
import SwitchTeamRequest from "../switch/switch.model";
import NumberService from "./number.service";
import Wallet from "../wallet/wallet.model";
import Transaction from "../wallet/wallet.transaction.model";
import mongoose from "mongoose";
import { uploadFile } from "../utils/firebase";
import CustomerEnablementRequest from "../customer-enablement/customer.model";
import { ZainpayHelper } from "../zainpay/zainpay.controller";
import { IWallet } from "../wallet/wallet.type";
import ValidateNumberSchema from "./number.schema";
import { IPhoneNumber } from "./number.types";
import AgentCode from "../agent/agent.code.model";

dotenv.config();

export default class NumberController {
  static async checkNumber(req: Request, res: Response) {
    const { number } = req.body;
    try {
      const { error } = ValidateNumberSchema.checkPhoneNumber(number);
      if (error) return res.status(400).send(error.details[0].message);

      let userNumber = await PhoneNumber?.findOne({ number });
      const isAvailable = !!userNumber && userNumber.available && !userNumber.usedBy && !userNumber.agentOwner;
      let suggestedNumbers: Array<IPhoneNumber> | undefined = [];
      if (!isAvailable) {
        suggestedNumbers = await PhoneNumber?.aggregate([
          { $match: { available: true, usedBy: null, agentOwner: null } },
          { $sample: { size: 5 } }, // select random numbers
        ]);

        if (!suggestedNumbers || suggestedNumbers.length === 0) {
          console.log("EMERGENCY: There are no available phone numbers in the database.");
          return res.status(500).send({ message: "please try again later" });
        }
      }

      if (isAvailable) {
        suggestedNumbers.push(userNumber!);
      }

      return res.status(200).send({
        message: "suggest numbers",
        data: suggestedNumbers.map((num) => num.number),
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async suggestNumber(req: Request, res: Response) {
    const { count } = req.query;
    try {
      const suggestionCount = parseInt(count as string);
      if (!Number.isInteger(suggestionCount)) {
        return res.status(400).send({ message: "Invalid suggestion count" });
      }

      const suggestedNumbers: Array<IPhoneNumber> | undefined = await PhoneNumber?.aggregate([
        { $match: { available: true, usedBy: null, agentOwner: null } },
        { $sample: { size: suggestionCount } }, // select random numbers
      ]);

      if (!suggestedNumbers || suggestedNumbers.length === 0) {
        console.log("EMERGENCY: There are no available phone numbers in the database.");
        return res.status(500).send({ message: "please try again later" });
      }

      const data = suggestedNumbers.map((num) => num.number);
      return res.status(200).send({ message: "success", data });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async buyNumber(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { error, value } = ValidateNumberSchema.buyNumber({
        ...req.body,
        _id: req.user?._id,
      });
      if (error) return res.status(400).send(error.details[0].message);
      const { skyId, mappedNumbers, withIVR, withIVM, _id: userId } = value;

      const user = await User.findById(userId);
      if (!user) return res.status(401).send({ message: "user not found" });

      const skyIdCheck = await SkyId.findOne({ skyId });
      if (skyIdCheck) return res.status(403).send({ message: "skyid already in use" });

      let amount = 20_000; // primary mapping cost
      for (let i = 1 /* skip index 0 (primary mapping) */; i < mappedNumbers.length; i++) {
        amount += 15_000; // additional mapping cost
      }

      if (withIVR) amount += 20_000; // ivr cost
      if (withIVM) amount += 5_000; // ivm cost

      amount = amount * 1.075; // add vat 7%
      amount *= 100; // convert to kobo

      const transaction = new Transaction({
        type: "payment",
        amount: -amount,
        paymentType: "buyNumber",
        skyId,
        ivr: withIVR,
        ivm: withIVM,
      });
      let paymentUrl: string | undefined = undefined;
      let wallet: IWallet | null | undefined;
      
      // Determine if user should use payment gateway or wallet
      const shouldUsePaymentGateway = 
        user.accountType === "Individual" || 
        (user.accountType === "Channel_Partner" && user.channelPartnerLevel === "Silver") ||
        (user.accountType === "VSO" && user.parentChannelPartnerLevel === "Silver");
      
      if (shouldUsePaymentGateway) {
        const payment = await ZainpayHelper.initializeTransaction(
          amount / 100,
          user.email!,
          user.phoneNumber!,
          value.callbackUrl
        );
        paymentUrl = payment.data;
        transaction.txnRef = payment.txnRef;
      } else {
        // use wallet for Platinum Channel Partners & their VSOs
        wallet = await Wallet.findOne({ _id: userId });
        if (!wallet) return res.status(401).send({ message: "wallet not found" });
        if (wallet.amount < amount) return res.status(402).send({ message: "insufficient balance" });

        // deduct amount from wallet
        await Wallet.updateOne({ _id: userId }, { $inc: { amount: -amount } }, { session });
      }

      transaction.accountNumber = wallet ? wallet.accountNumber : undefined;
      transaction.status = wallet ? "success" : "pending";
      await transaction.save({ session });

      const skyIdRecord = new SkyId({
        skyId,
        mappedNumbers,
        withIVR,
        withIVM,
        userId: user._id,
        amount,
        status: "pending",
      });
      await skyIdRecord.save({ session });
      const switchReq = new SwitchTeamRequest({
        request_type: "buy",
        skyId,
        status: wallet ? "pending" : "awaiting",
        txnRef: transaction._id.toString(),
        mappedNumbers,
        amount,
        createdBy: user._id,
      });
      await switchReq.save({ session });
      await PhoneNumber?.updateOne({ number: skyId }, { available: false, usedBy: user._id, platform: "SKYID" });

      await session.commitTransaction();
      return res.status(200).send({ message: "success", data: { ...transaction.toObject(), paymentUrl } });
    } catch (error) {
      console.error(error);
      await session.abortTransaction();
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async getUserNumbers(req: Request, res: Response) {
    const userId = req.user!._id;
    try {
      let skyIds = await SkyId.find({ userId });

      // Populate customer info (email, businessName, name, businessType) for VSOs viewing their customers' Sky IDs
      const skyIdsWithCustomerInfo = await Promise.all(
        skyIds.map(async (skyId) => {
          const skyIdObj: any = skyId.toObject();
          if (skyIdObj.customerId) {
            try {
              const customer = await User.findById(skyIdObj.customerId);
              if (customer) {
                skyIdObj.customerEmail = customer.email;
                skyIdObj.customerBusinessName = customer.businessName;
                skyIdObj.customerBusinessType = customer.businessType;
                // Combine firstName and lastName for customer name
                const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || undefined;
                skyIdObj.customerName = customerName;
              }
            } catch (error) {
              // If customer not found, continue without customer info
              console.error(`Customer not found for customerId: ${skyIdObj.customerId}`);
            }
          }
          return skyIdObj;
        })
      );

      return res.status(200).send({ message: "success", data: skyIdsWithCustomerInfo });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getNumberHistory(req: Request, res: Response) {
    const userId = req.user!._id;
    const { skyId } = req.params;
    try {
      const skyIdNumber = await SkyId.findOne({ userId, skyId });
      if (!skyIdNumber) return res.status(403).send({ message: "number does not exist" });

      const history = await NumberService.getNumberHistory(skyId);
      return res.status(200).send({ message: "success", data: history });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async replaceMappedNumber(req: Request, res: Response) {
    const userId = req.user!._id;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { error, value } = ValidateNumberSchema.checkReplaceNumber(req.body);
      if (error) return res.status(400).send(error.details[0].message);
      const { current_number, new_number, skyId, callbackUrl } = value;

      const user = await User.findById(userId);
      if (!user) return res.status(403).send({ message: "user does not exist" });

      const skyIdNumber = await SkyId.findOne({ userId, skyId });
      if (!skyIdNumber) return res.status(403).send({ message: "number does not exist" });

      // check current_number exist
      if (
        !skyIdNumber.mappedNumbers.find(
          (num) => num.number === current_number.number && num.network === current_number.network
        )
      )
        return res.status(403).send({ message: "mapped number does not exist" });

      const baseAmount = 5_000 * 100; // 5,000 naira base amount
      const vatRate = 0.075; // 7.5% VAT
      const vatAmount = Math.round(baseAmount * vatRate); // VAT amount in kobo
      const amount = baseAmount + vatAmount; // Total amount including VAT (5,375 naira)

      const transaction = new Transaction({
        type: "payment",
        amount: -amount,
        paymentType: "replaceMappedLines",
        skyId,
      });
      let wallet: IWallet | null | undefined;
      let paymentUrl: string | undefined = undefined;
      
      // Determine payment method based on user type
      if (user.accountType === "Channel_Partner") {
        // Channel Partners always use wallet
        wallet = await Wallet.findOne({ _id: userId });
        if (!wallet) return res.status(401).send({ message: "wallet not found" });
        if (wallet.amount < amount) return res.status(402).send({ message: "insufficient balance" });
        await Wallet.updateOne({ _id: userId }, { $inc: { amount: -amount } }, { session });
      } else if (user.accountType === "VSO") {
        // Check if VSO has wallet (Platinum VSO) or agentCode (Silver VSO)
        wallet = await Wallet.findOne({ _id: userId });
        const agentCode = await AgentCode.findOne({ createdFor: userId.toString() });
        
        if (wallet) {
          // Platinum VSO - use wallet
          if (wallet.amount < amount) return res.status(402).send({ message: "insufficient balance" });
          await Wallet.updateOne({ _id: userId }, { $inc: { amount: -amount } }, { session });
        } else if (agentCode) {
          // Silver VSO with agentCode - use Zainpay
          const payment = await ZainpayHelper.initializeTransaction(amount / 100, user.email!, user.phoneNumber!, callbackUrl);
          paymentUrl = payment.data;
          transaction.txnRef = payment.txnRef;
        } else {
          return res.status(401).send({ message: "VSO has neither wallet nor agent code" });
        }
      } else if (user.accountType === "Individual") {
        // Individual users use Zainpay
        const payment = await ZainpayHelper.initializeTransaction(amount / 100, user.email!, user.phoneNumber!, callbackUrl);
        paymentUrl = payment.data;
        transaction.txnRef = payment.txnRef;
      } else {
        // Agent or other types - use Zainpay
        const payment = await ZainpayHelper.initializeTransaction(amount / 100, user.email!, user.phoneNumber!, callbackUrl);
        paymentUrl = payment.data;
        transaction.txnRef = payment.txnRef;
      }
      transaction.accountNumber = wallet ? wallet.accountNumber : undefined;
      transaction.status = wallet ? "success" : "pending";
      await transaction.save({ session });

      // store request record
      const replaceReq = new SwitchTeamRequest({
        request_type: "replace",
        skyId: skyIdNumber.skyId,
        current_number,
        new_number,
        txnRef: transaction._id.toString(),
        amount,
        status: wallet ? "pending" : "awaiting",
        createdBy: userId,
      });
      await replaceReq.save({ session });
      await session.commitTransaction();
      return res.status(200).send({ message: "success", data: { ...transaction.toObject(), paymentUrl } });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to replace mapped number: ${(error as Error).message}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async removeMappedNumber(req: Request, res: Response) {
    const userId = req.user!._id;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { skyId, current_number } = req.body;

      if (!skyId || !current_number || !current_number.number || !current_number.network) {
        return res.status(400).send({ message: "skyId and current_number are required" });
      }

      const user = await User.findById(userId).session(session);
      if (!user) return res.status(403).send({ message: "user does not exist" });

      const skyIdNumber = await SkyId.findOne({ userId, skyId }).session(session);
      if (!skyIdNumber) return res.status(403).send({ message: "number does not exist" });

      // check current_number exists
      if (
        !skyIdNumber.mappedNumbers.find(
          (num) => num.number === current_number.number && num.network === current_number.network
        )
      )
        return res.status(403).send({ message: "mapped number does not exist" });

      // Create switch team request for removal (no payment required)
      const removeReq = new SwitchTeamRequest({
        request_type: "remove",
        skyId: skyIdNumber.skyId,
        current_number,
        amount: 0, // Free removal
        status: "pending",
        createdBy: userId,
      });
      await removeReq.save({ session });
      await session.commitTransaction();
      return res.status(200).send({ message: "success", data: removeReq });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to remove mapped number: ${(error as Error).message}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async buyAddons(req: Request, res: Response) {
    const userId = req.user!._id;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { error, value } = ValidateNumberSchema.buyAddons(req.body);
      if (error) return res.status(400).send(error.details[0].message);

      const user = await User.findById(userId);
      if (!user) return res.status(403).send({ message: "user does not exist" });

      const skyId = await SkyId.findOne({ userId, skyId: value.skyId });
      if (!skyId) return res.status(403).send({ message: "invalid skyid" });

      if (value.ivr && skyId.withIVR) return res.status(400).send({ message: "ivr already enabled" });
      if (value.ivm && skyId.withIVM) return res.status(400).send({ message: "ivm already enabled" });

      let amount = 0;
      if (value.ivr) amount += 20_000;
      if (value.ivm) amount += 20_000;
      amount *= 100;

      if (amount === 0) return res.status(400).send({ message: "no addon selected" });

      const transaction = new Transaction({
        type: "payment",
        amount: -amount,
        paymentType: "buyAddons",
        skyId: skyId.skyId,
        ivr: value.ivr,
        ivm: value.ivm,
      });
      let wallet: IWallet | null | undefined;
      let paymentUrl: string | undefined;
      if (user.accountType === "Individual") {
        // create finance request for individuals
        // if (!value.bankName || !value.bankAccountName || !value.bankAccountNumber)
        //   return res.status(400).send({ message: "Invalid bank details" });
        // const financeReq = new FinanceTeamRequest({
        //   request_type: "deposit",
        //   status: "pending",
        //   txnRef: transaction._id.toString(),
        //   amount,
        //   phoneNumber: user.phoneNumber,
        //   bankName: value.bankName,
        //   bankAccountName: value.bankAccountName,
        //   bankAccountNumber: value.bankAccountNumber,
        // });
        // await financeReq.save({ session });
        const payment = await ZainpayHelper.initializeTransaction(amount / 100, user.email!, user.phoneNumber!, value.callbackUrl);
        paymentUrl = payment.data;
        transaction.txnRef = payment.txnRef;
      } else {
        // immediately update skyid
        skyId.withIVR = value.ivr ?? false;
        skyId.withIVM = value.ivm ?? false;
        await skyId.save({ session });
        // use wallet for channel partners & VSOs
        wallet = await Wallet.findOne({ _id: userId });
        if (!wallet) return res.status(401).send({ message: "wallet not found" });
        if (wallet.amount < amount) return res.status(402).send({ message: "insufficient balance" });

        // deduct amount from wallet
        await Wallet.updateOne({ _id: userId }, { $inc: { amount: -amount } }, { session });
      }

      transaction.accountNumber = wallet ? wallet.accountNumber : undefined;
      transaction.status = wallet ? "success" : "pending";
      await transaction.save({ session });

      await session.commitTransaction();
      return res.status(200).send({ message: "success", data: { ...transaction.toObject(), paymentUrl } });
    } catch (error) {
      await session.abortTransaction();
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async uploadAddon(req: Request, res: Response) {
    const userId = req.user!._id;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { error, value } = ValidateNumberSchema.uploadAddon(JSON.parse(req.body.data));
      if (error) return res.status(400).send(error.details[0].message);

      const user = await User.findById(userId);
      if (!user) return res.status(403).send({ message: "user does not exist" });

      const skyId = await SkyId.findOne({ userId, skyId: value.skyId });
      if (!skyId) return res.status(403).send({ message: "invalid skyid" });

      if (!value.ivr && !value.ivm) return res.status(400).send({ message: "no addon selected" });
      if (value.ivr && value.ivm) return res.status(400).send({ message: "select only one addon" });

      const file = req.file;
      if (!file) return res.status(400).send({ message: "no file uploaded" });

      if (value.ivr && !skyId.withIVR) return res.status(402).send({ message: "ivr not enabled" });
      if (value.ivm && !skyId.withIVM) return res.status(402).send({ message: "ivm not enabled" });

      const key = value.ivr ? "ivr" : "ivm";
      const storageFile = await uploadFile(file.path, `${key}/${value.skyId}/${value.name}`, file.mimetype);
      await storageFile.makePublic();
      const fileUrl = `https://storage.googleapis.com/${storageFile.bucket.name}/${storageFile.name}`;

      const enablementReq = new CustomerEnablementRequest({
        request_type: key,
        skyId: skyId.skyId,
        status: "pending",
        fileUrl,
      });

      await enablementReq.save({ session });
      await session.commitTransaction();
      return res.status(200).send({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error("Failed to upload addon", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async deleteAddon(req: Request, res: Response) {
    const userId = req.user!._id;
    try {
      const { error, value } = ValidateNumberSchema.deleteAddon(req.body);
      if (error) return res.status(400).send(error.details[0].message);

      const user = await User.findById(userId);
      if (!user) return res.status(403).send({ message: "user does not exist" });

      const skyId = await SkyId.findOne({ userId, skyId: value.skyId });
      if (!skyId) return res.status(403).send({ message: "invalid skyid" });

      await CustomerEnablementRequest.deleteOne({
        _id: value.requestId,
        skyId: value.skyId,
      });
      return res.status(200).send({ message: "success" });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getAddonStatus(req: Request, res: Response) {
    const userId = req.user!._id;
    try {
      const { skyId } = req.query;
      let skyIds;
      if (typeof skyId === "string") {
        skyIds = [skyId];
      } else {
        skyIds = skyId;
      }
      if (!Array.isArray(skyIds)) return res.status(400).send({ message: "invalid request" });

      const user = await User.findById(userId);
      if (!user) return res.status(403).send({ message: "user does not exist" });

      const data = [];
      for (const skyId of skyIds) {
        const skyIdRecord = await SkyId.findOne({ userId, skyId });
        if (!skyIdRecord) return res.status(403).send({ message: "invalid skyid" });

        type AddonStatus = {
          skyId: string;
          ivr: {
            status: string;
            requestId?: string;
            name?: string;
            remark?: string;
          };
          ivm: {
            status: string;
            requestId?: string;
            name?: string;
            remark?: string;
          };
        };
        const currentData: AddonStatus = {
          skyId: skyId.toString(),
          ivr: { status: "No IVR" },
          ivm: { status: "No IVM" },
        };
        if (skyIdRecord.withIVR) {
          currentData.ivr.status = "Awaiting IVR";
          const enablementReq = await CustomerEnablementRequest.findOne({
            skyId,
            request_type: "ivr",
          }).sort({ createdAt: -1 });
          if (enablementReq) {
            currentData.ivr.requestId = enablementReq._id.toString();
            currentData.ivr.name = enablementReq.fileUrl.split("/").at(-1);
            switch (enablementReq.status) {
              case "pending":
                currentData.ivr.status = "Awaiting Approval";
                break;
              case "approved":
                currentData.ivr.status = "IVR Added";
                break;
              case "rejected":
                currentData.ivr.status = "Rejected";
                currentData.ivr.remark = enablementReq.remark;
                break;
            }
          }
        }

        if (skyIdRecord.withIVM) {
          currentData.ivm.status = "Awaiting IVM";
          const enablementReq = await CustomerEnablementRequest.findOne({
            skyId,
            request_type: "ivm",
          }).sort({ createdAt: -1 });
          if (enablementReq) {
            currentData.ivm.requestId = enablementReq._id.toString();
            currentData.ivm.name = enablementReq.fileUrl.split("/").at(-1);
            switch (enablementReq.status) {
              case "pending":
                currentData.ivm.status = "Awaiting Approval";
                break;
              case "approved":
                currentData.ivm.status = "IVM Added";
                break;
              case "rejected":
                currentData.ivm.status = "Rejected";
                currentData.ivm.remark = enablementReq.remark;
                break;
            }
          }
        }

        data.push(currentData);
      }

      return res.status(200).send({ message: "success", data });
    } catch (error) {
      console.error("Error getting addon status: ", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async updateMappedNumbers(req: Request, res: Response) {
    const userId = req.user!._id;
    const { skyId, mappedNumbers, callbackUrl } = req.body;

    if (!skyId || !Array.isArray(mappedNumbers)) {
      return res.status(400).send({ message: "skyId and mappedNumbers are required" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const skyIdRecord = await SkyId.findOne({ skyId }).session(session);
      if (!skyIdRecord) {
        await session.abortTransaction();
        return res.status(404).send({ message: "SkyId not found" });
      }

      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(401).send({ message: "user not found" });
      }

      const currentNumbers = skyIdRecord.mappedNumbers || [];
      const currentNumbersSet = new Set(currentNumbers.map((n: any) => n.number));
      const trulyNewNumbers = mappedNumbers.filter((n: any) => !currentNumbersSet.has(n.number));
      const newCount = trulyNewNumbers.length;

      if (newCount === 0) {
        await session.abortTransaction();
        return res.status(400).send({ message: "No new mapped numbers to add" });
      }

      let amount = newCount * 15_000;
      amount = amount * 1.075; // add vat 7.5%
      amount *= 100; // convert to kobo

      const transaction = new Transaction({
        type: "payment",
        amount: -amount,
        paymentType: "addMappedNumbers",
        skyId,
        mappedNumbers: trulyNewNumbers,
      });

      let paymentUrl: string | undefined;
      let wallet: IWallet | null | undefined;

      if (user.accountType === "Individual") {
        const payment = await ZainpayHelper.initializeTransaction(
          amount / 100,
          user.email!,
          user.phoneNumber!,
          callbackUrl
        );
        paymentUrl = payment.data;
        transaction.txnRef = payment.txnRef;
      } else {
        wallet = await Wallet.findOne({ _id: userId }).session(session);
        if (!wallet) {
          await session.abortTransaction();
          return res.status(401).send({ message: "wallet not found" });
        }
        if (wallet.amount < amount) {
          await session.abortTransaction();
          return res.status(402).send({ message: "insufficient balance" });
        }
        await Wallet.updateOne({ _id: userId }, { $inc: { amount: -amount } }, { session });
        transaction.accountNumber = wallet.accountNumber;
      }

      transaction.status = wallet ? "success" : "pending";
      await transaction.save({ session });

      const switchReq = new SwitchTeamRequest({
        request_type: "addMappedNumbers",
        skyId,
        mappedNumbers: trulyNewNumbers,
        amount,
        status: wallet ? "pending" : "awaiting",
        createdBy: userId,
        txnRef: transaction._id.toString(),
      });
      await switchReq.save({ session });

      await session.commitTransaction();
      return res.status(200).send({ message: "success", data: { ...transaction.toObject(), paymentUrl } });
    } catch (error) {
      await session.abortTransaction();
      console.error("Failed to add mapped numbers:", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  // static async updateMappedNumbers(req: Request, res: Response) {
  //   const userId = req.user!._id;
  //   const { skyId, mappedNumbers } = req.body;

  //   if (!skyId || !Array.isArray(mappedNumbers)) {
  //     return res.status(400).send({ message: "skyId and mappedNumbers are required" });
  //   }

  //   // Find the skyId record for this user
  //   const skyIdRecord = await SkyId.findOne({ userId, skyId });
  //   if (!skyIdRecord) {
  //     return res.status(404).send({ message: "SkyId not found" });
  //   }

  //   // Find which mappedNumbers are new (by number)
  //   const currentNumbers = skyIdRecord.mappedNumbers || [];
  //   const currentNumbersSet = new Set(currentNumbers.map((n: any) => n.number));
  //   const trulyNewNumbers = mappedNumbers.filter((n: any) => !currentNumbersSet.has(n.number));
  //   const newCount = trulyNewNumbers.length;

  //   if (newCount === 0) {
  //     return res.status(400).send({ message: "No new mapped numbers to add" });
  //   }

  //   // Calculate amount
  //   const amount = newCount * 15_000 * 100; // in kobo

  //   // Create switch team request
  //   const switchReq = new SwitchTeamRequest({
  //     request_type: "addMappedNumbers",
  //     skyId,
  //     userId,
  //     mappedNumbers: trulyNewNumbers,
  //     amount,
  //     status: "pending",
  //   });
  //   await switchReq.save();

  //   return res.status(200).send({ message: "Request submitted for approval", data: switchReq });
  // }

  // static async updateMappedNumbers(req: Request, res: Response) {
  //   const userId = req.user!._id;
  //   const { skyId, mappedNumbers } = req.body;

  //   if (!skyId || !Array.isArray(mappedNumbers)) {
  //     return res.status(400).send({ message: "skyId and mappedNumbers are required" });
  //   }

  //   try {
  //     // Find the skyId record for this user
  //     const skyIdRecord = await SkyId.findOne({ userId, skyId });
  //     if (!skyIdRecord) {
  //       return res.status(404).send({ message: "SkyId not found" });
  //     }

  //     // Update mappedNumbers
  //     skyIdRecord.mappedNumbers = mappedNumbers;
  //     await skyIdRecord.save();

  //     return res.status(200).send({ message: "Mapped numbers updated", data: skyIdRecord });
  //   } catch (error) {
  //     console.error("Failed to update mapped numbers:", error);
  //     return res.status(500).json({ message: "Internal Server Error!" });
  //   }
  // }
}
