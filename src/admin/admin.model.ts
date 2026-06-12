import { model, Schema } from "mongoose";
import { IAdminUser } from "./admin.type";

// 2. Create a Schema corresponding to the document interface.
const userSchema = new Schema<IAdminUser>({
  firstName: String,
  lastName: String,
  email: String,
  password: String,
  phoneNumber: String,
  role: String,
  roles: { type: [String], default: undefined },
  verified: String,
  status: { type: String, default: "active" },
  date: { type: Date, default: Date.now },
  twoFactorSecret: { type: String, default: null },
  twoFactorEnabled: { type: Boolean, default: false },
});

// 3 Create a Model
const AdminUser = model("admin", userSchema);

export default AdminUser;
