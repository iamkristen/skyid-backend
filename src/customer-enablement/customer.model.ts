import { model, Schema } from "mongoose";
import type { ICustomerEnablementRequest } from "./customer.type";

// 2. Create a Schema corresponding to the document interface.
const customerEnablementRequestSchema = new Schema<ICustomerEnablementRequest>(
  {
    request_type: { type: String, required: true },
    skyId: { type: String, required: true },
    status: { type: String, required: true },
    fileUrl: { type: String, required: true },
    handledBy: String,
    remark: String,
  },
  { timestamps: true }
);

// 3 Create a Model
const CustomerEnablementRequest = model("customerEnablementRequest", customerEnablementRequestSchema);

export default CustomerEnablementRequest;
