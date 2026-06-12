import { model, Schema } from "mongoose";
import { ITransaction } from "./wallet.type";

// 2. Create a Schema corresponding to the document interface.
const transactionSchema = new Schema<ITransaction>(
  {
    accountNumber: String,
    amount: { type: Number, required: true },
    status: String,
    transferRecepient: String,
    type: String,
    skyId: String,
    ivr: Boolean,
    ivm: Boolean,
    paymentType: String,
    txnRef: String,
    // 
    isSignup: Boolean,
    signupEmail: String,
    signupPhoneNumber: String,
    // 
  },
  { timestamps: true }
);

// 3 Create a Model
const Transaction = model("transaction", transactionSchema);

export default Transaction;
