import { Schema, Types } from "mongoose";

const numberSchema = new Schema<INumber>({
  number: { type: String, required: true },
  network: {
    type: String,
    enum: ["MTN", "GLO", "AIRTEL", "ETISALAT"],
    required: true,
  },
});

export interface IBuyNumber {
  _id: string;
  skyId: string;
  mappedNumbers: INumber[];
  withIVR: boolean;
  withIVM: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  callbackUrl?: string;
}

export interface INumber {
  number: string;
  network: "MTN" | "GLO" | "AIRTEL" | "ETISALAT";
}

export interface IBuyNumber {
  _id: string;
  skyId: string;
  mappedNumbers: INumber[];
  withIVR: boolean;
  withIVM: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  callbackUrl?: string;
}

export interface BuyNumberMeta {
  type: "buyNumber";
  skyId: string;
  userId: string;
}

export interface ReplaceMappedNumberMeta {
  type: "replaceMappedNumber";
  skyId: string;
}

export interface BuyAddonsMeta {
  type: "buyAddons";
  skyId: string;
  ivr?: boolean;
  ivm?: boolean;
}

export interface ISkyId {
  skyId: string;
  mappedNumbers: INumber[];
  withIVR: boolean | object;
  withIVM: boolean | object;
  userId: Types.ObjectId;
  customerId?: string;
  status: "pending" | "active" | "inactive";
  amount: number;
  currentDate?: any;
  renewal?: any;
}

export interface BuyAddons {
  skyId: string;
  ivr?: boolean;
  ivm?: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  callbackUrl?: string;
}

export interface UploadAddon {
  skyId: string;
  name: string;
  ivr?: boolean;
  ivm?: boolean;
}

export interface DeleteAddon {
  skyId: string;
  requestId: string;
}

export interface IPhoneNumber {
  number: string;
  accountId: string;
  amount: number;
  available: boolean;
  billingPass: string;
  agentOwner: string | null;
  usedBy: string;
  date: Date;
  platform?: "SKYID";
}

export default numberSchema;
