import { model, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { IUser } from "./user.types";

// 2. Create a Schema corresponding to the document interface.
const userSchema = new Schema<IUser>(
  {
    user_id: {
      type: String,
      unique: true, // Ensuring it's unique
      default: uuidv4, // Automatically generate a unique user_id using uuid
    },
    firstName: String,
    lastName: String,
    middleName: String,
    country: String,
    email: String,
    businessName: String,
    businessType: String,
    cacRnNumber: String,
    agentCode: String,
    password: String,
    phoneNumber: String,
    accountType: String,
    status: { type: String, default: "active" },
    vsos: { type: Number, default: 0 },
    totalSales: { type: Number, default: 0 },
    verified: String,
    nin: String,
    bvn: String,
    state: String,
    channelPartnerLevel: String,
    bankName: String,
    accountNumber: String,
    bankCode: String,
    accountHolderName: String,
    date: { type: Date, default: Date.now },
    createdBy: String,
    parentChannelPartnerLevel: String,
    mustChangePassword: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    profilePicture: String,
    bio: String,
  },
  { timestamps: true }
);

// 3 Create a Model
const User = model("users", userSchema);

export default User;
