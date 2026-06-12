import { model, Schema, Types } from "mongoose";
import { IStory, IStoryItem } from "./community.types";

const storyItemSchema = new Schema<IStoryItem>(
  {
    imageUrl: {
      type: String,
      required: true,
    },
    videoUrl: {
      type: String,
      default: null,
    },
    caption: {
      type: String,
      default: null,
      maxlength: 200,
    },
    views: [
      {
        type: Schema.Types.ObjectId,
        ref: "users",
      },
    ],
  },
  { timestamps: true }
);

const storySchema = new Schema<IStory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    items: [storyItemSchema],
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete after expiration
    },
  },
  { timestamps: true }
);

// Indexes
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 });

const Story = model<IStory>("stories", storySchema);

export default Story;



