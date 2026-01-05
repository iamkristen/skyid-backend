import Joi from "joi";
import { IBuyNumberRequest } from "./switch.type";

export const validation = {
  checkRequest: (payload: IBuyNumberRequest) => {
    return Joi.object({
      userId: Joi.string().required(),
      skyId: Joi.string(),
      mappedNumbers: Joi.string(),
      request_type: Joi.string(),
      network_type: Joi.string(),
      account_type: Joi.string(),
    }).validate(payload);
  },

  checkId: (payload: string) => {
    return Joi.object({
      id: Joi.string().required(),
    }).validate(payload);
  },
};

export default validation;
