import { model, Schema } from "mongoose";

interface INotificationRead {
  userId: string;
  notificationIds: string[];
}

const notificationReadSchema = new Schema<INotificationRead>(
  {
    userId: { type: String, required: true, unique: true },
    notificationIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

const NotificationRead = model("notificationRead", notificationReadSchema);

export default NotificationRead;

