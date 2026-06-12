import { model, Schema, Types } from "mongoose";

export interface IMessage {
  conversation_id: Types.ObjectId;
  sender_id: Types.ObjectId;
  content: string;
  message_type: "text" | "image" | "file" | "location";
  status: "sent" | "delivered" | "read";
}

const messageSchema = new Schema<IMessage>(
  {
    conversation_id: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender_id: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    message_type: {
      type: String,
      enum: ["text", "image", "file", "location"],
      default: "text",
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
  },
  {
    timestamps: true,
  }
);

// Define indexes
messageSchema.index({ conversation_id: 1, createdAt: -1 }, { name: "conversation_messages" });
messageSchema.index({ sender_id: 1, createdAt: -1 }, { name: "user_messages" });

const Message = model<IMessage>("Message", messageSchema);

export default Message;

