import { model, Schema, Types } from "mongoose";
import numberSchema, { ISkyId } from "./number.types";

const skyIdSchema = new Schema<ISkyId>(
  {
    skyId: { type: String, required: true, unique: true },
    mappedNumbers: [numberSchema],
    withIVR: Boolean,
    withIVM: Boolean,
    userId: Types.ObjectId,
    customerId: String,
    status: {
      type: String,
      required: true,
      enum: ["pending", "active", "inactive"],
    },
    amount: Number,
    renewal: {
      type: Date,
      default: () => {
        const date = new Date();
        date.setFullYear(date.getFullYear() + 1);
        return date;
      },
    },
  },
  { timestamps: true }
);

const SkyId = model("skyId", skyIdSchema);

export default SkyId;
