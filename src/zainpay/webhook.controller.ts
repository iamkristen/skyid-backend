import type { Response, Request } from "express";
import crypto from "crypto";
// import { Paystack } from "../utils/paystack";
import Wallet from "../wallet/wallet.model";
import { sendMail } from "../utils/sendMail";
import { depositMoneyTemplate } from "../views/email-template";
import Transaction from "../wallet/wallet.transaction.model";
// import { WebhookMeta } from "../types";
import SwitchTeamRequest from "../switch/switch.model";
import mongoose from "mongoose";
import SkyId from "../smart-number/number.skyId.model";
import { ZainpayHelper } from "./zainpay.controller";
import User from "../user/user.model";
import AgentCode from "../agent/agent.code.model";
import AgentModel from "../agent/agent.model";

export default class WebhookController {
  // static async paystackWebhook(req: Request, res: Response) {
  //   //validate event
  //   const hash = crypto
  //     .createHmac("sha512", Paystack.secretKey)
  //     .update(JSON.stringify(req.body))
  //     .digest("hex");
  //
  //   res.send(200);
  //
  //   if (hash !== req.headers["x-paystack-signature"]) {
  //     console.log("Invalid signature");
  //     return;
  //   }
  //
  //   // handle event
  //   const eventName = req.body.event;
  //   console.log("Received paystack webhook event: ", eventName, req.body.data.reference);
  //   if (eventName !== "charge.success") {
  //     // don't handle other events
  //     return;
  //   }
  //
  //   // update skyid status
  //   const { status, data } = await Paystack.verifyTransaction<WebhookMeta>(
  //     req.body.data.reference,
  //   );
  //   if (!status) {
  //     console.error("Failed to verify transaction");
  //     return;
  //   }
  //
  //   const session = await mongoose.startSession();
  //   session.startTransaction();
  //   try {
  //     console.log("Transaction", data.metadata.type, data.metadata.skyId);
  //     switch (data.metadata.type) {
  //       case "replaceMappedNumber":
  //       case "buyNumber": {
  //         const transaction = await Transaction.findOneAndUpdate(
  //           { txnRef: data.reference },
  //           { $set: { status: "success" } },
  //           { session }
  //         );
  //         if (!transaction) {
  //           console.error(`Transaction(${data.reference}) Failed: Transaction not found`);
  //           return;
  //         }
  //         await SwitchTeamRequest.updateOne(
  //           { txnRef: transaction._id.toString() },
  //           { $set: { status: "pending" } },
  //           { session }
  //         );
  //         break;
  //       }
  //       case "buyAddons": {
  //         const transaction = await Transaction.findOneAndUpdate(
  //           { txnRef: data.reference },
  //           { $set: { status: "success" } },
  //           { session }
  //         );
  //         if (!transaction) {
  //           console.error(`Transaction(${data.reference}) Failed: Transaction not found`);
  //           return;
  //         }
  //         const updates: Record<string, boolean> = {};
  //         if (data.metadata.ivr) updates["withIVR"] = true;
  //         if (data.metadata.ivm) updates["withIVM"] = true;
  //         await SkyId.updateOne(
  //           { skyId: data.metadata.skyId },
  //           { $set: updates },
  //           { session }
  //         )
  //         break;
  //       }
  //     }
  //
  //     await session.commitTransaction();
  //     console.log(`Transaction(${data.reference}) success`);
  //   } catch (error) {
  //     await session.abortTransaction();
  //     console.error(`Transaction(${data.reference}) Failed: ${error}`);
  //   } finally {
  //     await session.endSession();
  //   }
  // }

  static async zainpayWebhook(req: Request, res: Response) {
    const hash = crypto
      .createHmac("sha256", ZainpayHelper.secretKey)
      .update((req as unknown as { rawBody: string }).rawBody)
      .digest("hex");

    res.sendStatus(200);

    if (hash !== req.headers["zainpay-signature"]) {
      console.log("Invalid signature");
      return;
    }

    const body = req.body as ZainpayApiResponse<DepositSuccess>;
    console.log("Received zainpay webhook event: ", body.event);

    if (body.event === "deposit.success") {
      await handlePaymentSuccess(body.data);
    }
  }
}

interface ZainpayApiResponse<T> {
  data: T;
  event: "transfer.success" | "transfer.failed" | "card.success" | "deposit.success";
}

interface DepositSuccess {
  depositedAmount: string;
  txnChargesAmount: string;
  amountAfterCharges: string;
  bankName: string;
  beneficiaryAccountName: string;
  beneficiaryAccountNumber: string;
  narration: string;
  paymentDate: string;
  paymentRef: string;
  sender: string;
  senderName: string;
  txnDate: string;
  txnRef: string;
  txnType: string;
  zainboxCode: string;
  callBackUrl: string;
  emailNotification: string;
  zainboxName: string;
}

async function handlePaymentSuccess(data: DepositSuccess) {
  const transaction = await Transaction.findOne({ txnRef: data.txnRef });
  if (!transaction) {
    console.error(`Transaction(${data.txnRef}) Failed: Transaction not found`);
    return;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    transaction.status = "success";
    await transaction.save({ session });
    console.log("Transaction", transaction.paymentType, transaction.skyId);
    switch (transaction.paymentType) {
      case "replaceMappedLines":
      case "addMappedNumbers":
      case "buyNumber": {
        await SwitchTeamRequest.updateOne(
          { txnRef: transaction._id.toString() },
          { $set: { status: "pending" } },
          { session }
        );
        break;
      }
      case "buyAddons": {
        const updates: Record<string, boolean> = {};
        if (transaction.ivr) updates["withIVR"] = true;
        if (transaction.ivm) updates["withIVM"] = true;
        await SkyId.updateOne({ skyId: transaction.skyId }, { $set: updates }, { session });
        break;
      }
    }

    if (transaction.paymentType === "buyNumber") {
      // initiate payout
      const skyId = await SkyId.findOne({ skyId: transaction.skyId }, undefined, { session });
      if (!skyId) throw new Error("SkyId not found");
      const user = await User.findOne({ _id: skyId.userId }, undefined, { session });
      const agentCode = user?.agentCode?.trim();
      if (agentCode) {
        const code = await AgentCode.findOne({ code: agentCode }, undefined, { session });
        if (!code) throw new Error("AgentCode not found");
        const agent = await AgentModel.findOne({ _id: code.createdFor }, undefined, { session });
        if (!agent) throw new Error("Agent not found");
        const payoutAmount = code.allocationPercent * Math.abs(transaction.amount);
        const payout = await ZainpayHelper.fundsTransfer(
          payoutAmount,
          { bankCode: agent.bankCode!, accountNumber: agent.accountNumber! },
          "SkyID purchase commission"
        );
        const payoutTxn = new Transaction({
          amount: payoutAmount,
          type: "payout",
          txnRef: payout.txnRef,
          transferRecepient: code.createdFor,
        });
        await payoutTxn.save({ session });
      }
    }

    await session.commitTransaction();
    console.log(`Transaction(${data.txnRef}) success`);
  } catch (error) {
    await session.abortTransaction();
    console.error(`Transaction(${data.txnRef}) Failed: ${error}`);
  } finally {
    await session.endSession();
  }
}
