import Joi from "joi";
import { IKYC } from "../kyc/kyc.type";
import { IUser } from "../user/user.types";
import { channel } from "diagnostics_channel";
import { channelPartner } from "../views/email-template";

const ValidateSchema = {
  signupChannelPartner: (payload: unknown) => {
    return Joi.object<IUser & { signupToken: string }>({
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
          "string.pattern.name": "Phone number must be a valid phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      password: Joi.string().min(5).required(),
      businessType: Joi.string().messages({
        "any.required": "Business type is required",
      }),
      // signupToken: Joi.string().required(),
      channelPartnerLevel: Joi.string().valid("Platinum", "Silver").required().messages({
        "any.only": "Channel partner level must be either 'Platinum' or 'Silver'",
        "any.required": "Channel partner level is required",
      }),
      // nin: Joi.string(),
    }).validate(payload);
  },
};

export default ValidateSchema;
