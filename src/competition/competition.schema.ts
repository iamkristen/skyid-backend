import Joi from "joi";
import { ICompetitionRegistration } from "./competition.types";

const ValidateCompetitionSchema = {
  register: (data: ICompetitionRegistration) => {
    return Joi.object({
      name: Joi.string().min(2).max(100).required().messages({
        "string.min": "Name must be at least 2 characters long",
        "string.max": "Name must be less than 100 characters long",
        "any.required": "Name is required",
      }),
      state: Joi.string().required().messages({
        "any.required": "State is required",
      }),
      tiktokHandle: Joi.string()
        .pattern(/^@?[\w.]+$/)
        .required()
        .messages({
          "string.pattern.base": "Please enter a valid TikTok handle",
          "any.required": "TikTok handle is required",
        }),
      instagramHandle: Joi.string()
        .pattern(/^@?[\w.]+$/)
        .required()
        .messages({
          "string.pattern.base": "Please enter a valid Instagram handle",
          "any.required": "Instagram handle is required",
        }),
      videoLink: Joi.string()
        .uri()
        .pattern(/youtube\.com|youtu\.be|tiktok\.com|instagram\.com/)
        .required()
        .messages({
          "string.uri": "Please enter a valid URL",
          "string.pattern.base": "Please enter a valid YouTube, TikTok, or Instagram link",
          "any.required": "Video link is required",
        }),
    }).validate(data);
  },
};

export default ValidateCompetitionSchema;

