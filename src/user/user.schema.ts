import Joi from "joi";
import { IUser } from "./user.types";
import { IKYC } from "../kyc/kyc.type";

const ValidateUserSchema = {
  signup: (signup: IUser) => {
    return Joi.object({
      firstName: Joi.string().min(2).max(30).required().messages({
        "string.pattern.name": "First name must only contain alphabet characters",
        "string.min": "First name must be at least 2 characters long",
        "string.max": "First name must be less than or equal to 30 characters long",
        "any.required": "First name is required",
      }),
      lastName: Joi.string().min(2).max(30).required().messages({
        "string.pattern.name": "Last name must only contain alphabet characters",
        "string.min": "Last name must be at least 2 characters long",
        "string.max": "Last name must be less than or equal to 30 characters long",
        "any.required": "Last name is required",
      }),
      email: Joi.string().email().required(),
      password: Joi.string().min(5).required(),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      state: Joi.string(),
      country: Joi.string()
        .messages({
          "any.required": "Country is required",
        })
        .required(),
      businessName: Joi.string().messages({
        "any.required": "Business name is required",
      }),
      businessType: Joi.string().messages({
        "any.required": "Business type is required",
      }),
      accountType: Joi.string().messages({
        "any.required": "Business type is required",
      }),
      agentCode: Joi.string().messages({
        "any.required": "Agent code is required",
      }),
    }).validate(signup);
  },

  kyc: (kyc: IKYC) => {
    return Joi.object<IKYC>({
      phone: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      address: Joi.string().required(),
      state: Joi.string().required(),
      nin: Joi.string().min(11).required(),
    }).validate(kyc);
  },

  /** Individual KYC: NIN only (verified before submit); backend re-verifies and stores NIN details */
  kycIndividual: (payload: { nin: string }) => {
    return Joi.object({
      nin: Joi.string()
        .pattern(/^[0-9]{11}$/, "11-digit NIN")
        .required()
        .messages({
          "string.pattern.base": "NIN must be exactly 11 digits",
          "any.required": "NIN is required",
        }),
    }).validate(payload);
  },

  validatePublicSignupEmail: (email: string) => {
    return Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
      "any.required": "Email is required",
    }).validate(email);
  },

  checkEmailAndPhone: (data: { email: string; phoneNumber: string }) => {
    return Joi.object({
      email: Joi.string().email().required().messages({
        "string.email": "Please provide a valid email address",
        "string.empty": "Email is required",
        "any.required": "Email is required",
      }),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
    }).validate(data);
  },

  checkAvailability: (data: { email?: string; phoneNumber?: string }) => {
    return Joi.object({
      email: Joi.string().email().optional().messages({
        "string.email": "Please provide a valid email address",
      }),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .optional()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
        }),
    })
      .or("email", "phoneNumber")
      .messages({ "object.missing": "At least one of email or phoneNumber is required" })
      .validate(data);
  },
};

export default ValidateUserSchema;
