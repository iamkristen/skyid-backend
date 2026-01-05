import Joi from "joi";
import { IAgentCode } from "../agent/agent.types";

export const validation = {
  createAgentCode: (payload: IAgentCode) =>
    Joi.object<Omit<IAgentCode, "code" | "createdBy" | "updatedBy" | "status"> & { code?: string }>({
      code: Joi.string().optional(),
      discountPercent: Joi.number().required(),
      expiresAt: Joi.date().optional().options({ convert: true }),
    }).validate(payload),
  editAgentCode: (payload: IAgentCode) =>
    Joi.object<Pick<IAgentCode, "code" | "status" | "discountPercent" | "allocationPercent">>({
      code: Joi.string().required(),
      status: Joi.string().valid("active", "inactive").optional(),
      discountPercent: Joi.number().min(0).max(100).optional(),
      allocationPercent: Joi.number().min(0).max(100).optional(),
    }).validate(payload),
};

export default validation;
