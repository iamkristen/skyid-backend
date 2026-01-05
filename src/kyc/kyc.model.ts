import { model, Schema } from "mongoose";
import { IKYC } from "./kyc.type";

// 2. Create a Schema corresponding to the document interface.
const userSchema = new Schema<IKYC>({
  user_id: { type: String, unqiue: true },
  phone: String,
  address: String,
  state: String,
  nin: String,
  date: { type: Date, default: Date.now },
});

// 3 Create a Model
const Kyc = model("kyc", userSchema);

export default Kyc;
