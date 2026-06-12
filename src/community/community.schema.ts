import Joi from "joi";
import {
  ICreatePost,
  ICreateComment,
  ICreateStory,
  IUpdatePost,
} from "./community.types";

const ValidateCommunitySchema = {
  createPost: (post: ICreatePost) => {
    return Joi.object({
      content: Joi.string().required().min(1).max(2000).trim(),
      imageUrl: Joi.string().uri().optional().allow(null, ""),
      videoUrl: Joi.string().uri().optional().allow(null, ""),
      location: Joi.string().optional().allow(null, "").max(200),
      tags: Joi.array().items(Joi.string().trim().max(50)).optional().max(10),
    }).validate(post);
  },

  updatePost: (post: IUpdatePost) => {
    return Joi.object({
      content: Joi.string().optional().min(1).max(2000).trim(),
      imageUrl: Joi.string().uri().optional().allow(null, ""),
      videoUrl: Joi.string().uri().optional().allow(null, ""),
      location: Joi.string().optional().allow(null, "").max(200),
      tags: Joi.array().items(Joi.string().trim().max(50)).optional().max(10),
    }).validate(post);
  },

  createComment: (comment: ICreateComment) => {
    return Joi.object({
      postId: Joi.string().required(),
      content: Joi.string().required().min(1).max(500).trim(),
      parentCommentId: Joi.string().optional().allow(null, ""),
    }).validate(comment);
  },

  createStory: (story: ICreateStory) => {
    return Joi.object({
      items: Joi.array()
        .items(
          Joi.object({
            imageUrl: Joi.string().uri().required(),
            videoUrl: Joi.string().uri().optional().allow(null, ""),
            caption: Joi.string().optional().allow(null, "").max(200),
          })
        )
        .min(1)
        .max(10)
        .required(),
    }).validate(story);
  },

  followUser: (payload: { userId: string }) => {
    return Joi.object({
      userId: Joi.string().required(),
    }).validate(payload);
  },
};

export default ValidateCommunitySchema;



