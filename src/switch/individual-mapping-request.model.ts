import { model, Schema } from "mongoose";
import numberSchema from "../smart-number/number.types";

export type IndividualMappingRequestStatus =
  | "pending_level_2"
  | "pending_level_3"
  | "pending_level_4"
  | "approved"
  | "rejected";

export type IndividualMappingSubmissionSource = "mapping_page" | "claim_assign";

export interface IIndividualMappingRequest {
  skyId: string;
  mappedNumbers: { number: string; network: string }[];
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  /** Date when the SkyID mapping will expire (used as SkyId.renewal). Optional for legacy requests. */
  skyIdExpiresAt?: Date;
  /**
   * Where the request was submitted from. Legacy documents may omit this (treated as claim/preload flow in UI).
   */
  submissionSource?: IndividualMappingSubmissionSource;
  status: IndividualMappingRequestStatus;
  createdBy: string;
  approvedByLevel2?: { adminId: string; at: Date };
  approvedByLevel3?: { adminId: string; at: Date };
  approvedByLevel4?: { adminId: string; at: Date };
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  rejectedByLevel?: 2 | 3 | 4;
}

const individualMappingRequestSchema = new Schema<IIndividualMappingRequest>(
  {
    skyId: { type: String, required: true },
    mappedNumbers: [numberSchema],
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    skyIdExpiresAt: { type: Date, required: false },
    submissionSource: { type: String, enum: ["mapping_page", "claim_assign"], required: false },
    status: { type: String, required: true },
    createdBy: { type: String, required: true },
    approvedByLevel2: { adminId: String, at: Date },
    approvedByLevel3: { adminId: String, at: Date },
    approvedByLevel4: { adminId: String, at: Date },
    rejectedBy: String,
    rejectedAt: Date,
    rejectionReason: String,
    rejectedByLevel: Number,
  },
  { timestamps: true }
);

const IndividualMappingRequest = model(
  "individualMappingRequest",
  individualMappingRequestSchema
);

export default IndividualMappingRequest;
