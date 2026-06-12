import { model, Schema, Types } from "mongoose";
import { IFollow } from "./community.types";

const followSchema = new Schema<IFollow>(
  {
    followerId: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    followingId: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Ensure unique follower-following pairs
followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

// Prevent users from following themselves
followSchema.pre("save", function (next) {
  if (this.followerId.toString() === this.followingId.toString()) {
    return next(new Error("Cannot follow yourself"));
  }
  next();
});

const Follow = model<IFollow>("follows", followSchema);

export default Follow;



