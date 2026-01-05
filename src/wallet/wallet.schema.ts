import Joi from "joi";
import { ITransaction } from "./wallet.type";

const ValidationSchema = {
  deposit: (payload: ITransaction) => {
    return Joi.object({
      accountNumber: Joi.string().required(),
      amount: Joi.number().required(),
      bankName: Joi.string(),
      bankAccountName: Joi.string(),
      bankAccountNumber: Joi.string(),
    }).validate(payload);
  },

  withdraw: (payload: ITransaction) => {
    return Joi.object({
      accountNumber: Joi.string().required(),
      amount: Joi.number().required(),
      bankName: Joi.string().required(),
      bankAccountName: Joi.string().required(),
      bankAccountNumber: Joi.string().required(),
    }).validate(payload);
  },
};

export default ValidationSchema;
