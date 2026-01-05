import { model, Schema } from "mongoose";
import { ICompetitionRegistration } from "./competition.types";

const competitionSchema = new Schema<ICompetitionRegistration>(
  {
    name: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    tiktokHandle: {
      type: String,
      required: true,
    },
    instagramHandle: {
      type: String,
      required: true,
    },
    videoLink: {
      type: String,
      required: true,
    },
    auditionCode: {
      type: String,
      required: true,
      unique: true,
    },
    isWinner: {
      type: Boolean,
      default: false,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Competition = model("competitions", competitionSchema);

export default Competition;

