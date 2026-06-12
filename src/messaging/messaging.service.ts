import User from "../user/user.model";
import SkyId from "../smart-number/number.skyId.model";
import Conversation from "./conversation.model";
import Message from "./message.model";

interface UserRegistrationResult {
  is_registered: boolean;
  can_start_conversation?: boolean;
  message: string;
  user_id?: string;
  display_name?: string;
  phone_number?: string;
  avatar_url?: string;
}

interface ConversationResult {
  conversations: any[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_conversations: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

interface MessagesResult {
  messages: any[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_messages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

export class MessagingService {
  /**
   * Check if a SKY ID number, email, or phone number is registered and can receive messages
   */
  async checkUserRegistration(
    identifier: string, // Can be SKY ID number, email, or phone number
    requesterId: string
  ): Promise<UserRegistrationResult> {
    try {
      let user: any = null;
      let skyId: any = null;

      // Check if identifier is an email
      if (identifier.includes("@")) {
        user = await User.findOne({
          email: identifier.toLowerCase().trim(),
          status: "active",
        });

        if (user) {
          // Find their active SKY ID
          skyId = await SkyId.findOne({
            userId: user._id,
            status: "active",
          });
        }
      } else {
        // Try as SKY ID number first
        const cleanPhone = identifier.replace(/\D/g, "");
        skyId = await SkyId.findOne({
          skyId: cleanPhone,
          status: "active",
        });

        if (skyId) {
          user = await User.findById(skyId.userId);
        } else {
          // Try as regular phone number
          user = await User.findOne({
            phoneNumber: cleanPhone,
            status: "active",
          });

          if (user) {
            // Find their active SKY ID
            skyId = await SkyId.findOne({
              userId: user._id,
              status: "active",
            });
          }
        }
      }

      // User must exist and be active - SKY ID is optional
      if (!user) {
        return {
          is_registered: false,
          message: "User not found",
        };
      }

      // Verify user is active
      if (user.status !== "active") {
        return {
          is_registered: false,
          message: "User account is not active",
        };
      }

      // Check if user is trying to message themselves
      if (user._id.toString() === requesterId) {
        return {
          is_registered: true,
          can_start_conversation: false,
          message: "You cannot message yourself",
        };
      }

      const displayName =
        user.businessName ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        "User";

      // SKY ID is optional - return it if exists, but don't require it
      return {
        is_registered: true,
        user_id: user._id.toString(),
        display_name: displayName,
        phone_number: skyId?.skyId || undefined,
        can_start_conversation: true,
        message: "User is registered and can receive messages",
      };
    } catch (error) {
      console.error("Error checking user registration:", error);
      throw new Error("Failed to check user registration");
    }
  }

  /**
   * Create or get existing conversation between two users
   */
  async createOrGetConversation(
    participant1Id: string,
    participant2Id: string
  ): Promise<any> {
    try {
      // Ensure consistent ordering to avoid duplicate conversations
      const [p1, p2] = [participant1Id, participant2Id].sort();

      let conversation = await Conversation.findOne({
        participant1_id: p1,
        participant2_id: p2,
      })
        .populate("participant1_id", "firstName lastName businessName phoneNumber")
        .populate("participant2_id", "firstName lastName businessName phoneNumber");

      if (!conversation) {
        conversation = await Conversation.create({
          participant1_id: p1,
          participant2_id: p2,
          is_active: true,
        });

        // Populate the newly created conversation
        conversation = await Conversation.findById(conversation._id)
          .populate("participant1_id", "firstName lastName businessName phoneNumber")
          .populate("participant2_id", "firstName lastName businessName phoneNumber");
      }

      return conversation;
    } catch (error) {
      console.error("Error creating/getting conversation:", error);
      throw new Error("Failed to create or get conversation");
    }
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string
  ): Promise<any> {
    try {
      // Validate conversation exists and user is participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const isParticipant =
        conversation.participant1_id.toString() === senderId ||
        conversation.participant2_id.toString() === senderId;

      if (!isParticipant) {
        throw new Error("User is not a participant in this conversation");
      }

      // Create message
      const message = await Message.create({
        conversation_id: conversationId,
        sender_id: senderId,
        content: content.trim(),
        message_type: "text",
        status: "sent",
      });

      // Update conversation with last message
      await Conversation.findByIdAndUpdate(conversationId, {
        last_message_id: message._id,
        updatedAt: new Date(),
      });

      // Populate message with sender info
      const populatedMessage = await Message.findById(message._id).populate(
        "sender_id",
        "firstName lastName businessName phoneNumber"
      );

      return populatedMessage;
    } catch (error) {
      console.error("Error sending message:", error);
      throw new Error("Failed to send message");
    }
  }

  /**
   * Get messages for a conversation with pagination
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<MessagesResult> {
    try {
      // Verify user is participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const isParticipant =
        conversation.participant1_id.toString() === userId ||
        conversation.participant2_id.toString() === userId;

      if (!isParticipant) {
        throw new Error("User is not a participant in this conversation");
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get messages with pagination
      const messages = await Message.find({ conversation_id: conversationId })
        .populate("sender_id", "firstName lastName businessName phoneNumber profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Get total count for pagination info
      const totalMessages = await Message.countDocuments({
        conversation_id: conversationId,
      });

      // Transform messages to clean JSON format
      const transformedMessages = messages.reverse().map((msg: any) => {
        const sender = msg.sender_id as any;

        return {
          message_id: msg._id.toString(),
          conversation_id: msg.conversation_id.toString(),
          sender_id: sender._id?.toString() || sender.toString(),
          content: msg.content,
          message_type: msg.message_type || "text",
          status: msg.status || "sent",
          created_at: msg.createdAt.toISOString(),
          updated_at: msg.updatedAt.toISOString(),
          sender_name:
            sender.businessName ||
            [sender.firstName, sender.lastName].filter(Boolean).join(" ") ||
            null,
          sender_phone_number: sender.phoneNumber || null,
          sender_avatar: sender.profilePicture || null,
        };
      });

      return {
        messages: transformedMessages,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalMessages / limit),
          total_messages: totalMessages,
          has_next: page < Math.ceil(totalMessages / limit),
          has_previous: page > 1,
        },
      };
    } catch (error) {
      console.error("Error getting conversation messages:", error);
      throw new Error("Failed to get conversation messages");
    }
  }

  /**
   * Get user's conversations with last message
   */
  async getUserConversations(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<ConversationResult> {
    try {
      const skip = (page - 1) * limit;

      // Find conversations where user is a participant
      const conversations = await Conversation.find({
        $or: [{ participant1_id: userId }, { participant2_id: userId }],
        is_active: true,
      })
        .populate("participant1_id", "firstName lastName businessName phoneNumber profilePicture")
        .populate("participant2_id", "firstName lastName businessName phoneNumber profilePicture")
        .populate("last_message_id")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);

      // Get total count
      const totalConversations = await Conversation.countDocuments({
        $or: [{ participant1_id: userId }, { participant2_id: userId }],
        is_active: true,
      });

      // Get user's SKY ID for display
      const userSkyId = await SkyId.findOne({
        userId: userId,
        status: "active",
      });

      // Transform conversations to clean JSON format
      const transformedConversations = conversations.map((conv: any) => {
        const participant1 = conv.participant1_id as any;
        const participant2 = conv.participant2_id as any;
        const lastMessage = conv.last_message_id as any;

        // Determine the other participant
        const otherParticipant =
          participant1._id?.toString() === userId ? participant2 : participant1;

        return {
          conversation_id: conv._id.toString(),
          participant1_id: participant1._id?.toString() || participant1.toString(),
          participant2_id: participant2._id?.toString() || participant2.toString(),
          other_participant_id: otherParticipant._id?.toString(),
          other_participant_name:
            otherParticipant.businessName ||
            [otherParticipant.firstName, otherParticipant.lastName]
              .filter(Boolean)
              .join(" ") ||
            null,
          other_participant_phone_number: otherParticipant.phoneNumber || null,
          other_participant_avatar: otherParticipant.profilePicture || null,
          last_message_id: lastMessage?._id?.toString() || lastMessage?.toString() || null,
          last_message: lastMessage
            ? {
                message_id: lastMessage._id?.toString() || lastMessage.toString(),
                content: lastMessage.content,
                sender_id: lastMessage.sender_id?.toString(),
                message_type: lastMessage.message_type || "text",
                status: lastMessage.status || "sent",
                created_at: lastMessage.createdAt?.toISOString() || new Date().toISOString(),
                updated_at: lastMessage.updatedAt?.toISOString() || new Date().toISOString(),
              }
            : null,
          is_active: conv.is_active,
          created_at: conv.createdAt.toISOString(),
          updated_at: conv.updatedAt.toISOString(),
        };
      });

      return {
        conversations: transformedConversations,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalConversations / limit),
          total_conversations: totalConversations,
          has_next: page < Math.ceil(totalConversations / limit),
          has_previous: page > 1,
        },
      };
    } catch (error) {
      console.error("Error getting user conversations:", error);
      throw new Error("Failed to get user conversations");
    }
  }

  /**
   * Update message status (delivered/read)
   */
  async updateMessageStatus(
    messageId: string,
    status: "delivered" | "read",
    userId: string
  ): Promise<any> {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error("Message not found");
      }

      // Verify user is participant in the conversation
      const conversation = await Conversation.findById(message.conversation_id);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const isParticipant =
        conversation.participant1_id.toString() === userId ||
        conversation.participant2_id.toString() === userId;

      if (!isParticipant) {
        throw new Error("User is not a participant in this conversation");
      }

      // Update message status
      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { status },
        { new: true }
      );

      return updatedMessage;
    } catch (error) {
      console.error("Error updating message status:", error);
      throw new Error("Failed to update message status");
    }
  }

  /**
   * Initiate messaging with a SKY ID number, email, or phone number - handles validation and conversation creation
   */
  async initiateMessageBySkyIdNumber(
    identifier: string, // Can be SKY ID number, email, or phone number
    requesterId: string,
    messageContent?: string
  ): Promise<{
    success: boolean;
    message: string;
    conversation_id?: string;
    user_id?: string;
    display_name?: string;
    phone_number?: string;
  }> {
    try {
      // First check if user is registered
      const registrationResult = await this.checkUserRegistration(
        identifier,
        requesterId
      );

      if (!registrationResult.is_registered) {
        return {
          success: false,
          message: registrationResult.message,
        };
      }

      if (!registrationResult.can_start_conversation) {
        return {
          success: false,
          message: registrationResult.message,
        };
      }

      // User is available, create or get conversation
      if (!registrationResult.user_id) {
        throw new Error("User ID is missing from registration result");
      }
      const conversation = await this.createOrGetConversation(
        requesterId,
        registrationResult.user_id
      );

      // If message content is provided, send the message
      if (messageContent?.trim()) {
        await this.sendMessage(
          conversation._id.toString(),
          requesterId,
          messageContent.trim()
        );
      }

      return {
        success: true,
        message: "Message sent successfully",
        conversation_id: conversation._id.toString(),
        user_id: registrationResult.user_id,
        display_name: registrationResult.display_name,
        phone_number: registrationResult.phone_number,
      };
    } catch (error) {
      console.error("Error initiating message by SKY ID number:", error);
      return {
        success: false,
        message: "Failed to initiate message",
      };
    }
  }

  /**
   * Get conversation by ID and verify user access
   */
  async getConversationById(
    conversationId: string,
    userId: string
  ): Promise<any> {
    try {
      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return null;
      }

      // Check if user is a participant
      const isParticipant =
        conversation.participant1_id?.toString() === userId ||
        conversation.participant2_id?.toString() === userId;

      if (!isParticipant) {
        return null;
      }

      return conversation;
    } catch (error) {
      console.error("Error getting conversation by ID:", error);
      return null;
    }
  }

  /**
   * Mark messages as read for a user in a conversation
   */
  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    try {
      await Message.updateMany(
        {
          conversation_id: conversationId,
          sender_id: { $ne: userId },
          status: { $ne: "read" },
        },
        {
          status: "read",
          updatedAt: new Date(),
        }
      );
    } catch (error) {
      console.error("Error marking messages as read:", error);
      throw error;
    }
  }

  /**
   * Search for users by SKY ID, email, phone number, or name
   */
  async searchUsers(
    searchQuery: string,
    requesterId: string,
    limit: number = 20
  ): Promise<UserRegistrationResult[]> {
    try {
      const results: UserRegistrationResult[] = [];

      // Normalize search query
      const cleanQuery = searchQuery.trim();
      if (cleanQuery.length < 2) {
        return results; // Require at least 2 characters
      }

      console.log(`🔍 [SEARCH] Searching for: "${cleanQuery}" by user: ${requesterId}`);

      // Check if it's an email
      if (cleanQuery.includes("@")) {
        const user = await User.findOne({
          email: cleanQuery.toLowerCase().trim(),
          status: "active",
          _id: { $ne: requesterId }, // Exclude requester
        });

        if (user) {
          const skyId = await SkyId.findOne({
            userId: user._id,
            status: "active",
          });

          const displayName =
            user.businessName ||
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            "User";

          // All active users can receive messages - SKY ID is optional
          results.push({
            is_registered: true,
            can_start_conversation: true,
            message: "User found",
            user_id: user._id.toString(),
            display_name: displayName,
            phone_number: skyId?.skyId || undefined,
            avatar_url: user.profilePicture || undefined,
          });
        }
        return results;
      }

      // Try as SKY ID number
      const cleanPhone = cleanQuery.replace(/\D/g, "");
      if (cleanPhone.length >= 7) {
        // Search by SKY ID
        const skyIds = await SkyId.find({
          skyId: { $regex: cleanPhone, $options: "i" },
          status: "active",
        }).limit(limit);

        for (const skyId of skyIds) {
          const user = await User.findById(skyId.userId);
          if (user && user.status === "active" && user._id.toString() !== requesterId) {
            // Check if we already have this user in results
            if (results.some((r) => r.user_id === user._id.toString())) {
              continue;
            }

            const displayName =
              user.businessName ||
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              "User";

            results.push({
              is_registered: true,
              can_start_conversation: true,
              message: "User found",
              user_id: user._id.toString(),
              display_name: displayName,
              phone_number: skyId.skyId,
            });
          }
        }
      }

      // Search by name (firstName, lastName, businessName)
      if (results.length < limit) {
        const nameRegex = new RegExp(cleanQuery, "i");
        const users = await User.find({
          $or: [
            { firstName: nameRegex },
            { lastName: nameRegex },
            { businessName: nameRegex },
            { email: nameRegex },
            { phoneNumber: { $regex: cleanQuery.replace(/\D/g, ""), $options: "i" } },
          ],
          status: "active",
          _id: { $ne: requesterId },
        })
          .limit(limit - results.length)
          .lean();

        for (const user of users) {
          // Check if we already have this user in results
          if (results.some((r) => r.user_id === user._id.toString())) {
            continue;
          }

          const skyId = await SkyId.findOne({
            userId: user._id,
            status: "active",
          });

          const displayName =
            user.businessName ||
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            "User";

          // All active users can receive messages - SKY ID is optional
          results.push({
            is_registered: true,
            can_start_conversation: true,
            message: "User found",
            user_id: user._id.toString(),
            display_name: displayName,
            phone_number: skyId?.skyId || undefined,
            avatar_url: user.profilePicture || undefined,
          });
        }
      }

      console.log(`📊 [SEARCH] Total results: ${results.length} users`);
      return results;
    } catch (error) {
      console.error("Error searching users:", error);
      throw new Error("Failed to search users");
    }
  }
}

