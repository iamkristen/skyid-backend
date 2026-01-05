import { model, Schema } from "mongoose";
import type { IVSOTopUpRequest } from "./vso-topup.type";

// 2. Create a Schema corresponding to the document interface.
const vsoTopUpRequestSchema = new Schema<IVSOTopUpRequest>(
  {
    vsoId: { type: String, required: true },
    channelPartnerId: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, required: true, default: "pending" },
    handledBy: String,
    remark: String,
    txnRef: String,
  },
  { timestamps: true }
);

// 3 Create a Model
const VSOTopUpRequest = model("vsoTopUpRequest", vsoTopUpRequestSchema);

export default VSOTopUpRequest;

