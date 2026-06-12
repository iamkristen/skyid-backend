import { model, Schema, Types } from "mongoose";

export interface IConversation {
  participant1_id: Types.ObjectId;
  participant2_id: Types.ObjectId;
  last_message_id?: Types.ObjectId;
  is_active: boolean;
}

const conversationSchema = new Schema<IConversation>(
  {
    participant1_id: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    participant2_id: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    last_message_id: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: false,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Define unique index for conversations
conversationSchema.index({ participant1_id: 1, participant2_id: 1 }, { unique: true, name: "unique_conversation" });

const Conversation = model<IConversation>("Conversation", conversationSchema);

export default Conversation;

