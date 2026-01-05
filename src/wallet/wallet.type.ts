export interface IWallet {
  accountNumber: string;
  amount: number;
  status: string;
  date?: Date;
}

export interface ITransaction {
  _id: string;
  accountNumber?: string;
  amount: number;
  status: "pending" | "success" | "failed";
  type: "deposit" | "withdraw" | "payment" | "transfer" | "payout";
  paymentType?: "buyNumber" | "replaceMappedLines" | "buyAddons" | "addMappedNumbers";
  txnRef?: string;
  skyId?: string;
  ivr?: boolean;
  ivm?: boolean;
  transferRecepient?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
