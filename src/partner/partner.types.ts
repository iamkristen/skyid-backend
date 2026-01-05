export interface IChannelPartner {
  name: string;
  phoneNumber: string;
  email: string;
  businessName: string;
  region: string;
  accountType: string;
  status: "pending" | "accepted" | "rejected";
  handledBy?: string;
  signupSecret?: string;
  channelPartnerLevel?: "Platinum" | "Silver";
}
