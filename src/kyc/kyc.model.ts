import { model, Schema } from "mongoose";
import { IKYC } from "./kyc.type";

// Superset KYC schema: keeps the legacy deployed verification fields
// (phone/address/nin/nin_* names/date) AND the developing KYC workflow
// fields (account type, liveness, status, verification level, admin review)
// so both the proven `POST /user/kyc` flow and the app's KYC workflow
// (`/kyc/submit`, `/kyc/status`, admin approve/reject) write to the same
// `kyc` collection without breaking each other.
const kycSchema = new Schema<IKYC>(
  {
    user_id: { type: String, unique: true },

    // Workflow account classification (optional so legacy writes still succeed)
    kycAccountType: { type: String, enum: ["personal", "business"] },
    fullName: String,

    // Personal Information (shared)
    phone: String,
    address: String,
    state: String,
    nin: String,

    // Legacy NIN verification details from Prembly (deployed Individual KYC)
    nin_firstname: String,
    nin_surname: String,
    nin_middlename: String,

    // Bank Verification
    bankCode: String,
    bankName: String,
    accountNumber: String,
    accountName: String,

    // Business Information
    businessName: String,
    businessRegNumber: String,

    // Document URLs
    governmentIdUrl: String,
    selfieWithIdUrl: String,
    livenessPhotoUrl: String,
    businessCertificateUrl: String,

    // Liveness Verification Evidence
    livenessVerifiedAt: Date,
    livenessStepsCompleted: { type: Number, default: 0 },
    livenessStepsTotal: { type: Number, default: 5 },
    livenessVerified: { type: Boolean, default: false },
    livenessPhotoUrls: {
      center: String,
      left: String,
      right: String,
      up: String,
      down: String,
    },

    // Verification Status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    verificationLevel: {
      type: String,
      enum: ["none", "verified", "bronze", "gold", "platinum"],
      default: "none",
    },

    // NIN Verification Result
    ninVerified: { type: Boolean, default: false },
    nameMatchVerified: { type: Boolean, default: false },

    // Admin Review
    reviewedBy: String,
    reviewedAt: Date,
    rejectionReason: String,

    // Legacy timestamp (deployed)
    date: { type: Date, default: Date.now },

    // Workflow timestamps
    submittedAt: { type: Date, default: Date.now },
    updatedAt: Date,
  },
  {
    timestamps: { createdAt: "submittedAt", updatedAt: "updatedAt" },
  }
);

const Kyc = model<IKYC>("kyc", kycSchema);

export default Kyc;
