export type VerificationStatus = "pending" | "approved" | "rejected";
export type VerificationLevel = "none" | "verified" | "bronze" | "gold" | "platinum"; // 'verified' for personal, tiers for business
export type KycAccountType = "personal" | "business";

// Superset KYC document interface combining the legacy deployed fields with
// the developing KYC workflow fields. Workflow-required fields are optional
// here so the legacy `POST /user/kyc` writes (which only set the legacy
// fields) still type-check against the same model.
export interface IKYC {
  user_id?: string;
  kycAccountType?: KycAccountType;

  // Personal Information
  fullName?: string;
  phone?: string;
  address?: string;
  state?: string;
  nin?: string;

  // Legacy NIN verification details from Prembly (deployed Individual KYC)
  nin_firstname?: string;
  nin_surname?: string;
  nin_middlename?: string;

  // Bank Verification
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;

  // Business Information (for business accounts)
  businessName?: string;
  businessRegNumber?: string; // CAC number

  // Document URLs
  governmentIdUrl?: string;
  selfieWithIdUrl?: string; // Can be used for liveness photo
  livenessPhotoUrl?: string; // Face verification photo
  businessCertificateUrl?: string;

  // Liveness Verification Evidence
  livenessVerifiedAt?: Date;
  livenessStepsCompleted?: number;
  livenessStepsTotal?: number;
  livenessVerified?: boolean;

  // All liveness step photos (center, left, right, up, down)
  livenessPhotoUrls?: {
    center?: string;
    left?: string;
    right?: string;
    up?: string;
    down?: string;
  };

  // Verification Status
  status?: VerificationStatus;
  verificationLevel?: VerificationLevel;

  // NIN Verification Result
  ninVerified?: boolean;
  nameMatchVerified?: boolean;

  // Admin Review
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;

  // Timestamps
  date?: Date;
  submittedAt?: Date;
  updatedAt?: Date;
}
