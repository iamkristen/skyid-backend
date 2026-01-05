import Joi from "joi";
import { IKYC } from "../kyc/kyc.type";
import { IUser } from "../user/user.types";

const ValidateVSOSchema = {
  createVSO: (payload: IUser & IKYC) => {
    return Joi.object<IUser & IKYC>({
      // firstName: Joi.string()
      //   .pattern(/^[a-zA-Z]+$/, "alphabet characters")
      //   .min(2)
      //   .max(30)
      //   .required()
      //   .messages({
      //     "string.pattern.name": "First name must only contain alphabet characters",
      //     "string.min": "First name must be at least 2 characters long",
      //     "string.max": "First name must be less than or equal to 30 characters long",
      //     "any.required": "First name is required",
      //   }),
      // lastName: Joi.string()
      //   .pattern(/^[a-zA-Z]+$/, "alphabet characters")
      //   .min(2)
      //   .max(30)
      //   .required()
      //   .messages({
      //     "string.pattern.name": "Last name must only contain alphabet characters",
      //     "string.min": "Last name must be at least 2 characters long",
      //     "string.max": "Last name must be less than or equal to 30 characters long",
      //     "any.required": "Last name is required",
      //   }),
      email: Joi.string().email().required(),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      country: Joi.string(),
      state: Joi.string().required(),
      nin: Joi.string().min(11).required(),
    }).validate(payload);
  },
  creditVSO: (payload: { amount: number; vsoId: string }) => {
    return Joi.object<{ amount: number; vsoId: string }>({
      amount: Joi.number().required(),
      vsoId: Joi.string().required(),
    }).validate(payload);
  },

  requestTopUp: (payload: { amount: number }) => {
    return Joi.object<{ amount: number }>({
      amount: Joi.number().min(1).required().messages({
        "number.min": "Amount must be at least 1",
        "any.required": "Amount is required",
      }),
    }).validate(payload);
  },

  createCustomer: (payload: IUser & IKYC & { skyId: string }) => {
    return Joi.object<IUser & IKYC & { skyId: string }>({
      skyId: Joi.string().required(),
      firstName: Joi.string()
        .pattern(/^[a-zA-Z]+$/, "alphabet characters")
        .min(2)
        .max(30)
        .required()
        .messages({
          "string.pattern.name": "First name must only contain alphabet characters",
          "string.min": "First name must be at least 2 characters long",
          "string.max": "First name must be less than or equal to 30 characters long",
          "any.required": "First name is required",
        }),
      lastName: Joi.string()
        .pattern(/^[a-zA-Z]+$/, "alphabet characters")
        .min(2)
        .max(30)
        .required()
        .messages({
          "string.pattern.name": "Last name must only contain alphabet characters",
          "string.min": "Last name must be at least 2 characters long",
          "string.max": "Last name must be less than or equal to 30 characters long",
          "any.required": "Last name is required",
        }),
      email: Joi.string().email().required(),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      country: Joi.string()
        .messages({
          "any.required": "Country is required",
        })
        .required(),
      businessName: Joi.string().required().messages({
        "any.required": "Business name is required",
      }),
      businessType: Joi.string().required().messages({
        "any.required": "Business type is required",
      }),
      address: Joi.string().required(),
      state: Joi.string().required(),
      nin: Joi.string().min(11).required(),
    }).validate(payload);
  },
};

export default ValidateVSOSchema;
