import Joi from "joi";

export const validation = {
  createAgent: (payload: unknown) =>
    Joi.object({
      nin: Joi.string().required().max(11).min(11).messages({
        "string.base": "NIN must be a string",
        "string.empty": "NIN is required",
        "any.required": "NIN is required",
        "string.max": "NIN must be 11 characters long",
        "string.min": "NIN must be 11 characters long",
      }),
      firstName: Joi.string(),
      lastName: Joi.string(),
      middleName: Joi.string(),
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
      password: Joi.string().required(),
      bankName: Joi.string().required(),
      bankCode: Joi.string().required(),
      accountNumber: Joi.string().required(),
      state: Joi.string().required(),
    }).validate(payload),
};

export default validation;
