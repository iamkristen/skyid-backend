import { model, Schema } from "mongoose";
import { IAgent } from "./agent.types";

// import { v4 as uuidv4 } from "uuid";

// 2. Create a Schema corresponding to the document interface.
const agentSchema = new Schema<IAgent>(
  {
    firstName: String,
    lastName: String,
    email: String,
    phoneNumber: String,
    password: String,
    nin: String,
    bankName: String,
    bankCode: String,
    accountNumber: String,
    accountName: String,
    state: String,
  },
  { timestamps: true }
);

// 3 Create a Model
const AgentModel = model("agent", agentSchema);

export default AgentModel;
