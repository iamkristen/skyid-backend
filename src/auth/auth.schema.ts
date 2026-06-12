import Joi from "joi";
import { IOtp, IUser } from "../user/user.types";
import { ICheckEmail } from "./auth.types";

const ValidateAuthSchema = {
  signIn: (signin: IUser) => {
    return Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
    }).validate(signin);
  },
  forgotPassword: (forgotPassword: IUser) => {
    return Joi.object({
      email: Joi.string().email().required(),
    }).validate(forgotPassword);
  },

  confirmEmail: (payload: ICheckEmail) => {
    return Joi.object({
      email: Joi.string().email().required(),
      otp: Joi.string().min(6).required(),
    }).validate(payload);
  },

  resetPassword: (payload: IOtp) => {
    return Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
      otp: Joi.string().min(6).required(),
    }).validate(payload);
  },
  checkEmail: (email: string) => {
    return Joi.string().email().validate(email);
  },
  googleSignIn: (payload: { idToken: string; accountType?: string; businessName?: string; businessType?: string }) => {
    return Joi.object({
      idToken: Joi.string().required(),
      accountType: Joi.string().valid("Individual", "Channel_Partner", "VSO", "Agent").optional(),
      businessName: Joi.string().optional(),
      businessType: Joi.string().optional(),
    }).validate(payload);
  },

  setNewPassword: (payload: { newPassword: string }) => {
    return Joi.object({
      newPassword: Joi.string().min(8).required().messages({
        "string.min": "Password must be at least 8 characters",
        "any.required": "New password is required",
      }),
    }).validate(payload);
  },

  changePassword: (payload: { currentPassword: string; newPassword: string }) => {
    return Joi.object({
      currentPassword: Joi.string().required().messages({ "any.required": "Current password is required" }),
      newPassword: Joi.string().min(8).required().messages({
        "string.min": "New password must be at least 8 characters",
        "any.required": "New password is required",
      }),
    }).validate(payload);
  },
};

export default ValidateAuthSchema;
