import { model, Schema } from "mongoose";
import { IAgentCode } from "./agent.types";
import { customAlphabet } from "nanoid";

export const generateCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

// 2. Create a Schema corresponding to the document interface.
const agentCodeSchema = new Schema<IAgentCode>(
  {
    code: { type: String, required: true, unique: true },
    createdFor: { type: String, required: true },
    createdForType: { type: String, required: true, enum: ["agent", "channel_partner", "vso"] },
    discountPercent: { type: Number, required: true },
    allocationPercent: { type: Number, required: true },
    status: { type: String, required: true, enum: ["active", "inactive"] },
    expiresAt: Date,
  },
  { timestamps: true }
);

// 3 Create a Model
const AgentCode = model("agentCode", agentCodeSchema);

export default AgentCode;
