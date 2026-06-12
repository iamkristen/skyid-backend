import { Schema } from "mongoose";

import { KiraniDatabase } from "../config/db";
import { IPhoneNumber } from "./number.types";

const connection = KiraniDatabase();

// 2. Create a Schema corresponding to the document interface.
const phoneNumberSchema = new Schema<IPhoneNumber>({
  number: String,
  accountId: String,
  amount: Number,
  available: Boolean,
  billingPass: String,
  agentOwner: String,
  usedBy: String,
  platform: String,
});

// 3 Create a Model
const PhoneNumber = connection?.model("phoneNumbers", phoneNumberSchema);

export default PhoneNumber;
