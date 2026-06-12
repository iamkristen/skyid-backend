import Joi from "joi";
import { BuyAddons, DeleteAddon, IBuyNumber, INumber, UploadAddon } from "./number.types";
import { IReplaceNumberRequest } from "../switch/switch.type";

const numberValidator = Joi.object({
  number: Joi.string().required(),
  network: Joi.string().required(),
});

const ValidateNumberSchema = {
  buyNumber: (payload: IBuyNumber) => {
    return Joi.object<IBuyNumber>({
      skyId: Joi.string()
        // .pattern(/^(\+?234|0)[789][01]\d{8}$/, "Nigeria phone number")
        .required()
        .messages({
          "string.pattern.name": "Phone number must be a valid Nigerian phone number",
          "string.base": "Phone number must be a string",
          "string.empty": "Phone number is required",
          "any.required": "Phone number is required",
        }),
      mappedNumbers: Joi.array().items(numberValidator).min(1).required(),
      withIVR: Joi.boolean().required(),
      withIVM: Joi.boolean().required(),
      _id: Joi.string().when("isSignup", {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.required(),
      }),
      bankName: Joi.string().optional(),
      bankAccountName: Joi.string().optional(),
      bankAccountNumber: Joi.string().optional(),
      callbackUrl: Joi.string().optional(),
      isSignup: Joi.boolean().optional(),
      email: Joi.string().email().when("isSignup", {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
      phoneNumber: Joi.string().when("isSignup", {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
    }).validate(payload);
  },

  checkReplaceNumber: (payload: IReplaceNumberRequest & { callbackUrl?: string }) => {
    return Joi.object<{
      skyId: string;
      current_number: INumber;
      new_number: INumber;
      bankName: string;
      bankAccountName: string;
      bankAccountNumber: string;
      callbackUrl?: string;
    }>({
      skyId: Joi.string().required(),
      current_number: numberValidator,
      new_number: numberValidator,
      bankName: Joi.string().optional(),
      bankAccountName: Joi.string().optional(),
      bankAccountNumber: Joi.string().optional(),
      callbackUrl: Joi.string(),
    }).validate(payload);
  },

  buyAddons: (payload: BuyAddons) => {
    return Joi.object<BuyAddons>({
      skyId: Joi.string().required(),
      ivr: Joi.boolean().optional(),
      ivm: Joi.boolean().optional(),
      bankName: Joi.string().optional(),
      bankAccountName: Joi.string().optional(),
      bankAccountNumber: Joi.string().optional(),
      callbackUrl: Joi.string(),
    }).validate(payload);
  },
  uploadAddon: (payload: UploadAddon) => {
    return Joi.object<UploadAddon>({
      skyId: Joi.string().required(),
      name: Joi.string().required(),
      ivr: Joi.boolean().optional(),
      ivm: Joi.boolean().optional(),
    }).validate(payload);
  },
  deleteAddon: (payload: DeleteAddon) => {
    return Joi.object<DeleteAddon>({
      skyId: Joi.string().required(),
      requestId: Joi.string().required(),
    }).validate(payload);
  },

  checkPhoneNumber: (number: string) => {
    return Joi.string()
      .messages({
        "string.pattern.base": "Phone number must contain only digits.",
        "string.empty": "Phone number is required.",
      })
      .validate(number);
  },
};

export default ValidateNumberSchema;
