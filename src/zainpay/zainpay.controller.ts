import dotenv from "dotenv";
import { nanoid } from "nanoid";
import {
  Zainpay,
  type ZainpayInitializePaymentResponse,
  type ZainpayBankList,
  serviceTypes,
  type ZainpayFundsTransferResponse,
} from "zainpay-nodejs-sdk";

dotenv.config();

export interface BankAccount {
  accountNumber: string;
  bankCode: string;
}

export class ZainpayHelper {
  static secretKey = process.env.ZAINPAY_SECRET_KEY!;
  static publicKey = process.env.ZAINPAY_PUBLIC_KEY!;
  static zainboxCode = process.env.ZAINPAY_ZAINBOX_CODE!;
  static sandbox = process.env.NODE_ENV === "development";
  static virutalAccountNumber = process.env.ZAINPAY_VIRTUAL_ACCOUNT_NUMBER!;
  static virtualAccountBankCode = process.env.ZAINPAY_VIRTUAL_ACCOUNT_BANK_CODE!;

  /** Whether the Zainpay gateway has the minimum credentials to initialize payments. */
  static get isConfigured(): boolean {
    return Boolean(process.env.ZAINPAY_PUBLIC_KEY && process.env.ZAINPAY_ZAINBOX_CODE);
  }

  static async initializeTransaction(amount: number, email: string, mobileNumber: string, callbackUrl?: string) {
    const txnRef = nanoid(12);
    const payload = {
      amount: amount.toString(),
      txnRef,
      mobileNumber,
      zainboxCode: this.zainboxCode,
      emailAddress: email,
      callBackUrl: callbackUrl || "https://skyid.ng",
    };
    const response: ZainpayInitializePaymentResponse = await Zainpay({
      publicKey: this.publicKey,
      serviceType: serviceTypes.INITIALIZE_PAYMENT,
      sandbox: this.sandbox,
      data: payload,
    });
    if (!response) {
      throw new Error("Zainpay returned no response for initialize transaction");
    }
    if (response.code !== "00" || !response.data) {
      throw new Error(`Failed to initialize transaction: code=${response.code} description=${(response as any).description ?? JSON.stringify(response)}`);
    }
    return { ...response, txnRef };
  }

  static async fundsTransfer(amount: number, destination: BankAccount, narration?: string) {
    const txnRef = nanoid(25);
    const payload = {
      destinationAccountNumber: destination.accountNumber,
      destinationBankCode: destination.bankCode,
      amount: amount.toString(),
      sourceAccountNumber: this.virutalAccountNumber,
      sourceBankCode: this.virtualAccountBankCode,
      zainboxCode: this.zainboxCode,
      txnRef,
      narration: narration || "Funds Transfer",
      callBackUrl: "https://skyid.ng",
    };

    const response: ZainpayFundsTransferResponse = await Zainpay({
      publicKey: this.publicKey,
      serviceType: serviceTypes.FUNDS_TRANSFER,
      sandbox: this.sandbox,
      data: payload,
    });

    if (!response) {
      throw new Error("Zainpay returned no response for funds transfer");
    }
    if (response.code !== "21") {
      throw new Error(`Failed to transfer funds: code=${response.code} description=${(response as any).description ?? JSON.stringify(response)}`);
    }
    return { txnRef };
  }

  static async getBankList() {
    const response = (await Zainpay({
      publicKey: (process.env.ZAINPAY_PUBLIC_LIVE_KEY as string) || this.publicKey,
      serviceType: serviceTypes.BANK_LIST,
      sandbox: false,
      data: {},
    })) as ZainpayBankList;

    if (!response.data) {
      throw new Error(`Failed to get bank list: ${response}`);
    }

    return response?.data;
    // console.log(response?.data);
  }

  static async nameEnquiry(bankCode: string, accountNumber: string) {
    const response: ZainpayInitializePaymentResponse = await Zainpay({
      publicKey: (process.env.ZAINPAY_PUBLIC_LIVE_KEY as string) || this.publicKey,
      serviceType: serviceTypes.NAME_ENQUIRY,
      sandbox: false,
      params: `?bankCode=${bankCode}&accountNumber=${accountNumber}` as never,
    });

    if (!response.data) {
      throw new Error(`Failed to Name Enquiry: ${response}`);
    }

    return response?.data;
  }
}
