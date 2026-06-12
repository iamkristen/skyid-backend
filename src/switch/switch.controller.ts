import { Response, Request } from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import SwitchTeamRequest from "./switch.model";
import SkyId from "../smart-number/number.skyId.model";
import User from "../user/user.model";
import AdminUser from "../admin/admin.model";
import { startSession } from "mongoose";
import EmailService from "../utils/EmailService";
import Transaction from "../wallet/wallet.transaction.model";
import Wallet from "../wallet/wallet.model";
import { AstppClient } from "../astpp/astpp.service";
import Bcrypt from "../utils/bcryptService";
import { generatePassword } from "../utils/generateOtp";
import validation from "./switch.schema";
import IndividualMappingRequest from "./individual-mapping-request.model";

dotenv.config();

function getSwitchLevel(role: string | undefined): number | null {
  if (!role || typeof role !== "string") return null;
  const m = role.toLowerCase().match(/^switch_level_([1-4])$/);
  return m ? parseInt(m[1], 10) : role.toLowerCase() === "switch" ? 1 : null;
}

function getAdminRolesFromDoc(admin: { role?: string; roles?: string[] } | null): string[] {
  if (!admin) return [];
  const raw = admin.roles?.length ? admin.roles : admin.role ? [admin.role] : [];
  return raw.map((r) => (r || "").toLowerCase().replace(/\s+/g, "_"));
}

async function getAdminRoles(req: Request): Promise<string[]> {
  const admin = await AdminUser.findById(req.user?._id).select("role roles").lean();
  return getAdminRolesFromDoc(admin as { role?: string; roles?: string[] });
}

async function getAdminSwitchLevel(req: Request): Promise<number | null> {
  const admin = await AdminUser.findById(req.user?._id).select("role").lean();
  return getSwitchLevel(admin?.role);
}

/** Returns all switch levels (1–4) the admin has. */
async function getAdminSwitchLevels(req: Request): Promise<number[]> {
  const roles = await getAdminRoles(req);
  const levels: number[] = [];
  for (const r of roles) {
    const m = r.match(/^switch_level_([1-4])$/);
    if (m) levels.push(parseInt(m[1], 10));
    if (r === "switch") levels.push(1);
  }
  return [...new Set(levels)].sort((a, b) => a - b);
}

export default class SwitchTeamController {
  static async getRequests(req: Request, res: Response) {
    try {
      // const page = req.query.page ? parseInt(req.query.page as string) : 0;
      // const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      // const skip = page * limit;

      const requests = await SwitchTeamRequest.find({
        status: { $in: ["pending", "approved"] },
      }).sort({ createdAt: -1 });
      // .skip(skip)
      // .limit(limit);

      return res.status(200).send({ message: "success", data: requests });
    } catch (error) {
      console.error(`Failed to get switch team requests: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async getRequestsBySkyId(req: Request, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const { skyId } = req.params;

      const requests = await SwitchTeamRequest.find({
        skyId,
        createdBy: req.user._id.toString(),
        request_type: { $in: ["replace", "remove", "addMappedNumbers"] },
        status: { $in: ["pending", "rejected", "approved"] },
      }).sort({ createdAt: -1 });

      return res.status(200).send({ message: "success", data: requests });
    } catch (error) {
      console.error(`Failed to get switch team requests by skyId: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  static async approveRequest(req: Request, res: Response) {
    const { id } = req.params;
    const session = await startSession();
    session.startTransaction();
    try {
      const userObj = req.user;
      if (!userObj) return res.status(401).json({ message: "Unauthorized" });
      const switchReq = await SwitchTeamRequest.findOneAndUpdate(
        { _id: id },
        { $set: { status: "approved", handledBy: userObj._id } },
        { session }
      );
      if (!switchReq) return res.status(404).json({ message: "Switch team request not found" });

      const skyIdNumber = await SkyId.findOne({ skyId: switchReq.skyId });
      if (!skyIdNumber) throw new Error(`SkyId ${switchReq.skyId} not found`);

      const { request_type } = switchReq;
      switch (request_type) {
        case "replace": {
          const { current_number, new_number } = switchReq;
          // find and replace number
          const numbers = skyIdNumber.mappedNumbers.map((number) =>
            number.number === current_number.number && number.network === current_number.network ? new_number : number
          );
          // update mapped numbers
          await SkyId.updateOne({ skyId: switchReq.skyId }, { $set: { mappedNumbers: numbers } }, { session });
          const syncSuccess = await AstppClient.syncRingGroupForDid(
            switchReq.skyId,
            numbers.map((n) => ({ number: n.number }))
          );
          if (!syncSuccess) throw new Error("Failed to sync Ring Group to ASTPP");
          break;
        }
        case "buy": {
          // activate skyid
          await SkyId.updateOne({ skyId: switchReq.skyId }, { $set: { status: "active" } }, { session });
          const syncSuccess = await AstppClient.syncRingGroupForDid(
            switchReq.skyId,
            (switchReq.mappedNumbers || []).map((n) => ({ number: n.number }))
          );
          if (!syncSuccess) throw new Error("Failed to sync Ring Group to ASTPP");
          break;
        }
        case "addMappedNumbers": {
          const { mappedNumbers } = switchReq;
          // Add the new number to existing mapped numbers
          const numbers = [...skyIdNumber.mappedNumbers, ...mappedNumbers];
          console.log(...skyIdNumber.mappedNumbers, "skyIdNumber MappedNumbers");
          console.log(mappedNumbers, "mappedNumbers");
          // update mapped numbers
          await SkyId.updateOne({ skyId: switchReq.skyId }, { $set: { mappedNumbers: numbers } }, { session });
          const syncSuccess = await AstppClient.syncRingGroupForDid(
            switchReq.skyId,
            numbers.map((n) => ({ number: n.number }))
          );
          if (!syncSuccess) throw new Error("Failed to sync Ring Group to ASTPP");
          break;
        }
        case "remove": {
          const { current_number } = switchReq;
          if (!current_number) throw new Error("current_number is required for remove request");
          // Remove the number from mapped numbers
          const numbers = skyIdNumber.mappedNumbers.filter(
            (num) => !(num.number === current_number.number && num.network === current_number.network)
          );
          // update mapped numbers
          await SkyId.updateOne({ skyId: switchReq.skyId }, { $set: { mappedNumbers: numbers } }, { session });
          const syncSuccess = await AstppClient.syncRingGroupForDid(
            switchReq.skyId,
            numbers.map((n) => ({ number: n.number }))
          );
          if (!syncSuccess) throw new Error("Failed to sync Ring Group to ASTPP");
          break;
        }
        default:
          throw new Error(`Invalid request type: ${request_type}`);
      }

      await session.commitTransaction();

      // Send notification email to the user
      try {
        const user = await User.findById(switchReq.createdBy);
        if (user && user.email) {
          const requestTypeDisplay =
            switchReq.request_type === "buy"
              ? "Number Purchase"
              : switchReq.request_type === "replace"
                ? "Number Replacement"
                : switchReq.request_type === "remove"
                  ? "Remove Mapped Number"
                  : switchReq.request_type === "addMappedNumbers"
                    ? "Add Mapped Numbers"
                    : switchReq.request_type;

          await EmailService.sendMappingRequestApproved(
            user.email,
            `${user.firstName} ${user.lastName}`,
            switchReq.skyId,
            requestTypeDisplay
          );
        }
      } catch (emailError) {
        console.error("Failed to send approval notification email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to approve switch team request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  static async rejectRequest(req: Request, res: Response) {
    const { id } = req.params;
    const { remark } = req.body;
    const session = await startSession();
    await session.startTransaction();
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const switchReq = await SwitchTeamRequest.findOneAndUpdate(
        { _id: id },
        { $set: { status: "rejected", handledBy: req.user._id, remark } },
        { session }
      );

      if (!switchReq) return res.status(404).json({ message: "Switch team request not found" });

      // Handle refund for replace requests
      if (switchReq.request_type === "replace" && switchReq.txnRef) {
        const transaction = await Transaction.findById(switchReq.txnRef).session(session);
        if (transaction) {
          // Update transaction status to failed
          transaction.status = "failed";
          await transaction.save({ session });

          // Refund based on payment method
          if (transaction.accountNumber) {
            // Payment was via wallet - refund to wallet
            const wallet = await Wallet.findOne({ accountNumber: transaction.accountNumber }).session(session);
            if (wallet) {
              await Wallet.updateOne(
                { accountNumber: transaction.accountNumber },
                { $inc: { amount: Math.abs(transaction.amount) } },
                { session }
              );
            }
          } else {
            // Payment was via Zainpay - add to user's wallet as refund
            const user = await User.findById(switchReq.createdBy).session(session);
            if (user) {
              // Check if user has a wallet
              let wallet = await Wallet.findOne({ _id: user._id }).session(session);
              if (!wallet) {
                // Create wallet if it doesn't exist (for Individual users who paid via Zainpay)
                let accountNumber;
                let isUnique = false;
                while (!isUnique) {
                  accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
                  const existingWallet = await Wallet.findOne({ accountNumber }).session(session);
                  if (!existingWallet) {
                    isUnique = true;
                  }
                }
                wallet = new Wallet({
                  _id: user._id,
                  amount: 0,
                  status: "active",
                  accountNumber,
                });
                await wallet.save({ session });
              }
              // Add refund amount to wallet
              await Wallet.updateOne(
                { _id: user._id },
                { $inc: { amount: Math.abs(transaction.amount) } },
                { session }
              );
            }
          }
        }
      }

      await session.commitTransaction();

      // Send notification email to the user
      try {
        const user = await User.findById(switchReq.createdBy);
        if (user && user.email) {
          const requestTypeDisplay =
            switchReq.request_type === "buy"
              ? "Number Purchase"
              : switchReq.request_type === "replace"
                ? "Number Replacement"
                : switchReq.request_type === "remove"
                  ? "Remove Mapped Number"
                  : switchReq.request_type === "addMappedNumbers"
                    ? "Add Mapped Numbers"
                    : switchReq.request_type === "ivr"
                      ? "IVR Add-on"
                      : switchReq.request_type === "ivm"
                        ? "IVM Add-on"
                        : switchReq.request_type;

          await EmailService.sendMappingRequestRejected(
            user.email,
            `${user.firstName} ${user.lastName}`,
            switchReq.skyId,
            requestTypeDisplay,
            remark || "No specific reason provided"
          );
        }
      } catch (emailError) {
        console.error("Failed to send rejection notification email:", emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({ message: "success" });
    } catch (error) {
      await session.abortTransaction();
      console.error(`Failed to reject switch team request ${id}: ${error}`);
      return res.status(500).json({ message: "Internal Server Error!" });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Internal: create Individual user + SkyId + sync + email. Used by createIndividualMapping and by Level 4 approval.
   */
  static async _executeCreateIndividualMapping(
    value: {
      skyId: string;
      mappedNumbers: { number: string; network: string }[];
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber: string;
      skyIdExpiresAt?: Date | string;
    },
    session: mongoose.mongo.ClientSession,
    handledBy: string | undefined
  ): Promise<{ userId: mongoose.Types.ObjectId; skyId: string; email: string }> {
    const { skyId, mappedNumbers, firstName, lastName, email, phoneNumber } = value;
    const skyIdExpiresAtNorm =
      value.skyIdExpiresAt instanceof Date
        ? value.skyIdExpiresAt
        : value.skyIdExpiresAt
          ? new Date(value.skyIdExpiresAt as string)
          : undefined;
    const emailNorm = email.toLowerCase().trim();
    const phoneNorm = phoneNumber.trim();

    const existingUserByEmail = await User.findOne({ email: emailNorm }).session(session);
    if (existingUserByEmail) throw new Error("Email already exists.");

    const existingUserByPhone = await User.findOne({ phoneNumber: phoneNorm }).session(session);
    if (existingUserByPhone) throw new Error("Phone number already exists.");

    const existingSkyId = await SkyId.findOne({ skyId }).session(session);
    if (existingSkyId) throw new Error("Smart number is already in use.");

    const tempPassword = generatePassword(12);
    const hashedPassword = Bcrypt.shared().encode(tempPassword);

    const user = new User({
      email: emailNorm,
      phoneNumber: phoneNorm,
      password: hashedPassword,
      firstName: (firstName || "").trim(),
      lastName: (lastName || "").trim(),
      accountType: "Individual",
      status: "active",
      verified: "false",
      mustChangePassword: true,
    });
    await user.save({ session });

    const renewalDate =
      skyIdExpiresAtNorm && !isNaN(skyIdExpiresAtNorm.getTime())
        ? skyIdExpiresAtNorm
        : (() => {
            const d = new Date();
            d.setFullYear(d.getFullYear() + 1);
            return d;
          })();
    await SkyId.create(
      [
        {
          skyId,
          mappedNumbers,
          withIVR: false,
          withIVM: false,
          userId: user._id,
          amount: 0,
          status: "active",
          renewal: renewalDate,
        },
      ],
      { session }
    );

    await SwitchTeamRequest.create(
      [
        {
          request_type: "buy",
          skyId,
          status: "approved",
          txnRef: "",
          mappedNumbers,
          amount: 0,
          createdBy: user._id.toString(),
          handledBy: handledBy ?? "",
        },
      ],
      { session }
    );

    const extensionsData = mappedNumbers.map((n: { number: string; network: string }) => ({ number: n.number }));
    const syncSuccess = await AstppClient.syncRingGroupForDid(skyId, extensionsData);
    if (!syncSuccess) throw new Error("Mapping saved but failed to sync with telephony. Please contact support.");

    const loginUrl = process.env.FRONTEND_URL || "https://app.skyid.ng";
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || "User";
    try {
      await EmailService.sendIndividualMappingWelcome(
        emailNorm,
        displayName,
        loginUrl,
        emailNorm,
        tempPassword,
        "SkyID"
      );
    } catch (emailErr) {
      console.error("Failed to send account-created email:", emailErr);
    }

    return { userId: user._id, skyId, email: emailNorm };
  }

  /**
   * Switch team creates an Individual account (one-step; or use workflow for Level 1–4).
   */
  static async createIndividualMapping(req: Request, res: Response) {
    const session = await startSession();
    session.startTransaction();
    try {
      const { error, value } = validation.createIndividualMapping(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });

      const result = await SwitchTeamController._executeCreateIndividualMapping(
        value,
        session,
        req.user?._id?.toString()
      );
      await session.commitTransaction();
      return res.status(200).json({ message: "success", data: result });
    } catch (err) {
      await session.abortTransaction();
      const msg = err instanceof Error ? err.message : "Internal Server Error!";
      const status = msg.includes("already exists") || msg.includes("already in use") ? 400 : 500;
      return res.status(status).json({ message: msg });
    } finally {
      await session.endSession();
    }
  }

  // --- Multi-level Create Individual workflow ---

  /** Level 1 or super_admin: Submit a new Create Individual request (no account created yet). */
  static async submitIndividualMappingRequest(req: Request, res: Response) {
    try {
      const roles = await getAdminRoles(req);
      const levels = await getAdminSwitchLevels(req);
      if (!roles.includes("super_admin") && !levels.includes(1))
        return res.status(403).json({ message: "Only Switch Level 1 or Super Admin can submit requests." });

      const { error, value } = validation.createIndividualMapping(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });

      const expiresAt = value.skyIdExpiresAt ? new Date(value.skyIdExpiresAt) : undefined;
      if (!expiresAt || isNaN(expiresAt.getTime()))
        return res.status(400).json({ message: "SkyID expiry date is required and must be a valid date." });
      const doc = await IndividualMappingRequest.create({
        skyId: value.skyId,
        mappedNumbers: value.mappedNumbers,
        firstName: value.firstName,
        lastName: value.lastName,
        email: value.email.toLowerCase().trim(),
        phoneNumber: value.phoneNumber.trim(),
        skyIdExpiresAt: expiresAt,
        submissionSource: value.submissionSource === "mapping_page" ? "mapping_page" : "claim_assign",
        status: "pending_level_2",
        createdBy: req.user!._id!.toString(),
      });

      return res.status(201).json({ message: "success", data: doc });
    } catch (err) {
      console.error("submitIndividualMappingRequest error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** List requests: Level 1 = my requests; Level 2/3/4 = queue at that level; super_admin = all; multiple levels = union. */
  static async listIndividualMappingRequests(req: Request, res: Response) {
    try {
      const roles = await getAdminRoles(req);
      if (roles.includes("super_admin")) {
        const requests = await IndividualMappingRequest.find({}).sort({ createdAt: -1 }).lean();
        return res.status(200).json({ message: "success", data: requests });
      }

      const levels = await getAdminSwitchLevels(req);
      if (levels.length === 0) return res.status(403).json({ message: "Not a switch team member." });

      const orConditions: Record<string, unknown>[] = [];
      if (levels.includes(1)) {
        orConditions.push({ createdBy: req.user!._id!.toString() });
        // Preloaded "Claim & assign": every L1 must see others' claim_assign rows so Pending stays in sync (no double-claim).
        orConditions.push({
          $or: [{ submissionSource: "claim_assign" }, { submissionSource: { $exists: false } }],
        });
      }
      if (levels.includes(2)) orConditions.push({ status: "pending_level_2" });
      if (levels.includes(3)) orConditions.push({ status: "pending_level_3" });
      if (levels.includes(3) || levels.includes(4)) orConditions.push({ status: "pending_level_4" });
      if (levels.includes(3) || levels.includes(4)) orConditions.push({ status: "rejected" });

      const query = orConditions.length > 0 ? { $or: orConditions } : {};
      const requests = await IndividualMappingRequest.find(query).sort({ createdAt: -1 }).lean();
      return res.status(200).json({ message: "success", data: requests });
    } catch (err) {
      console.error("listIndividualMappingRequests error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** Get one request by id. */
  static async getIndividualMappingRequestById(req: Request, res: Response) {
    try {
      const roles = await getAdminRoles(req);
      const levels = await getAdminSwitchLevels(req);
      if (!roles.includes("super_admin") && levels.length === 0)
        return res.status(403).json({ message: "Not a switch team member." });

      const doc = await IndividualMappingRequest.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ message: "Request not found." });
      return res.status(200).json({ message: "success", data: doc });
    } catch (err) {
      console.error("getIndividualMappingRequestById error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** Level 3: Update when pending_level_3. Level 4: Update when pending_level_4. Super Admin: either stage. */
  static async updateIndividualMappingRequest(req: Request, res: Response) {
    try {
      const roles = await getAdminRoles(req);
      const levels = await getAdminSwitchLevels(req);
      const isSuper = roles.includes("super_admin");
      const canEditAtL3 = levels.includes(3) || isSuper;
      const canEditAtL4 = levels.includes(4) || isSuper;

      const { error, value } = validation.createIndividualMapping(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });

      const expiresAt = value.skyIdExpiresAt ? new Date(value.skyIdExpiresAt) : undefined;
      if (!expiresAt || isNaN(expiresAt.getTime())) {
        return res.status(400).json({ message: "SkyID expiry date is required and must be a valid date." });
      }

      const existing = await IndividualMappingRequest.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ message: "Request not found." });

      const updateBody = {
        skyId: value.skyId,
        mappedNumbers: value.mappedNumbers,
        firstName: value.firstName,
        lastName: value.lastName,
        email: value.email.toLowerCase().trim(),
        phoneNumber: value.phoneNumber.trim(),
        skyIdExpiresAt: expiresAt,
      };

      let doc = null;
      if (existing.status === "pending_level_3") {
        if (!canEditAtL3) return res.status(403).json({ message: "Only Switch Level 3 or Super Admin can edit requests at this stage." });
        doc = await IndividualMappingRequest.findOneAndUpdate(
          { _id: req.params.id, status: "pending_level_3" },
          updateBody,
          { new: true }
        );
      } else if (existing.status === "pending_level_4") {
        const canEditPendingL4 = canEditAtL4 || levels.includes(3);
        if (!canEditPendingL4) {
          return res.status(403).json({ message: "Only Switch Level 3, Level 4, or Super Admin can edit requests at this stage." });
        }
        doc = await IndividualMappingRequest.findOneAndUpdate(
          { _id: req.params.id, status: "pending_level_4" },
          updateBody,
          { new: true }
        );
      } else {
        return res.status(400).json({ message: "Request not editable at this stage." });
      }

      if (!doc) return res.status(404).json({ message: "Request not found or not pending approval at this level." });
      return res.status(200).json({ message: "success", data: doc });
    } catch (err) {
      console.error("updateIndividualMappingRequest error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** Level 2: Approve request → moves to Level 3. */
  static async approveIndividualMappingLevel2(req: Request, res: Response) {
    try {
      const levels = await getAdminSwitchLevels(req);
      if (!levels.includes(2))
        return res.status(403).json({ message: "Only Switch Level 2 can approve at this stage." });

      const doc = await IndividualMappingRequest.findOneAndUpdate(
        { _id: req.params.id, status: "pending_level_2" },
        {
          $set: {
            status: "pending_level_3",
            approvedByLevel2: { adminId: req.user!._id!.toString(), at: new Date() },
          },
        },
        { new: true }
      );

      if (!doc) return res.status(404).json({ message: "Request not found or not pending Level 2." });

      void EmailService.notifySwitchTeamCreateIndividualPendingLevel3({
        requestId: String(doc._id),
        skyId: doc.skyId,
        firstName: doc.firstName,
        lastName: doc.lastName,
        email: doc.email,
        phoneNumber: doc.phoneNumber,
        submissionSource: doc.submissionSource,
      }).catch((e) => console.error("Switch L3 notify email failed:", e));

      return res.status(200).json({ message: "success", data: doc });
    } catch (err) {
      console.error("approveIndividualMappingLevel2 error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** Level 3: Approve request → moves to Level 4. */
  static async approveIndividualMappingLevel3(req: Request, res: Response) {
    try {
      const levels = await getAdminSwitchLevels(req);
      if (!levels.includes(3))
        return res.status(403).json({ message: "Only Switch Level 3 can approve at this stage." });

      const doc = await IndividualMappingRequest.findOneAndUpdate(
        { _id: req.params.id, status: "pending_level_3" },
        {
          $set: {
            status: "pending_level_4",
            approvedByLevel3: { adminId: req.user!._id!.toString(), at: new Date() },
          },
        },
        { new: true }
      );

      if (!doc) return res.status(404).json({ message: "Request not found or not pending Level 3." });
      return res.status(200).json({ message: "success", data: doc });
    } catch (err) {
      console.error("approveIndividualMappingLevel3 error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** Level 4: Approve → create account, mapping, and send email. */
  static async approveIndividualMappingLevel4(req: Request, res: Response) {
    const session = await startSession();
    session.startTransaction();
    try {
      const levels = await getAdminSwitchLevels(req);
      if (!levels.includes(4)) {
        await session.abortTransaction();
        return res.status(403).json({ message: "Only Switch Level 4 can approve at this stage." });
      }

      const requestDoc = await IndividualMappingRequest.findOne({ _id: req.params.id, status: "pending_level_4" })
        .session(session)
        .lean();
      if (!requestDoc) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Request not found or not pending Level 4." });
      }

      const value = {
        skyId: requestDoc.skyId,
        mappedNumbers: requestDoc.mappedNumbers,
        firstName: requestDoc.firstName,
        lastName: requestDoc.lastName,
        email: requestDoc.email,
        phoneNumber: requestDoc.phoneNumber,
        skyIdExpiresAt: requestDoc.skyIdExpiresAt,
      };

      const result = await SwitchTeamController._executeCreateIndividualMapping(
        value,
        session,
        req.user?._id?.toString()
      );

      await IndividualMappingRequest.updateOne(
        { _id: req.params.id },
        {
          $set: {
            status: "approved",
            approvedByLevel4: { adminId: req.user!._id!.toString(), at: new Date() },
          },
        },
        { session }
      );

      await session.commitTransaction();
      return res.status(200).json({ message: "success", data: { ...result, requestId: req.params.id } });
    } catch (err) {
      await session.abortTransaction();
      const msg = err instanceof Error ? err.message : "Internal Server Error!";
      const status = msg.includes("already exists") || msg.includes("already in use") ? 400 : 500;
      return res.status(status).json({ message: msg });
    } finally {
      await session.endSession();
    }
  }

  /** Level 2, 3, or 4: Reject request → back to Level 1; reason required. */
  static async rejectIndividualMappingRequest(req: Request, res: Response) {
    try {
      const levels = await getAdminSwitchLevels(req);
      const canReject = levels.some((l) => l === 2 || l === 3 || l === 4);
      if (!canReject) return res.status(403).json({ message: "Only Switch Level 2, 3, or 4 can reject." });

      const { error, value } = validation.rejectIndividualMappingRequest(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });

      const requestDoc = await IndividualMappingRequest.findById(req.params.id).lean();
      if (!requestDoc) return res.status(404).json({ message: "Request not found." });
      const status = requestDoc.status as string;
      const levelMatch = status.match(/^pending_level_(\d)$/);
      const level = levelMatch ? parseInt(levelMatch[1], 10) : 0;
      if (!levels.includes(level) || level < 2 || level > 4)
        return res.status(403).json({ message: "Request not pending at your level." });

      const doc = await IndividualMappingRequest.findOneAndUpdate(
        { _id: req.params.id, status: `pending_level_${level}` as const },
        {
          $set: {
            status: "rejected",
            rejectedBy: req.user!._id!.toString(),
            rejectedAt: new Date(),
            rejectionReason: value.reason,
            rejectedByLevel: level,
          },
        },
        { new: true }
      );

      if (!doc) return res.status(404).json({ message: "Request not found or not pending your level." });
      return res.status(200).json({ message: "success", data: doc });
    } catch (err) {
      console.error("rejectIndividualMappingRequest error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** Level 1 (own requests) or Super Admin (any rejected): Resubmit with corrected data → pending Level 2. */
  static async resubmitIndividualMappingRequest(req: Request, res: Response) {
    try {
      const roles = await getAdminRoles(req);
      const levels = await getAdminSwitchLevels(req);
      const isSuper = roles.includes("super_admin");
      const isLevel1 = levels.includes(1);
      if (!isSuper && !isLevel1) {
        return res.status(403).json({ message: "Only Switch Level 1 or Super Admin can resubmit rejected requests." });
      }

      const { error, value } = validation.createIndividualMapping(req.body);
      if (error) return res.status(400).json({ message: error.details[0].message });

      const expiresAt = value.skyIdExpiresAt ? new Date(value.skyIdExpiresAt) : undefined;
      if (!expiresAt || isNaN(expiresAt.getTime()))
        return res.status(400).json({ message: "SkyID expiry date is required and must be a valid date." });

      const filter: Record<string, unknown> = { _id: req.params.id, status: "rejected" };
      if (!isSuper) {
        filter.createdBy = req.user!._id!.toString();
      }

      const doc = await IndividualMappingRequest.findOneAndUpdate(
        filter,
        {
          $set: {
            skyId: value.skyId,
            mappedNumbers: value.mappedNumbers,
            firstName: value.firstName,
            lastName: value.lastName,
            email: value.email.toLowerCase().trim(),
            phoneNumber: value.phoneNumber.trim(),
            skyIdExpiresAt: expiresAt,
            status: "pending_level_2",
          },
          $unset: { rejectedBy: "", rejectedAt: "", rejectionReason: "", rejectedByLevel: "" },
        },
        { new: true }
      );

      if (!doc) {
        return res.status(404).json({
          message: isSuper
            ? "Request not found or not in rejected status."
            : "Request not found, not rejected, or not created by you.",
        });
      }
      return res.status(200).json({ message: "success", data: doc });
    } catch (err) {
      console.error("resubmitIndividualMappingRequest error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }

  /** Remove a rejected request so the Sky ID can be claimed again (Super Admin or Switch Level 3 / 4 only). */
  static async deleteIndividualMappingRequest(req: Request, res: Response) {
    try {
      const roles = await getAdminRoles(req);
      const levels = await getAdminSwitchLevels(req);
      const isSuper = roles.includes("super_admin");
      const canDelete = isSuper || levels.includes(3) || levels.includes(4);
      if (!canDelete) {
        return res
          .status(403)
          .json({ message: "Only Super Admin or Switch Level 3 / 4 can reset rejected preloaded requests." });
      }
      const doc = await IndividualMappingRequest.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ message: "Request not found." });
      if (doc.status !== "rejected") {
        return res.status(400).json({ message: "Only rejected requests can be deleted." });
      }
      await IndividualMappingRequest.deleteOne({ _id: req.params.id });
      return res.status(200).json({ message: "success" });
    } catch (err) {
      console.error("deleteIndividualMappingRequest error:", err);
      return res.status(500).json({ message: "Internal Server Error!" });
    }
  }
}
