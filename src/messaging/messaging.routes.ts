import express from "express";
import { validateToken } from "../middleware/validateToken";
import {
  checkUserRegistration,
  createOrGetConversation,
  sendMessage,
  getConversationMessages,
  getUserConversations,
  updateMessageStatus,
  initiateMessageBySkyIdNumber,
  searchUsers,
} from "./messaging.controller";

const router = express.Router();

// All messaging routes require authentication
router.use(validateToken);

// Check if a SKY ID number is registered and can receive messages
router.post("/check-user", checkUserRegistration);

// Initiate a message with a SKY ID number (enhanced endpoint)
router.post("/initiate-message", initiateMessageBySkyIdNumber);

// Create or get conversation between two users
router.post("/conversations", createOrGetConversation);

// Get user's conversations with pagination
router.get("/conversations", getUserConversations);

// Get messages for a specific conversation with pagination
router.get(
  "/conversations/:conversation_id/messages",
  getConversationMessages
);

// Send a message in a conversation
router.post("/conversations/:conversation_id/messages", sendMessage);

// Update message status (delivered/read)
router.put("/messages/:message_id/status", updateMessageStatus);

// Search for users to message
router.get("/search-users", searchUsers);

export default router;

