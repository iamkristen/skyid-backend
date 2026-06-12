import { model, Schema, Types } from "mongoose";

export interface IAddonSync {
  skyId: string;
  userId: Types.ObjectId;
  type: "ivr" | "ivm";
  fileName: string;
  fileUrl: string;
  astppRecordingId?: string;
  status: "pending" | "synced" | "failed";
}

const addonSyncSchema = new Schema<IAddonSync>(
  {
    skyId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ["ivr", "ivm"], required: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    astppRecordingId: { type: String },
    status: {
      type: String,
      enum: ["pending", "synced", "failed"],
      default: "pending",
      required: true,
    },
  },
  { timestamps: true }
);

const AddonSync = model<IAddonSync>("addonSync", addonSyncSchema);

export default AddonSync;
