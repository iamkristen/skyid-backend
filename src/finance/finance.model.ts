import { model, Schema } from "mongoose";
import type { IDepositRequest, IWithdrawRequest } from "./finance.type";

// 2. Create a Schema corresponding to the document interface.
const financeTeamRequestSchema = new Schema<IWithdrawRequest | IDepositRequest>(
  {
    request_type: { type: String, required: true },
    accountNumber: String,
    status: { type: String, required: true },
    txnRef: { type: String, required: true },
    amount: { type: Number, required: true },
    handledBy: String,
    remark: String,
    userId: String,
    bankName: String,
    bankAccountName: String,
    bankAccountNumber: String,
    phoneNumber: String,
  },
  { timestamps: true }
);

// 3 Create a Model
const FinanceTeamRequest = model("financeTeamRequest", financeTeamRequestSchema);

export default FinanceTeamRequest;
