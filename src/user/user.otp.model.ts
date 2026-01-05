import { Schema, model } from "mongoose";
import { IOtp } from "./user.types";

const otpSchema = new Schema<IOtp>({
  email: String,
  otp: String,
  password: String,
  createdAt: Date,
  expiresAt: Date,
});
const Otp = model("otps", otpSchema);

export default Otp;
