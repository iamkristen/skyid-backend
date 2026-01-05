export interface ICheckEmail {
  email: string;
  otp: string;
}

export interface IGoogleSignIn {
  idToken: string;
  accountType?: "Individual" | "Channel_Partner" | "VSO" | "Agent";
  businessName?: string;
  businessType?: string;
}