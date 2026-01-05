export interface IVSOTopUpRequest {
  vsoId: string;
  channelPartnerId: string;
  amount: number;
  /**
   * pending: awaiting approval
   * approved: request approved
   * rejected: request rejected
   */
  status: "pending" | "approved" | "rejected";
  handledBy?: string;
  remark?: string;
  txnRef?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

