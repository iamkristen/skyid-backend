export interface ICustomerEnablementRequest {
  request_type: "ivr" | "ivm";
  skyId: string;
  /**
   * pending: awaiting approval
   * approved: request approved
   * rejected: request rejected
   */
  status: "pending" | "approved" | "rejected";
  fileUrl: string;
  handledBy?: string;
  remark?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
