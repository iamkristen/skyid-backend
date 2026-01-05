export interface IUser {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  country?: string;
  businessName?: string;
  businessType?: string;
  agentCode?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  verified?: string;
  user_id?: any;
  status?: string;
  vsos?: number;
  totalSales?: number;
  date?: Date;
  accountType?: "Individual" | "Channel_Partner" | "VSO" | "Agent";
  createdBy?: string;
  nin?: string;
  bankName?: string;
  accountNumber?: string;
  bankCode?: string;
  channelPartnerLevel?: "Platinum" | "Silver";
  parentChannelPartnerLevel?: "Platinum" | "Silver";
  state?: string;
}

export interface IOtp {
  email: string;
  otp: string;
  password: string;
  createdAt?: Date;
  expiresAt?: Date;
}
