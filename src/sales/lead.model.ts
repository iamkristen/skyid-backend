import { model, Schema } from "mongoose";

export const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export interface ILead {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  stage: LeadStage;
  source?: string;
  notes?: string;
  createdBy?: string;
}

const leadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    company: String,
    stage: { type: String, required: true, enum: LEAD_STAGES, default: "new" },
    source: String,
    notes: String,
    createdBy: String,
  },
  { timestamps: true }
);

export const Lead = model("lead", leadSchema);
export default Lead;
