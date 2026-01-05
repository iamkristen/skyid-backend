import Joi from "joi";
import { IChannelPartner } from "../partner/partner.types";

export const ValidateSchema = {
  createChannelPartner: (payload: unknown) =>
    Joi.object({
      email: Joi.string().email().required(),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      state: Joi.string().messages({
        "any.required": "Business name is required",
      }),
      businessName: Joi.string().messages({
        "any.required": "Business type is required",
      }),
      businessType: Joi.string().messages({
        "any.required": "Business type is required",
      }),
      channelPartnerLevel: Joi.string().valid("Platinum", "Silver").required().messages({
        "any.only": "Channel partner level must be either 'Platinum' or 'Silver'",
        "any.required": "Channel partner level is required",
      }),
      nin: Joi.string().min(11).required(),

      // address: Joi.string()
      //   .messages({
      //     "any.required": "Address is required",
      //   })
      //   .required(),
      // nin: Joi.string(),
      // password: Joi.string().messages({
      //   "any.required": "Business type is required",
      // }),
    }).validate(payload),

  // createChannelPartner: (payload: unknown) =>
  //   Joi.object({
  //     firstName: Joi.string()
  //       .pattern(/^[a-zA-Z]+$/, "alphabet characters")
  //       .min(2)
  //       .max(30)
  //       .required()
  //       .messages({
  //         "string.pattern.name": "First name must only contain alphabet characters",
  //         "string.min": "First name must be at least 2 characters long",
  //         "string.max": "First name must be less than or equal to 30 characters long",
  //         "any.required": "First name is required",
  //       }),
  //     lastName: Joi.string()
  //       .pattern(/^[a-zA-Z]+$/, "alphabet characters")
  //       .min(2)
  //       .max(30)
  //       .required()
  //       .messages({
  //         "string.pattern.name": "Last name must only contain alphabet characters",
  //         "string.min": "Last name must be at least 2 characters long",
  //         "string.max": "Last name must be less than or equal to 30 characters long",
  //         "any.required": "Last name is required",
  //       }),
  //     email: Joi.string().email().required(),
  //     phoneNumber: Joi.string()
  //       .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
  //       .required()
  //       .messages({
  //         "string.pattern.name": "Phone number must be a valid Nigerian phone number",
  //         "string.base": "Phone number must be a string",
  //         "string.empty": "Phone number is required",
  //         "any.required": "Phone number is required",
  //       }),
  //     address: Joi.string()
  //       .messages({
  //         "any.required": "Country is required",
  //       })
  //       .required(),
  //     state: Joi.string().messages({
  //       "any.required": "Business name is required",
  //     }),
  //     businessName: Joi.string().messages({
  //       "any.required": "Business type is required",
  //     }),
  //     businessType: Joi.string().messages({
  //       "any.required": "Business type is required",
  //     }),
  //   }).validate(payload),

  sendEmailToAccountManager: (payload: IChannelPartner) => {
    return Joi.object<IChannelPartner>({
      name: Joi.string().required(),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      email: Joi.string().email().required(),
      businessName: Joi.string().required().messages({
        "any.required": "Business name is required",
      }),
      region: Joi.string().required(),
      accountType: Joi.string().required(),
    }).validate(payload);
  },
};

export default ValidateSchema;
