import { Response, Request } from "express";
import User from "../user/user.model";
import dotenv from "dotenv";
import Wallet from "./wallet.model";
import Transaction from "./wallet.transaction.model";
import mongoose from "mongoose";
import FinanceTeamRequest from "../finance/finance.model";
import ValidationSchema from "./wallet.schema";

dotenv.config();

export default class WalletController {
  static async wallet(req: Request, res: Response) {
    try {
      // const { error } = validation.kyc({ ...req.body });
      // if (error) return res.status(400).send(error.details[0].message);

      let user = await User.findOne({ _id: req.body._id });
      if (!user) return res.status(400).send({ message: "User does not exist." });

      let wallet = await Wallet.findOne({ _id: req.body._id });
      if (wallet) return res.status(400).send({ message: "The same account can not have multiple wallet" });

      // Generate a unique 10-digit account number
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

      wallet = new Wallet({ ...req.body, accountNumber });
      await wallet.save();

      return res.status(200).json({ message: "success", data: wallet });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getWallet(req: Request, res: Response) {
    try {
      const userId = req.params.userId; // or req.body._id depending on how you want to pass the ID

      // Find the user
      const user = await User.findOne({ _id: userId });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Find the wallet
      const wallet = await Wallet.findOne({ _id: userId });
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found for this user" });
      }

      // Return wallet details
      return res.status(200).json({
        message: "success",
        data: wallet,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getWalletHistory(req: Request, res: Response) {
    try {
      const accountNumber = req.params.userId;

      // Retrieve the transaction history
      // Include transactions where the user is the account owner OR the recipient
      const history = await Transaction.find({
        $or: [
          { accountNumber },
          { transferRecepient: accountNumber, type: "transfer" },
        ],
      }).sort({
        createdAt: -1,
      });

      return res.status(200).json({ message: "success", data: history });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async deposit(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { error, value } = ValidationSchema.deposit({ ...req.body });
      if (error) return res.status(400).send(error.details[0].message);

      const user = await User.findOne({ _id: req.user?._id });
      if (!user) return res.status(400).send({ message: "User does not exist." });

      const wallet = await Wallet.findOne({
        _id: req.user?._id,
        accountNumber: value.accountNumber,
      });
      if (!wallet) return res.status(400).send({ message: "This account does not have a wallet" });

      if (user.accountType === "VSO" || user.accountType === "Individual") {
        return res.status(403).send({ message: "You are not allow to make a deposit." });
      }

      const amount = value.amount * 100;
      const deposit = new Transaction({
        type: "deposit",
        status: "pending",
        accountNumber: value.accountNumber,
        amount,
      });

      switch (user.accountType) {
        case "Channel_Partner": {
          const financeReq = new FinanceTeamRequest({
            request_type: "deposit",
            accountNumber: value.accountNumber,
            status: "pending",
            txnRef: deposit._id.toString(),
            amount,
            userId: user._id.toString(),
            phoneNumber: user.phoneNumber,
            bankName: value.bankName,
            bankAccountName: value.bankAccountName,
            bankAccountNumber: value.bankAccountNumber,
          });
          await financeReq.save({ session });
          break;
        }
      }

      await deposit.save({ session });
      await session.commitTransaction();
      return res.status(200).json({ message: "success", data: deposit });
    } catch (error) {
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async withdraw(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const userId = req.user!._id;
      const { error, value } = ValidationSchema.withdraw({ ...req.body });
      if (error) return res.status(400).send(error.details[0].message);

      let { accountNumber, amount, bankName, bankAccountName, bankAccountNumber } = value;

      // Find the user
      const user = await User.findOne({ _id: userId });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Find the wallet
      const wallet = await Wallet.findOne({ _id: userId, accountNumber });
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found for this user" });
      }

      amount *= 100; // convert to kobo

      // Check if the wallet has sufficient balance
      if (wallet.amount < amount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Update the wallet balance
      wallet.amount -= amount;
      await wallet.save({ session });

      // Record the withdrawal in the history
      const withdrawal = new Transaction({
        accountNumber,
        amount: -amount, // Negative amount for withdrawal
        status: "pending",
        type: "withdraw",
      });
      await withdrawal.save({ session });

      const financeReq = new FinanceTeamRequest({
        request_type: "withdraw",
        accountNumber,
        status: "pending",
        txnRef: withdrawal._id.toString(),
        amount,
        userId: user._id.toString(),
        bankName,
        bankAccountName,
        bankAccountNumber,
        phoneNumber: user.phoneNumber!,
      });
      await financeReq.save({ session });

      await session.commitTransaction();
      return res.status(200).json({ message: "Withdrawal successful", balance: wallet.amount });
    } catch (error) {
      await session.abortTransaction();
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }
}
