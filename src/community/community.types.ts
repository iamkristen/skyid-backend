import { Types } from "mongoose";

export type VerificationLevel = "none" | "bronze" | "gold" | "platinum";

export interface IPost {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  location?: string | null;
  tags?: string[];
  likes: Types.ObjectId[];
  shares: Types.ObjectId[];
  commentsCount: number;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IComment {
  _id?: Types.ObjectId;
  postId: Types.ObjectId;
  userId: Types.ObjectId;
  content: string;
  parentCommentId?: Types.ObjectId | null;
  likes: Types.ObjectId[];
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStoryItem {
  _id?: Types.ObjectId;
  imageUrl: string;
  videoUrl?: string | null;
  caption?: string | null;
  views: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStory {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  items: IStoryItem[];
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IFollow {
  _id?: Types.ObjectId;
  followerId: Types.ObjectId;
  followingId: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICreatePost {
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  location?: string;
  tags?: string[];
}

export interface ICreateComment {
  postId: string;
  content: string;
  parentCommentId?: string;
}

export interface ICreateStory {
  items: Array<{
    imageUrl: string;
    videoUrl?: string;
    caption?: string;
  }>;
}

export interface IUpdatePost {
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  location?: string;
  tags?: string[];
}



