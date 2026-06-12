import type { Response, Request } from "express";
import * as crypto from "crypto";
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
import EmailService from "../utils/EmailService";
import Bcrypt from "../utils/bcryptService";
import { generatePassword } from "../utils/generateOtp";
import PhoneNumber from "../smart-number/number.phoneNumbers.model";
import Kyc from "../kyc/kyc.model";

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
      console.warn("[webhook] Invalid signature — possible spoofed request from", req.headers["x-forwarded-for"] ?? req.socket.remoteAddress);
      return;
    }

    const body = req.body as ZainpayApiResponse<DepositSuccess>;
    console.log(`[webhook] Received event: ${body.event} txnRef=${body.data?.txnRef}`);

    if (body.event === "deposit.success") {
      await handlePaymentSuccess(body.data);
    } else if (body.event === "deposit.failed" || body.event === "transfer.failed") {
      await handlePaymentFailure(body.data);
    } else {
      console.warn(`[webhook] Unhandled event type: ${body.event} txnRef=${body.data?.txnRef}`);
    }
  }
}

interface ZainpayApiResponse<T> {
  data: T;
  event: "transfer.success" | "transfer.failed" | "card.success" | "deposit.success" | "deposit.failed";
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

import { AstppClient } from "../astpp/astpp.service";

async function handlePaymentSuccess(data: DepositSuccess) {
  const transaction = await Transaction.findOne({ txnRef: data.txnRef });
  if (!transaction) {
    console.error(`[payment-success] Transaction not found txnRef=${data.txnRef}`);
    return;
  }

  console.log(`[payment-success] Processing txnRef=${data.txnRef} type=${transaction.paymentType} skyId=${transaction.skyId} amount=${transaction.amount} isSignup=${transaction.isSignup}`);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    transaction.status = "success";
    await transaction.save({ session });

    // Handle signup flow - create user account if this is a signup transaction
    if (transaction.isSignup && transaction.signupEmail && transaction.signupPhoneNumber) {
      console.log(`[signup-flow] Starting user provisioning txnRef=${data.txnRef} skyId=${transaction.skyId} email=${transaction.signupEmail}`);

      // Check if user already exists
      let user = await User.findOne({ email: transaction.signupEmail.toLowerCase().trim() }, undefined, { session });

      if (!user) {
        // Generate a random password
        const tempPassword = generatePassword(12);
        const hashedPassword = Bcrypt.shared().encode(tempPassword);

        // Extract first name from email (before @) or use a default
        const emailParts = transaction.signupEmail.split("@");
        const firstName = emailParts[0].split(".")[0] || "User";
        const capitalizedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

        // Create user account
        user = new User({
          email: transaction.signupEmail.toLowerCase().trim(),
          phoneNumber: transaction.signupPhoneNumber,
          password: hashedPassword,
          firstName: capitalizedFirstName,
          lastName: "",
          accountType: "Individual",
          status: "active",
          verified: "false",
          mustChangePassword: true,
        });
        await user.save({ session });
        console.log(`[signup-flow] User account created userId=${user._id} txnRef=${data.txnRef}`);

        // Create wallet for the user
        let accountNumber;
        let isUnique = false;
        while (!isUnique) {
          accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
          const existingWallet = await Wallet.findOne({ accountNumber }, undefined, { session });
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
        console.log(`[signup-flow] Wallet created userId=${user._id} txnRef=${data.txnRef}`);

        // Update SkyId with the real userId
        const skyIdDoc = await SkyId.findOne({ skyId: transaction.skyId }, undefined, { session });
        if (skyIdDoc) {
          skyIdDoc.userId = user._id;
          await skyIdDoc.save({ session });
          console.log(`[signup-flow] SkyId linked to new user skyId=${transaction.skyId} userId=${user._id}`);
        } else {
          console.warn(`[signup-flow] SkyId document not found during provisioning skyId=${transaction.skyId} txnRef=${data.txnRef}`);
        }

        // Update SwitchTeamRequest with the real userId
        const switchRequest = await SwitchTeamRequest.findOne({ txnRef: transaction._id.toString() }, undefined, {
          session,
        });
        if (switchRequest) {
          switchRequest.createdBy = user._id.toString();
          await switchRequest.save({ session });
          console.log(`[signup-flow] SwitchTeamRequest linked to new user userId=${user._id} txnRef=${data.txnRef}`);
        } else {
          console.warn(`[signup-flow] SwitchTeamRequest not found txnRef=${data.txnRef}`);
        }

        // Send email with login credentials
        const loginUrl = process.env.FRONTEND_URL || "https:/app.skyid.ng/login";
        try {
          await EmailService.sendIndividualSignupSuccess(
            transaction.signupEmail,
            capitalizedFirstName,
            loginUrl,
            transaction.signupEmail,
            tempPassword,
            "SKY ID"
          );
          console.log(`[signup-flow] Welcome email dispatched to=${transaction.signupEmail} txnRef=${data.txnRef}`);
        } catch (emailError) {
          console.error(`[signup-flow] Failed to send welcome email to=${transaction.signupEmail} txnRef=${data.txnRef}`, emailError);
          // Don't throw - email failure shouldn't fail the transaction
        }
      } else {
        console.log(`[signup-flow] User already exists, linking existing account email=${transaction.signupEmail} txnRef=${data.txnRef}`);
        // Update SkyId and SwitchTeamRequest with existing user
        const skyIdDoc = await SkyId.findOne({ skyId: transaction.skyId }, undefined, { session });
        if (skyIdDoc) {
          skyIdDoc.userId = user._id;
          await skyIdDoc.save({ session });
          // Individual: one KYC for all numbers — if they already have KYC, link this number
          if ((user).accountType === "Individual") {
            const hasKyc = await Kyc.findOne({ user_id: user._id }, null, { session });
            if (hasKyc) {
              skyIdDoc.customerId = user._id.toString();
              await skyIdDoc.save({ session });
            }
          }
        }
        const switchRequest = await SwitchTeamRequest.findOne({ txnRef: transaction._id.toString() }, undefined, {
          session,
        });
        if (switchRequest) {
          switchRequest.createdBy = user._id.toString();
          await switchRequest.save({ session });
        }
      }
    }

    console.log(`[payment-success] Handling payment type=${transaction.paymentType} txnRef=${data.txnRef} skyId=${transaction.skyId}`);

    switch (transaction.paymentType) {
      case "replaceMappedLines":
      case "addMappedNumbers":
      case "buyNumber": {
        await SwitchTeamRequest.updateOne(
          { txnRef: transaction._id.toString() },
          { $set: { status: "pending" } },
          { session }
        );

        const switchReq = await SwitchTeamRequest.findOne({ txnRef: transaction._id.toString() }, undefined, {
          session,
        });
        const skyIdDocToSync = await SkyId.findOne({ skyId: transaction.skyId }, undefined, { session });

        if (transaction.skyId && switchReq && skyIdDocToSync) {
          let extensions: any[] = [];
          const reqObj = switchReq as any;
          if (transaction.paymentType === "buyNumber") {
            extensions = reqObj.mappedNumbers || [];
          } else if (transaction.paymentType === "addMappedNumbers") {
            extensions = [...(skyIdDocToSync.mappedNumbers || []), ...(reqObj.mappedNumbers || [])];
          } else if (transaction.paymentType === "replaceMappedLines") {
            extensions = (skyIdDocToSync.mappedNumbers || []).filter(
              (n: any) => n.number !== reqObj.current_number?.number
            );
            if (reqObj.new_number) {
              extensions.push(reqObj.new_number);
            }
          }

          const extensionsData = extensions.map((ext: any) => ({
            number: ext.number,
          }));
          console.log(`[astpp-sync] Syncing ring group skyId=${transaction.skyId} type=${transaction.paymentType} extensions=${extensionsData.length} txnRef=${data.txnRef}`);
          try {
            const syncSuccess = await AstppClient.syncRingGroupForDid(transaction.skyId, extensionsData);
            if (syncSuccess) {
              console.log(`[astpp-sync] Sync succeeded skyId=${transaction.skyId} txnRef=${data.txnRef}`);
              await SwitchTeamRequest.updateOne(
                { _id: switchReq._id },
                { $set: { status: "approved", handledBy: "AUTO_MAP" } },
                { session }
              );

              if (transaction.paymentType === "buyNumber") {
                await SkyId.updateOne({ skyId: transaction.skyId }, { $set: { status: "active" } }, { session });
              } else if (
                transaction.paymentType === "addMappedNumbers" ||
                transaction.paymentType === "replaceMappedLines"
              ) {
                await SkyId.updateOne(
                  { skyId: transaction.skyId },
                  { $set: { mappedNumbers: extensions } },
                  { session }
                );
              }
            } else {
              console.warn(`[astpp-sync] Sync returned falsy — SwitchTeamRequest left pending skyId=${transaction.skyId} txnRef=${data.txnRef}`);
            }
          } catch (err) {
            console.error(`[astpp-sync] Sync threw an exception skyId=${transaction.skyId} txnRef=${data.txnRef}`, err);
          }
        } else {
          console.warn(`[astpp-sync] Skipped — missing skyId, switchReq, or skyIdDoc skyId=${transaction.skyId} hasSwitchReq=${!!switchReq} hasSkyIdDoc=${!!skyIdDocToSync} txnRef=${data.txnRef}`);
        }
        break;
      }
      case "buyAddons": {
        const updates: Record<string, boolean> = {};
        if (transaction.ivr) updates["withIVR"] = true;
        if (transaction.ivm) updates["withIVM"] = true;
        console.log(`[buyAddons] Updating addon flags skyId=${transaction.skyId} updates=${JSON.stringify(updates)} txnRef=${data.txnRef}`);
        await SkyId.updateOne({ skyId: transaction.skyId }, { $set: updates }, { session });
        break;
      }
    }

    if (transaction.paymentType === "buyNumber") {
      // Get user and skyId for email and payout
      const skyId = await SkyId.findOne({ skyId: transaction.skyId }, undefined, { session });
      if (!skyId) throw new Error("SkyId not found");
      const user = await User.findOne({ _id: skyId.userId }, undefined, {
        session,
      });

      // Send purchase confirmation email to existing Individual users only (non-signup, non-VSO)
      if (user && !transaction.isSignup && user.accountType === "Individual" && user.email && user.firstName) {
        try {
          await EmailService.sendSmartNumberPurchaseConfirmation(
            user.email,
            user.firstName,
            transaction.skyId || "",
            "SKY ID"
          );
          console.log(`[payment-success] Purchase confirmation email dispatched to=${user.email} skyId=${transaction.skyId} txnRef=${data.txnRef}`);
        } catch (emailError) {
          console.error(`[payment-success] Failed to send purchase confirmation email to=${user.email} txnRef=${data.txnRef}`, emailError);
          // Don't throw - email failure shouldn't fail the transaction
        }
      }

      // initiate payout
      if (user) {
        const agentCode = user.agentCode?.trim();
        if (user.accountType === "VSO") {
          // VSO buying their own number — split commission between the VSO and their parent channel partner
          const vsoAgentCode = await AgentCode.findOne(
            { createdFor: user._id.toString(), createdForType: "vso" },
            undefined,
            { session }
          );
          if (!vsoAgentCode) throw new Error("VSO AgentCode not found");

          const parentChannelPartner = await User.findOne({ _id: (user).createdBy }, undefined, { session });
          if (!parentChannelPartner) throw new Error("VSO parent channel partner not found");
          if (!parentChannelPartner.bankCode || !parentChannelPartner.accountNumber) {
            throw new Error("VSO parent channel partner bank details not found");
          }

          const cpAgentCode = await AgentCode.findOne(
            { createdFor: parentChannelPartner._id.toString(), createdForType: "channel_partner" },
            undefined,
            { session }
          );
          if (!cpAgentCode) throw new Error("Parent channel partner AgentCode not found");

          const baseAmount = Math.abs(transaction.amount);
          const vsoAllocationPercent = vsoAgentCode.allocationPercent;
          const parentAllocationPercent = cpAgentCode.allocationPercent - vsoAllocationPercent;

          if (vsoAllocationPercent > 0) {
            if (!(user).bankCode || !(user).accountNumber) {
              throw new Error("VSO bank details not found");
            }
            const vsoPayoutAmount = (vsoAllocationPercent / 100) * baseAmount;
            const vsoPayout = await ZainpayHelper.fundsTransfer(
              vsoPayoutAmount,
              { bankCode: (user).bankCode, accountNumber: (user).accountNumber },
              "SkyID purchase commission"
            );
            const vsoPayoutTxn = new Transaction({
              amount: vsoPayoutAmount,
              type: "payout",
              txnRef: vsoPayout.txnRef,
              transferRecepient: user._id,
            });
            await vsoPayoutTxn.save({ session });
            console.log(`[payout] VSO self-purchase commission transferred vsoId=${user._id} amount=${vsoPayoutAmount} txnRef=${data.txnRef}`);
          } else {
            console.log(`[payout] VSO allocationPercent is zero — skipping VSO transfer vsoId=${user._id} txnRef=${data.txnRef}`);
          }

          if (parentAllocationPercent > 0) {
            const parentPayoutAmount = (parentAllocationPercent / 100) * baseAmount;
            const parentPayout = await ZainpayHelper.fundsTransfer(
              parentPayoutAmount,
              { bankCode: parentChannelPartner.bankCode, accountNumber: parentChannelPartner.accountNumber },
              "SkyID purchase commission from VSO"
            );
            const parentPayoutTxn = new Transaction({
              amount: parentPayoutAmount,
              type: "payout",
              txnRef: parentPayout.txnRef,
              transferRecepient: (user).createdBy,
            });
            await parentPayoutTxn.save({ session });
            console.log(`[payout] VSO parent CP commission transferred parentId=${(user).createdBy} amount=${parentPayoutAmount} vsoId=${user._id} txnRef=${data.txnRef}`);
          } else {
            console.log(`[payout] Parent CP allocationPercent is zero — skipping parent transfer parentId=${(user).createdBy} txnRef=${data.txnRef}`);
          }
        } else if (agentCode) {
          const code = await AgentCode.findOne({ code: agentCode }, undefined, {
            session,
          });
          if (!code) throw new Error("AgentCode not found");

          const baseAmount = Math.abs(transaction.amount);
          console.log(`[payout] Initiating commission transfer agentCode=${agentCode} codeType=${code.createdForType} baseAmount=${baseAmount} txnRef=${data.txnRef}`);

          // Handle different code types
          switch (code.createdForType) {
            case "agent": {
              // Transfer to agent
              const agent = await AgentModel.findOne({ _id: code.createdFor }, undefined, { session });
              if (!agent) throw new Error("Agent not found");

              const payoutAmount = (code.allocationPercent / 100) * baseAmount;
              const payout = await ZainpayHelper.fundsTransfer(
                payoutAmount,
                {
                  bankCode: agent.bankCode!,
                  accountNumber: agent.accountNumber!,
                },
                "SkyID purchase commission"
              );
              const payoutTxn = new Transaction({
                amount: payoutAmount,
                type: "payout",
                txnRef: payout.txnRef,
                transferRecepient: code.createdFor,
              });
              await payoutTxn.save({ session });
              console.log(`[payout] Agent commission transferred agentId=${code.createdFor} amount=${payoutAmount} payoutTxnRef=${payout.txnRef} txnRef=${data.txnRef}`);
              break;
            }

            case "channel_partner": {
              // Transfer to channel partner
              const channelPartner = await User.findOne({ _id: code.createdFor }, undefined, { session });
              if (!channelPartner) throw new Error("Channel Partner not found");
              if (!channelPartner.bankCode || !channelPartner.accountNumber) {
                throw new Error("Channel Partner bank details not found");
              }

              const payoutAmount = (code.allocationPercent / 100) * baseAmount;
              const payout = await ZainpayHelper.fundsTransfer(
                payoutAmount,
                { bankCode: channelPartner.bankCode, accountNumber: channelPartner.accountNumber },
                "SkyID purchase commission"
              );
              const payoutTxn = new Transaction({
                amount: payoutAmount,
                type: "payout",
                txnRef: payout.txnRef,
                transferRecepient: code.createdFor,
              });
              await payoutTxn.save({ session });
              console.log(`[payout] Channel partner commission transferred partnerId=${code.createdFor} amount=${payoutAmount} payoutTxnRef=${payout.txnRef} txnRef=${data.txnRef}`);
              break;
            }

            case "vso": {
              // Validate VSO
              const vso = await User.findOne({ _id: code.createdFor }, undefined, { session });
              if (!vso) throw new Error("VSO not found");
              if (!vso.bankCode || !vso.accountNumber) {
                throw new Error("VSO bank details not found");
              }
              if (!vso.createdBy) throw new Error("VSO parent channel partner not found");

              // Validate parent channel partner
              const parentChannelPartner = await User.findOne({ _id: vso.createdBy }, undefined, { session });
              if (!parentChannelPartner) throw new Error("Parent Channel Partner not found");
              if (!parentChannelPartner.bankCode || !parentChannelPartner.accountNumber) {
                throw new Error("Parent Channel Partner bank details not found");
              }

              const cpAgentCode = await AgentCode.findOne(
                { createdFor: parentChannelPartner._id.toString(), createdForType: "channel_partner" },
                undefined,
                { session }
              );
              if (!cpAgentCode) throw new Error("Parent channel partner AgentCode not found");

              // Calculate payout amounts using the CP's actual allocation, minus the VSO's cut
              const vsoPayoutAmount = (code.allocationPercent / 100) * baseAmount;
              const parentPayoutAmount = ((cpAgentCode.allocationPercent - code.allocationPercent) / 100) * baseAmount;

              // Perform both fund transfers
              const vsoPayout = await ZainpayHelper.fundsTransfer(
                vsoPayoutAmount,
                { bankCode: vso.bankCode, accountNumber: vso.accountNumber },
                "SkyID purchase commission"
              );

              const parentPayout = await ZainpayHelper.fundsTransfer(
                parentPayoutAmount,
                { bankCode: parentChannelPartner.bankCode, accountNumber: parentChannelPartner.accountNumber },
                "SkyID purchase commission from VSO"
              );

              // Save both transaction records
              const vsoPayoutTxn = new Transaction({
                amount: vsoPayoutAmount,
                type: "payout",
                txnRef: vsoPayout.txnRef,
                transferRecepient: code.createdFor,
              });
              await vsoPayoutTxn.save({ session });

              const parentPayoutTxn = new Transaction({
                amount: parentPayoutAmount,
                type: "payout",
                txnRef: parentPayout.txnRef,
                transferRecepient: vso.createdBy,
              });
              await parentPayoutTxn.save({ session });
              console.log(`[payout] VSO split transferred vsoId=${code.createdFor} vsoAmount=${vsoPayoutAmount} parentId=${vso.createdBy} parentAmount=${parentPayoutAmount} txnRef=${data.txnRef}`);
              break;
            }

            default:
              throw new Error(`Unknown agent code type: ${code.createdForType}`);
          }
        } else {
          console.log(`[payout] No agent code on user — skipping commission userId=${user._id} txnRef=${data.txnRef}`);
        }

      }
    }

    await session.commitTransaction();
    console.log(`[payment-success] Transaction committed txnRef=${data.txnRef} type=${transaction.paymentType} skyId=${transaction.skyId}`);
  } catch (error) {
    await session.abortTransaction();
    console.error(`[payment-success] Transaction aborted txnRef=${data.txnRef} type=${transaction.paymentType}`, error);
  } finally {
    await session.endSession();
  }
}

async function handlePaymentFailure(data: DepositSuccess) {
  const transaction = await Transaction.findOne({ txnRef: data.txnRef });
  if (!transaction) {
    console.error(`[payment-failure] Transaction not found txnRef=${data.txnRef}`);
    return;
  }

  // Only handle buyNumber payment failures
  if (transaction.paymentType !== "buyNumber") {
    console.log(`[payment-failure] Skipping non-buyNumber transaction txnRef=${data.txnRef} type=${transaction.paymentType}`);
    return;
  }

  console.log(`[payment-failure] Processing cleanup txnRef=${data.txnRef} skyId=${transaction.skyId}`);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Mark transaction as failed
    transaction.status = "failed";
    await transaction.save({ session });
    console.log(`[payment-failure] Transaction marked failed txnRef=${data.txnRef} skyId=${transaction.skyId}`);

    // Delete SkyId document
    const skyIdDoc = await SkyId.findOne({ skyId: transaction.skyId }, undefined, { session });
    if (skyIdDoc) {
      await SkyId.deleteOne({ _id: skyIdDoc._id }, { session });
      console.log(`[payment-failure] SkyId deleted skyId=${transaction.skyId}`);
    } else {
      console.warn(`[payment-failure] SkyId not found for cleanup skyId=${transaction.skyId} txnRef=${data.txnRef}`);
    }

    // Delete SwitchTeamRequest
    const switchRequest = await SwitchTeamRequest.findOne({ txnRef: transaction._id.toString() }, undefined, {
      session,
    });
    if (switchRequest) {
      await SwitchTeamRequest.deleteOne({ _id: switchRequest._id }, { session });
      console.log(`[payment-failure] SwitchTeamRequest deleted txnRef=${data.txnRef}`);
    } else {
      console.warn(`[payment-failure] SwitchTeamRequest not found for cleanup txnRef=${data.txnRef}`);
    }

    // Mark PhoneNumber as available again
    if (PhoneNumber && transaction.skyId) {
      await PhoneNumber.updateOne(
        { number: transaction.skyId },
        { $set: { available: true, usedBy: null, platform: null } },
        { session }
      );
      console.log(`[payment-failure] PhoneNumber released skyId=${transaction.skyId}`);
    } else {
      console.warn(`[payment-failure] Could not release PhoneNumber — model unavailable or skyId missing txnRef=${data.txnRef}`);
    }

    await session.commitTransaction();
    console.log(`[payment-failure] Cleanup committed txnRef=${data.txnRef} skyId=${transaction.skyId}`);
  } catch (error) {
    await session.abortTransaction();
    console.error(`[payment-failure] Cleanup aborted txnRef=${data.txnRef} skyId=${transaction.skyId}`, error);
  } finally {
    await session.endSession();
  }
}
