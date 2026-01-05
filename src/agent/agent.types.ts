export interface IAgent {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  nin: string;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  state: string;
}

export interface IAgentCode {
  code: string;
  discountPercent: number;
  allocationPercent: number;
  expiresAt?: Date;
  status: "active" | "inactive";
  createdFor: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
