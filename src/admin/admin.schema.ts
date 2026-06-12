import Joi from "joi";
import { IAdminUser } from "./admin.type";
import { IUser } from "../user/user.types";

export const validation = {
  signup: (signup: IAdminUser) => {
    return Joi.object({
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
      password: Joi.string().min(5).optional().strip(),
      phoneNumber: Joi.string()
        .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      role: Joi.string(),
      roles: Joi.array().items(Joi.string()),
    }).validate(signup);
  },

  signIn: (signin: IUser) => {
    return Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
    }).validate(signin);
  },
};

export default validation;
