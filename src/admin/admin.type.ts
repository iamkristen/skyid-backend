export interface IAdminUser {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  verified?: string;
  date?: Date;
  role?: string;
  roles?: string[];
  status?: string;
  twoFactorSecret?: string;
  twoFactorEnabled?: boolean;
}
