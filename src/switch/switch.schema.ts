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

  createIndividualMapping: (payload: {
    skyId: string;
    mappedNumbers: { number: string; network: string }[];
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    skyIdExpiresAt: string | Date;
    submissionSource?: "mapping_page" | "claim_assign";
  }) => {
    const mappedNumberSchema = Joi.object({
      number: Joi.string().required(),
      network: Joi.string().valid("MTN", "GLO", "AIRTEL", "ETISALAT").required(),
    });
    return Joi.object({
      skyId: Joi.string().required().messages({ "any.required": "Smart number (Sky ID) is required" }),
      mappedNumbers: Joi.array().items(mappedNumberSchema).min(1).required().messages({
        "array.min": "At least one mapped line is required",
      }),
      firstName: Joi.string().required().messages({ "any.required": "First name is required" }),
      lastName: Joi.string().required().messages({ "any.required": "Last name is required" }),
      email: Joi.string().email().required().messages({
        "string.email": "Valid email is required",
        "any.required": "Email is required",
      }),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({ "any.required": "Phone number is required" }),
      skyIdExpiresAt: Joi.date().required().messages({
        "any.required": "SkyID expiry date is required",
        "date.base": "SkyID expiry must be a valid date",
      }),
      submissionSource: Joi.string().valid("mapping_page", "claim_assign").optional(),
    }).validate(payload);
  },

  rejectIndividualMappingRequest: (payload: { reason: string }) => {
    return Joi.object({
      reason: Joi.string().required().messages({ "any.required": "Rejection reason is required" }),
    }).validate(payload);
  },
};

export default validation;
