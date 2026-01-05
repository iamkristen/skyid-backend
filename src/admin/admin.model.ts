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
  verified: String,
  date: { type: Date, default: Date.now },
});

// 3 Create a Model
const AdminUser = model("admin", userSchema);

export default AdminUser;
