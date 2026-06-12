export interface IUser {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  country?: string;
  businessName?: string;
  businessType?: string;
  cacRnNumber?: string;
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
  bvn?: string;
  bankName?: string;
  accountNumber?: string;
  bankCode?: string;
  accountHolderName?: string;
  channelPartnerLevel?: "Platinum" | "Silver";
  parentChannelPartnerLevel?: "Platinum" | "Silver";
  state?: string;
  allocationPercent?: number;
  mustChangePassword?: boolean;
  twoFactorSecret?: string;
  twoFactorEnabled?: boolean;
  profilePicture?: string;
  bio?: string;
}

export interface IOtp {
  email: string;
  otp: string;
  password: string;
  createdAt?: Date;
  expiresAt?: Date;
}
