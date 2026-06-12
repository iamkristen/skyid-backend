import { Request, Response } from "express";
import { MessagingService } from "./messaging.service";
import Conversation from "./conversation.model";

const messagingService = new MessagingService();

/**
 * Check if a SKY ID number is registered and can receive messages
 */
export const checkUserRegistration = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { 
      sky_id_number: skyIdNumber,
      email,
      phone_number: phoneNumber,
      identifier // Generic identifier that can be any of the above
    } = req.body;
    const requesterId = req.user?._id.toString();

    // Use identifier if provided, otherwise use specific fields
    const searchIdentifier = identifier || skyIdNumber || email || phoneNumber;

    if (!searchIdentifier) {
      return res.status(400).json({
        success: false,
        message: "SKY ID number, email, phone number, or identifier is required",
      });
    }

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const result = await messagingService.checkUserRegistration(
      searchIdentifier,
      requesterId
    );

    // Return appropriate status code based on registration status
    if (result.is_registered && result.can_start_conversation) {
      return res.status(200).json({
        success: true,
        data: result,
      });
    } else if (result.is_registered && !result.can_start_conversation) {
      // User exists but can't start conversation (self-message, etc.)
      return res.status(403).json({
        success: false,
        data: result,
      });
    } else {
      // User not registered
      return res.status(404).json({
        success: false,
        data: result,
      });
    }
  } catch (error) {
    console.error("Error in checkUserRegistration:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Create or get conversation between two users
 */
export const createOrGetConversation = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { participant_id: participantId } = req.body;
    const requesterId = req.user?._id.toString();

    if (!participantId) {
      return res.status(400).json({
        success: false,
        message: "Participant ID is required",
      });
    }

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (participantId === requesterId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create conversation with yourself",
      });
    }

    const conversation = await messagingService.createOrGetConversation(
      requesterId,
      participantId
    );

    return res.status(200).json({
      success: true,
      data: {
        conversation_id: conversation._id,
        participant1: conversation.participant1_id,
        participant2: conversation.participant2_id,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error in createOrGetConversation:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Send a message in a conversation
 */
export const sendMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const conversationId = req.params.conversation_id;
    const { content } = req.body;
    const senderId = req.user?._id.toString();

    if (!conversationId || !content) {
      return res.status(400).json({
        success: false,
        message: "Conversation ID and content are required",
      });
    }

    if (!senderId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message content cannot be empty",
      });
    }

    if (content.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Message content is too long (max 1000 characters)",
      });
    }

    // Get the conversation to find the other participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    // Create message in database
    const message = await messagingService.sendMessage(
      conversationId,
      senderId,
      content
    );

    // TODO: Integrate with Socket.IO and FCM for real-time notifications
    // This would notify the other participant if they're online or via push notification

    // Return success response
    const sender = message.sender_id as any;
    return res.status(201).json({
      success: true,
      data: {
        message_id: message._id.toString(),
        conversation_id: message.conversation_id.toString(),
        sender_id: sender._id?.toString() || sender.toString(),
        content: message.content,
        message_type: message.message_type,
        status: message.status,
        created_at: message.createdAt.toISOString(),
        updated_at: message.updatedAt.toISOString(),
        sender_name:
          sender.businessName ||
          [sender.firstName, sender.lastName].filter(Boolean).join(" ") ||
          null,
        sender_phone_number: sender.phoneNumber || null,
        sender_avatar: sender.profilePicture || null,
      },
    });
  } catch (error: any) {
    console.error("Error in sendMessage:", error);

    if (error.message === "Conversation not found") {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }
    if (error.message === "User is not a participant in this conversation") {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get messages for a conversation with pagination
 */
export const getConversationMessages = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { conversation_id: conversationId } = req.params;
    const userId = req.user?._id.toString();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "Conversation ID is required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Limit the maximum number of messages per request
    const maxLimit = Math.min(limit, 50);

    const result = await messagingService.getConversationMessages(
      conversationId,
      userId,
      page,
      maxLimit
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error in getConversationMessages:", error);

    if (error.message === "Conversation not found") {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }
    if (error.message === "User is not a participant in this conversation") {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get user's conversations with last message
 */
export const getUserConversations = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?._id.toString();
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Limit the maximum number of conversations per request
    const maxLimit = Math.min(limit, 50);

    const result = await messagingService.getUserConversations(
      userId,
      page,
      maxLimit
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in getUserConversations:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Initiate message by SKY ID number - handles validation and messaging in one call
 */
export const initiateMessageBySkyIdNumber = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const {
      sky_id_number: skyIdNumber,
      email,
      phone_number: phoneNumber,
      user_id: userId,
      identifier, // Generic identifier
      message_content: messageContent,
    } = req.body;
    const requesterId = req.user?._id.toString();

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // If user_id is provided, create conversation directly
    if (userId) {
      try {
        const conversation = await messagingService.createOrGetConversation(
          requesterId,
          userId
        );

        // If message content is provided, send the message
        if (messageContent?.trim()) {
          await messagingService.sendMessage(
            conversation._id.toString(),
            requesterId,
            messageContent.trim()
          );
        }

        // Get user info for response
        const User = (await import("../user/user.model")).default;
        const user = await User.findById(userId);
        const displayName = user
          ? user.businessName ||
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            "User"
          : "User";

        return res.status(201).json({
          success: true,
          data: {
            success: true,
            message: "Message sent successfully",
            conversation_id: conversation._id.toString(),
            user_id: userId,
            display_name: displayName,
          },
        });
      } catch (error: any) {
        console.error("Error initiating message by user ID:", error);
        return res.status(400).json({
          success: false,
          message: error.message || "Failed to initiate message",
        });
      }
    }

    // Use identifier if provided, otherwise use specific fields
    // Explicitly check for empty strings, not just falsy values
    const searchIdentifier = 
      (identifier && identifier.trim()) ||
      (skyIdNumber && skyIdNumber.trim()) ||
      (email && email.trim()) ||
      (phoneNumber && phoneNumber.trim()) ||
      null;

    if (!searchIdentifier || searchIdentifier.length === 0) {
      console.log(`❌ [INITIATE] Missing identifier. Received:`, {
        sky_id_number: skyIdNumber,
        email,
        phone_number: phoneNumber,
        user_id: userId,
        identifier,
      });
      return res.status(400).json({
        success: false,
        message: "User ID, SKY ID number, email, phone number, or identifier is required",
      });
    }

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    console.log(`🔍 [INITIATE] Initiating message with identifier: "${searchIdentifier}" by user: ${requesterId}`);
    
    const result = await messagingService.initiateMessageBySkyIdNumber(
      searchIdentifier,
      requesterId,
      messageContent
    );

    console.log(`📊 [INITIATE] Result: success=${result.success}, message="${result.message}"`);

    if (result.success) {
      return res.status(201).json({
        success: true,
        data: result,
      });
    } else {
      // Determine status code based on the message content
      let statusCode = 400;
      if (result.message.includes("not registered") || result.message.includes("doesn't have an active SKY ID")) {
        statusCode = 404;
      } else if (
        result.message.includes("cannot message yourself") ||
        result.message.includes("messaging disabled")
      ) {
        statusCode = 403;
      } else if (result.message.includes("Failed to initiate message")) {
        statusCode = 500;
      }

      return res.status(statusCode).json({
        success: false,
        data: result,
      });
    }
  } catch (error) {
    console.error("Error in initiateMessageBySkyIdNumber:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Update message status (delivered/read)
 */
export const updateMessageStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { message_id: messageId } = req.params;
    const { status } = req.body;
    const userId = req.user?._id.toString();

    if (!messageId || !status) {
      return res.status(400).json({
        success: false,
        message: "Message ID and status are required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!["delivered", "read"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "delivered" or "read"',
      });
    }

    const updatedMessage = await messagingService.updateMessageStatus(
      messageId,
      status as "delivered" | "read",
      userId
    );

    return res.status(200).json({
      success: true,
      data: {
        message_id: updatedMessage._id.toString(),
        status: updatedMessage.status,
        updated_at: updatedMessage.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error in updateMessageStatus:", error);

    if (error.message === "Message not found") {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }
    if (error.message === "User is not a participant in this conversation") {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this conversation",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Search for users to message
 */
export const searchUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { query } = req.query;
    const requesterId = req.user?._id.toString();
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const results = await messagingService.searchUsers(
      query as string,
      requesterId,
      Math.min(limit, 50) // Cap at 50 results
    );

    return res.status(200).json({
      success: true,
      data: {
        users: results,
        count: results.length,
      },
    });
  } catch (error) {
    console.error("Error in searchUsers:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
