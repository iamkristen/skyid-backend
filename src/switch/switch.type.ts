import { INumber } from "../smart-number/number.types";

interface ISwitchRequest {
  request_type: "buy" | "replace" | "ivr" | "ivm" | "addMappedNumbers" | "remove";
  skyId: string;
  /**
   * awaiting: awaiting payment
   * pending: payment received, pending approval
   * approved: request approved
   * rejected: request rejected
   */
  status: "awaiting" | "pending" | "approved" | "rejected";
  txnRef: string;
  amount: number;
  createdBy: string;
  handledBy?: string;
  remark?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IBuyNumberRequest extends ISwitchRequest {
  request_type: "buy" | "addMappedNumbers";
  mappedNumbers: INumber[];
}

// export interface IAddMappedNumbersNumberRequest extends ISwitchRequest {
//   request_type: "addMappedNumbers";
//   mappedNumbers: INumber[];
// }

export interface IReplaceNumberRequest extends ISwitchRequest {
  request_type: "replace";
  current_number: INumber;
  new_number: INumber;
}

export interface IRemoveNumberRequest extends ISwitchRequest {
  request_type: "remove";
  current_number: INumber;
}

export interface IAddonRequest extends ISwitchRequest {
  request_type: "ivr" | "ivm";
  fileUrl: string;
}
