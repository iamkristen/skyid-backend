import { model, Schema } from "mongoose";
import type { IBuyNumberRequest, IAddonRequest, IReplaceNumberRequest, IRemoveNumberRequest } from "./switch.type";
import numberSchema from "../smart-number/number.types";

// 2. Create a Schema corresponding to the document interface.
const switchTeamRequestSchema = new Schema<IBuyNumberRequest | IReplaceNumberRequest | IRemoveNumberRequest | IAddonRequest>(
  {
    skyId: { type: String, required: true },
    request_type: { type: String, required: true },
    mappedNumbers: [numberSchema],
    current_number: numberSchema,
    new_number: numberSchema,
    fileUrl: String,
    status: { type: String, required: true },
    // txnRef: { type: String, required: true, default: null },
    txnRef: { type: String },
    amount: { type: Number, required: true },
    createdBy: String,
    handledBy: String,
    remark: String,
  },
  { timestamps: true }
);

// 3 Create a Model
const SwitchTeamRequest = model("switchTeamRequest", switchTeamRequestSchema);

export default SwitchTeamRequest;
