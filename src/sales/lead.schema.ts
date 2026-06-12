import Joi from "joi";
import { LEAD_STAGES } from "./lead.model";

export default {
  createLead: (payload: unknown) =>
    Joi.object({
      name: Joi.string().required().trim(),
      email: Joi.string().email().required().trim(),
      phone: Joi.string().allow("").trim(),
      company: Joi.string().allow("").trim(),
      stage: Joi.string()
        .valid(...LEAD_STAGES)
        .default("new"),
      source: Joi.string().allow("").trim(),
      notes: Joi.string().allow("").trim(),
    }).validate(payload),

  updateLead: (payload: unknown) =>
    Joi.object({
      name: Joi.string().trim(),
      email: Joi.string().email().trim(),
      phone: Joi.string().allow("").trim(),
      company: Joi.string().allow("").trim(),
      stage: Joi.string().valid(...LEAD_STAGES),
      source: Joi.string().allow("").trim(),
      notes: Joi.string().allow("").trim(),
    })
      .min(1)
      .validate(payload),
};
