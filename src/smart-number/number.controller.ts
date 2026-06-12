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
import AddonSync from "./addon.model";
import { AstppClient } from "../astpp/astpp.service";
import fs from "fs";
import { ZainpayHelper } from "../zainpay/zainpay.controller";
import { IWallet } from "../wallet/wallet.type";
import ValidateNumberSchema from "./number.schema";
import { IPhoneNumber, IBuyNumber } from "./number.types";
import AgentCode from "../agent/agent.code.model";

dotenv.config();

const IVR_COST = 10_000;
const IVR_REPLACE_COST = 5_000;

// Cached result of whether the (default) MongoDB connection supports
// multi-document transactions. Standalone servers (typical local dev) do not;
// only replica sets / mongos do. When unsupported we fall back to plain writes.
let _txnSupport: boolean | undefined;
async function dbSupportsTransactions(): Promise<boolean> {
  if (_txnSupport !== undefined) return _txnSupport;
  try {
    const admin = mongoose.connection.db?.admin();
    const info: any = admin ? await admin.command({ hello: 1 }) : {};
    _txnSupport = Boolean(info.setName || info.msg === "isdbgrid");
  } catch {
    _txnSupport = false;
  }
  if (!_txnSupport) {
    console.warn("⚠️  MongoDB does not support transactions (standalone) - buyNumber will use non-transactional writes.");
  }
  return _txnSupport;
}

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
    // Do validation and checks BEFORE starting transaction
    try {
      console.log("buyNumber request body:", JSON.stringify(req.body, null, 2));
      console.log("req.user:", req.user);

      // For signup flows, don't include _id in validation payload
      // For regular flows, use req.user._id or req.body._id
      const validationPayload: any = { ...req.body };

      if (req.body.isSignup) {
        // For signup flows, _id is optional - don't force it
        // Only include _id if it's explicitly provided
        if (!validationPayload._id) {
          delete validationPayload._id;
        }
      } else {
        // For regular flows, use req.user._id or req.body._id
        validationPayload._id = req.user?._id || req.body._id;
      }

      console.log("Validation payload:", JSON.stringify(validationPayload, null, 2));

      const { error, value } = ValidateNumberSchema.buyNumber(validationPayload);

      if (error) {
        console.error("Validation error:", error.details);
        return res.status(400).send({ message: error.details[0].message, details: error.details });
      }

      console.log("Validated value:", JSON.stringify(value, null, 2));

      const { skyId, mappedNumbers, withIVR, withIVM, _id: userId, isSignup, email, phoneNumber } = value as IBuyNumber;

      // For signup flow, user doesn't exist yet - do validation checks without session
      let user = userId ? await User.findById(userId) : null;
      if (!isSignup && !user) {
        return res.status(401).send({ message: "user not found" });
      }

      // Check if skyId is already in use - do this before transaction
      const skyIdCheck = await SkyId.findOne({ skyId });
      if (skyIdCheck) return res.status(403).send({ message: "skyid already in use" });

      // Use a transaction only when the database supports it (replica set /
      // mongos). On a standalone dev MongoDB, transactions are unavailable, so
      // we fall back to non-transactional writes.
      const useTxn = await dbSupportsTransactions();
      const session = useTxn ? await mongoose.startSession() : null;
      if (session) session.startTransaction();

      const abortTxn = async () => {
        if (session) await session.abortTransaction();
      };
      const endTxn = async () => {
        if (session) await session.endSession();
      };

      try {
        let amount = 20_000; // primary mapping cost
        for (let i = 1 /* skip index 0 (primary mapping) */; i < mappedNumbers.length; i++) {
          amount += 15_000; // additional mapping cost
        }

        if (withIVR) amount += IVR_COST;
        if (withIVM) amount += 5_000; // ivm cost

        amount = amount * 1.075; // add vat 7%

        // adjust value in staging environment to reduce testing costs
        // 20,000 -> 1,000
        // if (process.env.NODE_ENV === "staging") {
        //   amount /= 20;
        // }

        amount *= 100; // convert to kobo

        let paymentUrl: string | undefined = undefined;
        let wallet: IWallet | null | undefined;
        let txnRef: string | undefined = undefined;

        // For signup flow, always use payment gateway
        // For existing users, determine if they should use payment gateway or wallet
        const shouldUsePaymentGateway =
          isSignup === true ||
          user?.accountType === "Individual" ||
          (user?.accountType === "Channel_Partner" && user.channelPartnerLevel === "Silver") ||
          (user?.accountType === "VSO" && user.parentChannelPartnerLevel === "Silver");

        // DEV BYPASS: when Zainpay is not configured in development, skip the
        // gateway and complete the purchase immediately so the app flow can be
        // tested without real payment. This only triggers when keys are missing,
        // so it stops automatically once ZAINPAY_* env vars are set.
        const devPaymentBypass =
          shouldUsePaymentGateway && !ZainpayHelper.isConfigured && process.env.NODE_ENV === "development";

        if (devPaymentBypass) {
          console.warn(
            "⚠️  Zainpay not configured - DEV BYPASS: completing buyNumber without payment for skyId",
            skyId
          );
          txnRef = `DEV-${Date.now()}`;
          // paymentUrl stays undefined -> app treats it as an immediate success.
        } else if (shouldUsePaymentGateway) {
          const paymentEmail = isSignup ? email! : user!.email!;
          const paymentPhone = isSignup ? phoneNumber! : user!.phoneNumber!;

          console.log("Initializing payment gateway:", {
            isSignup,
            amount: amount / 100,
            email: paymentEmail,
            phone: paymentPhone,
            callbackUrl: value.callbackUrl,
          });

          try {
            const payment = await ZainpayHelper.initializeTransaction(
              amount / 100,
              paymentEmail,
              paymentPhone,
              value.callbackUrl
            );
            console.log("Payment initialization response:", payment);
            paymentUrl = payment.data;
            txnRef = payment.txnRef;
            console.log("Payment URL set to:", paymentUrl);
          } catch (paymentError) {
            console.error("Error initializing payment:", paymentError);
            throw paymentError;
          }
        } else {
          // use wallet for Platinum Channel Partners & their VSOs
          // Check wallet with session for transaction consistency
          const walletQuery = Wallet.findOne({ _id: userId });
          wallet = await (session ? walletQuery.session(session) : walletQuery);
          if (!wallet) {
            await abortTxn();
            await endTxn();
            return res.status(401).send({ message: "wallet not found" });
          }
          if (wallet.amount < amount) {
            await abortTxn();
            await endTxn();
            return res.status(402).send({ message: "insufficient balance" });
          }

          // deduct amount from wallet
          await Wallet.updateOne(
            { _id: userId },
            { $inc: { amount: -amount } },
            session ? { session } : {}
          );
        }

        // Create transaction using Model.create with session
        const transaction = await Transaction.create(
          [
            {
              type: "payment",
              amount: -amount,
              paymentType: "buyNumber",
              skyId,
              ivr: withIVR,
              ivm: withIVM,
              accountNumber: wallet ? wallet.accountNumber : undefined,
              status: wallet || devPaymentBypass ? "success" : "pending",
              txnRef: txnRef,
              // Store signup data for account creation after payment
              ...(isSignup && {
                isSignup: true,
                signupEmail: email,
                signupPhoneNumber: phoneNumber,
              }),
            },
          ],
          session ? { session } : {}
        );

        const transactionDoc = transaction[0];

        // For signup flow, create SkyId with temporary userId (will be linked after account creation)
        // For existing users, use the user's ID
        const skyIdUserId = isSignup ? new mongoose.Types.ObjectId() : user!._id;

        // Create SkyId using Model.create with session
        await SkyId.create(
          [
            {
              skyId,
              mappedNumbers,
              withIVR,
              withIVM,
              userId: skyIdUserId,
              amount,
              // In the dev bypass we activate immediately so the number is
              // usable/visible in the app without a real payment webhook.
              status: devPaymentBypass ? "active" : "pending",
            },
          ],
          session ? { session } : {}
        );

        // Create SwitchTeamRequest using Model.create with session
        await SwitchTeamRequest.create(
          [
            {
              request_type: "buy",
              skyId,
              status: wallet || devPaymentBypass ? "pending" : "awaiting",
              txnRef: transactionDoc._id.toString(),
              mappedNumbers,
              amount,
              createdBy: skyIdUserId,
            },
          ],
          session ? { session } : {}
        );

        // Update phone number availability.
        // Note: PhoneNumber lives on a separate (Kirani) connection, so it is
        // intentionally never part of the default-connection transaction.
        if (PhoneNumber) {
          await PhoneNumber.updateOne({ number: skyId }, { available: false, usedBy: skyIdUserId, platform: "SKYID" });
        } else {
          console.warn("PhoneNumber model is not available");
        }

        if (session) await session.commitTransaction();
        console.log("buyNumber completed successfully");
        return res.status(200).send({ message: "success", data: { ...transactionDoc.toObject(), paymentUrl } });
      } catch (error) {
        await abortTxn();
        console.error("Error in buyNumber transaction:", error);
        console.error("Error details:", {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          requestBody: req.body,
        });
        return res.status(500).json({
          message: "Internal Server Error!",
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await endTxn();
      }
    } catch (error) {
      console.error("Error in buyNumber (validation/checks):", error);
      return res.status(500).json({
        message: "Internal Server Error!",
        error: error instanceof Error ? error.message : String(error),
      });
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
          const payment = await ZainpayHelper.initializeTransaction(
            amount / 100,
            user.email!,
            user.phoneNumber!,
            callbackUrl
          );
          paymentUrl = payment.data;
          transaction.txnRef = payment.txnRef;
        } else {
          return res.status(401).send({ message: "VSO has neither wallet nor agent code" });
        }
      } else if (user.accountType === "Individual") {
        // Individual users use Zainpay
        const payment = await ZainpayHelper.initializeTransaction(
          amount / 100,
          user.email!,
          user.phoneNumber!,
          callbackUrl
        );
        paymentUrl = payment.data;
        transaction.txnRef = payment.txnRef;
      } else {
        // Agent or other types - use Zainpay
        const payment = await ZainpayHelper.initializeTransaction(
          amount / 100,
          user.email!,
          user.phoneNumber!,
          callbackUrl
        );
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
    const useTxn = await dbSupportsTransactions();
    const session = useTxn ? await mongoose.startSession() : null;
    if (session) session.startTransaction();
    const abortTxn = async () => {
      if (session) await session.abortTransaction();
    };
    const endTxn = async () => {
      if (session) await session.endSession();
    };
    try {
      const { error, value } = ValidateNumberSchema.buyAddons(req.body);
      if (error) {
        await abortTxn();
        await endTxn();
        return res.status(400).send(error.details[0].message);
      }

      const user = await User.findById(userId);
      if (!user) {
        await abortTxn();
        await endTxn();
        return res.status(403).send({ message: "user does not exist" });
      }

      const skyId = await SkyId.findOne({ userId, skyId: value.skyId });
      if (!skyId) {
        await abortTxn();
        await endTxn();
        return res.status(403).send({ message: "invalid skyid" });
      }

      if (value.ivr && skyId.withIVR) {
        await abortTxn();
        await endTxn();
        return res.status(400).send({ message: "ivr already enabled" });
      }
      if (value.ivm && skyId.withIVM) {
        await abortTxn();
        await endTxn();
        return res.status(400).send({ message: "ivm already enabled" });
      }

      let amount = 0;
      if (value.ivr) amount += IVR_COST;
      if (value.ivm) amount += 20_000;
      amount *= 100;

      if (amount === 0) {
        await abortTxn();
        await endTxn();
        return res.status(400).send({ message: "no addon selected" });
      }

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

      const useGateway = user.accountType === "Individual";
      // DEV BYPASS: when Zainpay is not configured in development, enable the
      // add-on immediately without payment. Stops once ZAINPAY_* env vars exist.
      const devPaymentBypass =
        useGateway && !ZainpayHelper.isConfigured && process.env.NODE_ENV === "development";

      if (devPaymentBypass) {
        console.warn(
          "⚠️  Zainpay not configured - DEV BYPASS: enabling addon without payment for skyId",
          skyId.skyId
        );
        if (value.ivr) skyId.withIVR = true;
        if (value.ivm) skyId.withIVM = true;
        await skyId.save(session ? { session } : {});
        transaction.txnRef = `DEV-${Date.now()}`;
      } else if (useGateway) {
        const payment = await ZainpayHelper.initializeTransaction(
          amount / 100,
          user.email!,
          user.phoneNumber!,
          value.callbackUrl
        );
        paymentUrl = payment.data;
        transaction.txnRef = payment.txnRef;
      } else {
        // immediately update skyid
        skyId.withIVR = value.ivr ?? false;
        skyId.withIVM = value.ivm ?? false;
        await skyId.save(session ? { session } : {});
        // use wallet for channel partners & VSOs
        const walletQuery = Wallet.findOne({ _id: userId });
        wallet = await (session ? walletQuery.session(session) : walletQuery);
        if (!wallet) {
          await abortTxn();
          await endTxn();
          return res.status(401).send({ message: "wallet not found" });
        }
        if (wallet.amount < amount) {
          await abortTxn();
          await endTxn();
          return res.status(402).send({ message: "insufficient balance" });
        }

        // deduct amount from wallet
        await Wallet.updateOne({ _id: userId }, { $inc: { amount: -amount } }, session ? { session } : {});
      }

      transaction.accountNumber = wallet ? wallet.accountNumber : undefined;
      transaction.status = wallet || devPaymentBypass ? "success" : "pending";
      await transaction.save(session ? { session } : {});

      if (session) await session.commitTransaction();
      return res.status(200).send({ message: "success", data: { ...transaction.toObject(), paymentUrl } });
    } catch (error) {
      await abortTxn();
      console.error("Error in buyAddons:", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await endTxn();
    }
  }

  static async uploadAddon(req: Request, res: Response) {
    const userId = req.user!._id;
    const useTxn = await dbSupportsTransactions();
    const session = useTxn ? await mongoose.startSession() : null;
    if (session) session.startTransaction();
    const abortTxn = async () => {
      if (session) await session.abortTransaction();
    };
    const endTxn = async () => {
      if (session) await session.endSession();
    };
    try {
      const { error, value } = ValidateNumberSchema.uploadAddon(JSON.parse(req.body.data));
      if (error) {
        await abortTxn();
        await endTxn();
        return res.status(400).send(error.details[0].message);
      }

      const user = await User.findById(userId);
      if (!user) {
        await abortTxn();
        await endTxn();
        return res.status(403).send({ message: "user does not exist" });
      }

      const skyId = await SkyId.findOne({ userId, skyId: value.skyId });
      if (!skyId) {
        await abortTxn();
        await endTxn();
        return res.status(403).send({ message: "invalid skyid" });
      }

      if (!value.ivr && !value.ivm) {
        await abortTxn();
        await endTxn();
        return res.status(400).send({ message: "no addon selected" });
      }
      if (value.ivr && value.ivm) {
        await abortTxn();
        await endTxn();
        return res.status(400).send({ message: "select only one addon" });
      }

      const file = req.file;
      if (!file) {
        await abortTxn();
        await endTxn();
        return res.status(400).send({ message: "no file uploaded" });
      }

      const validMimeTypes = [
        "audio/wav",
        "audio/wave",
        "audio/x-wav",
        "audio/aac",
        "audio/aacp",
        "audio/x-aac",
        "audio/mp4",
        "audio/m4a",
        "audio/x-m4a",
      ];
      const lowerName = file.originalname.toLowerCase();
      const validExt =
        lowerName.endsWith(".wav") || lowerName.endsWith(".wave") || lowerName.endsWith(".aac");
      if (!validMimeTypes.includes(file.mimetype) && !validExt) {
        await abortTxn();
        await endTxn();
        return res.status(400).send({ message: "Only .wav or .aac files are allowed" });
      }

      if (value.ivr && !skyId.withIVR) {
        await abortTxn();
        await endTxn();
        return res.status(402).send({ message: "ivr not enabled" });
      }
      if (value.ivm && !skyId.withIVM) {
        await abortTxn();
        await endTxn();
        return res.status(402).send({ message: "ivm not enabled" });
      }

      const key = value.ivr ? "ivr" : "ivm";

      // DEV BYPASS: when ASTPP (telephony) is not configured in development,
      // skip cloud storage + ASTPP recording/ringback and just record the
      // addon as synced so the app flow can be tested. Stops once ASTPP_API_URL
      // is set.
      const mediaSyncConfigured = Boolean(process.env.ASTPP_API_URL);
      const devUploadBypass = !mediaSyncConfigured && process.env.NODE_ENV === "development";

      if (devUploadBypass) {
        console.warn(
          "⚠️  ASTPP not configured - DEV BYPASS: saving addon without cloud sync for skyId",
          value.skyId
        );
        const addonSync = new AddonSync({
          type: key,
          skyId: skyId.skyId,
          userId: user._id,
          fileName: value.name,
          fileUrl: `dev-local://${key}/${value.skyId}/${value.name}`,
          status: "synced",
        });
        await addonSync.save(session ? { session } : {});
        // best-effort cleanup of the temp upload
        try {
          if (file.path) fs.unlinkSync(file.path);
        } catch {
          /* ignore */
        }
        if (session) await session.commitTransaction();
        return res.status(200).send({ message: "success" });
      }

      const storageFile = await uploadFile(file.path, `${key}/${value.skyId}/${value.name}`, file.mimetype);
      await storageFile.makePublic();
      const fileUrl = `https://storage.googleapis.com/${storageFile.bucket.name}/${storageFile.name}`;

      const addonSync = new AddonSync({
        type: key,
        skyId: skyId.skyId,
        userId: user._id,
        fileName: value.name,
        fileUrl,
        status: "pending",
      });
      await addonSync.save(session ? { session } : {});

      const customerListResponse = await AstppClient.listCustomers({
        object_where_params: { number: skyId.skyId },
      });

      if (
        !customerListResponse ||
        customerListResponse.response_code !== 200 ||
        !customerListResponse.data ||
        customerListResponse.data.length === 0
      ) {
        throw new Error(`Customer with number ${skyId.skyId} not found in ASTPP.`);
      }

      const accountId = customerListResponse.data[0].accountid;

      const fileStream = fs.createReadStream(file.path);
      const recordingResponse = await AstppClient.createRecording(
        {
          recording_name: `${key}_${value.name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`,
          reseller_id: "0",
          accountid: accountId,
        },
        fileStream
      );

      if (!recordingResponse.status || !recordingResponse.data) {
        throw new Error(
          `Failed to create recording in ASTPP: ${recordingResponse.error || JSON.stringify(recordingResponse)}`
        );
      }

      const recordingId = recordingResponse.data.recording_id;

      const ringbackUpdateSuccess = await AstppClient.updateRingback(skyId.skyId, recordingId.toString());
      if (!ringbackUpdateSuccess) {
        throw new Error(`Failed to update ringback for ${skyId.skyId} in ASTPP.`);
      }

      addonSync.status = "synced";
      addonSync.astppRecordingId = recordingId.toString();
      await addonSync.save(session ? { session } : {});

      if (session) await session.commitTransaction();
      return res.status(200).send({ message: "success" });
    } catch (error) {
      await abortTxn();
      console.error("Failed to upload addon", error);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await endTxn();
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

      const addon = await AddonSync.findOne({
        _id: value.requestId,
        skyId: value.skyId,
      });

      if (addon) {
        // Skip ASTPP ringback reset when telephony isn't configured (e.g. local dev).
        const mediaSyncConfigured = Boolean(process.env.ASTPP_API_URL);
        if (addon.status === "synced" && mediaSyncConfigured) {
          const ringbackUpdateSuccess = await AstppClient.updateRingback(value.skyId, "au-ring");
          if (!ringbackUpdateSuccess) {
            console.error(`Failed to reset ringback for ${value.skyId} in ASTPP.`);
          }
        }
        await addon.deleteOne();
      }
      return res.status(200).send({ message: "success" });
    } catch (error) {
      console.error("Error deleting addon:", error);
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
          const addonRecord = await AddonSync.findOne({
            skyId,
            type: "ivr",
          }).sort({ createdAt: -1 });
          if (addonRecord) {
            currentData.ivr.requestId = addonRecord._id.toString();
            currentData.ivr.name = addonRecord.fileName;
            switch (addonRecord.status) {
              case "pending":
                currentData.ivr.status = "Awaiting Approval";
                break;
              case "synced":
                currentData.ivr.status = "IVR Added";
                break;
              case "failed":
                currentData.ivr.status = "Failed";
                break;
            }
          }
        }

        if (skyIdRecord.withIVM) {
          currentData.ivm.status = "Awaiting IVM";
          const addonRecord = await AddonSync.findOne({
            skyId,
            type: "ivm",
          }).sort({ createdAt: -1 });
          if (addonRecord) {
            currentData.ivm.requestId = addonRecord._id.toString();
            currentData.ivm.name = addonRecord.fileName;
            switch (addonRecord.status) {
              case "pending":
                currentData.ivm.status = "Awaiting Approval";
                break;
              case "synced":
                currentData.ivm.status = "IVM Added";
                break;
              case "failed":
                currentData.ivm.status = "Failed";
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
