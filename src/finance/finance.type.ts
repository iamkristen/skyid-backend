interface IFinanceRequest {
  request_type: "deposit" | "withdraw";
  accountNumber?: string;
  /**
   * pending: awaiting approval
   * approved: request approved
   * rejected: request rejected
   */
  status: "pending" | "approved" | "rejected";
  txnRef: string;
  amount: number;
  handledBy?: string;
  remark?: string;
  userId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWithdrawRequest extends IFinanceRequest {
  request_type: "withdraw";
  // personal details
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  phoneNumber: string;
}

export interface IDepositRequest extends IFinanceRequest {
  request_type: "deposit";
}
