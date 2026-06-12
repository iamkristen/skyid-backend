import { Response, Request } from "express";
import Post from "./post.model";
import Comment from "./comment.model";
import Story from "./story.model";
import Follow from "./follow.model";
import User from "../user/user.model";
import ValidateCommunitySchema from "./community.schema";
import { Types } from "mongoose";

export default class CommunityController {
  // ==================== POSTS ====================

  /**
   * Create a new post
   */
  static async createPost(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { error } = ValidateCommunitySchema.createPost(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const post = new Post({
        userId: new Types.ObjectId(userId),
        content: req.body.content,
        imageUrl: req.body.imageUrl || null,
        videoUrl: req.body.videoUrl || null,
        location: req.body.location || null,
        tags: req.body.tags || [],
        likes: [],
        shares: [],
        commentsCount: 0,
      });

      await post.save();

      // Populate user data
      const populatedPost = await Post.findById(post._id)
        .populate("userId", "firstName lastName businessName email phoneNumber verified")
        .lean();

      return res.status(201).json({
        message: "Post created successfully",
        data: populatedPost,
      });
    } catch (error: any) {
      console.error("Error creating post:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Get all posts (feed) - posts from users you follow + recommended posts for discovery
   * Like TikTok/Reels: prioritizes followed users but also shows recommended content
   */
  static async getFeed(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      // Get users that the current user follows
      const following = await Follow.find({
        followerId: new Types.ObjectId(userId),
      }).select("followingId");

      const followingIds = following.map((f) => f.followingId);
      const followingIdsWithSelf = [...followingIds, new Types.ObjectId(userId)];

      // Calculate how many posts to get from each source
      // If user follows few people, show more recommended posts
      const followingCount = followingIds.length;
      let followingPostsLimit: number;
      let recommendedPostsLimit: number;

      if (followingCount === 0) {
        // User follows no one - show all recommended
        followingPostsLimit = 0;
        recommendedPostsLimit = limit;
      } else if (followingCount < 5) {
        // User follows few people - 40% following, 60% recommended
        followingPostsLimit = Math.ceil(limit * 0.4);
        recommendedPostsLimit = limit - followingPostsLimit;
      } else if (followingCount < 20) {
        // User follows some people - 60% following, 40% recommended
        followingPostsLimit = Math.ceil(limit * 0.6);
        recommendedPostsLimit = limit - followingPostsLimit;
      } else {
        // User follows many people - 80% following, 20% recommended
        followingPostsLimit = Math.ceil(limit * 0.8);
        recommendedPostsLimit = limit - followingPostsLimit;
      }

      // Get posts from followed users and self
      const followingPosts = followingPostsLimit > 0 ? await Post.find({
        userId: { $in: followingIdsWithSelf },
        isDeleted: false,
      })
        .populate("userId", "firstName lastName businessName email phoneNumber verified profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(followingPostsLimit)
        .lean() : [];

      // Get recommended posts from users NOT followed (for discovery)
      // Prioritize posts with high engagement (likes + comments)
      const recommendedPosts = recommendedPostsLimit > 0 ? await Post.aggregate([
        {
          $match: {
            userId: { $nin: followingIdsWithSelf }, // Not from followed users or self
            isDeleted: false,
          },
        },
        {
          // Calculate engagement score
          $addFields: {
            engagementScore: {
              $add: [
                { $size: { $ifNull: ["$likes", []] } },
                { $multiply: [{ $size: { $ifNull: ["$comments", []] } }, 2] }, // Comments weighted 2x
                { $multiply: [{ $size: { $ifNull: ["$shares", []] } }, 3] }, // Shares weighted 3x
              ],
            },
            // Recency boost - posts from last 7 days get priority
            recencyBoost: {
              $cond: {
                if: {
                  $gte: ["$createdAt", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)],
                },
                then: 100,
                else: 0,
              },
            },
          },
        },
        {
          $addFields: {
            totalScore: { $add: ["$engagementScore", "$recencyBoost"] },
          },
        },
        { $sort: { totalScore: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: recommendedPostsLimit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userId",
            pipeline: [
              {
                $project: {
                  firstName: 1,
                  lastName: 1,
                  businessName: 1,
                  email: 1,
                  phoneNumber: 1,
                  verified: 1,
                  profilePicture: 1,
                },
              },
            ],
          },
        },
        { $unwind: "$userId" },
      ]) : [];

      // Combine and interleave posts for variety
      const allPosts: any[] = [];
      let fIdx = 0;
      let rIdx = 0;

      // Interleave posts: 2 following posts, then 1 recommended, repeat
      while (fIdx < followingPosts.length || rIdx < recommendedPosts.length) {
        // Add up to 2 following posts
        for (let i = 0; i < 2 && fIdx < followingPosts.length; i++) {
          allPosts.push({ ...followingPosts[fIdx], isRecommended: false });
          fIdx++;
        }
        // Add 1 recommended post
        if (rIdx < recommendedPosts.length) {
          allPosts.push({ ...recommendedPosts[rIdx], isRecommended: true });
          rIdx++;
        }
      }

      // Check if current user liked each post
      const postsWithLikeStatus = allPosts.map((post: any) => {
        const isLiked = post.likes?.some(
          (likeId: Types.ObjectId) => likeId.toString() === userId
        ) || false;
        return {
          ...post,
          isLiked,
          likesCount: post.likes?.length || 0,
          sharesCount: post.shares?.length || 0,
        };
      });

      // Get total counts for pagination
      const totalFollowing = await Post.countDocuments({
        userId: { $in: followingIdsWithSelf },
        isDeleted: false,
      });
      const totalRecommended = await Post.countDocuments({
        userId: { $nin: followingIdsWithSelf },
        isDeleted: false,
      });
      const total = totalFollowing + totalRecommended;

      return res.status(200).json({
        message: "Feed retrieved successfully",
        data: postsWithLikeStatus,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        meta: {
          followingPostsCount: followingPosts.length,
          recommendedPostsCount: recommendedPosts.length,
          userFollowingCount: followingCount,
        },
      });
    } catch (error: any) {
      console.error("Error getting feed:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Get posts by a specific user
   */
  static async getUserPosts(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const currentUserId = req.user?._id;

      // Determine the MongoDB ObjectId for the user
      let userObjectId: Types.ObjectId;
      
      // Check if userId is a valid MongoDB ObjectId (24 hex characters)
      const isValidObjectId = /^[a-fA-F0-9]{24}$/.test(userId);
      
      if (isValidObjectId) {
        userObjectId = new Types.ObjectId(userId);
      } else {
        // userId is likely a UUID, look up the user by user_id field
        const user = await User.findOne({ user_id: userId }).select("_id");
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        userObjectId = user._id as Types.ObjectId;
      }

      const posts = await Post.find({
        userId: userObjectId,
        isDeleted: false,
      })
        .populate("userId", "firstName lastName businessName email phoneNumber verified profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const postsWithLikeStatus = posts.map((post: any) => {
        const isLiked = currentUserId
          ? post.likes.some((likeId: Types.ObjectId) => likeId.toString() === currentUserId)
          : false;
        return {
          ...post,
          isLiked,
          likesCount: post.likes.length,
          sharesCount: post.shares.length,
        };
      });

      const total = await Post.countDocuments({
        userId: userObjectId,
        isDeleted: false,
      });

      return res.status(200).json({
        message: "User posts retrieved successfully",
        data: postsWithLikeStatus,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error("Error getting user posts:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Get a single post by ID
   */
  static async getPost(req: Request, res: Response) {
    try {
      const { postId } = req.params;
      const currentUserId = req.user?._id;

      const post = await Post.findOne({
        _id: new Types.ObjectId(postId),
        isDeleted: false,
      })
        .populate("userId", "firstName lastName businessName email phoneNumber verified")
        .lean();

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      const isLiked = currentUserId
        ? (post as any).likes.some(
            (likeId: Types.ObjectId) => likeId.toString() === currentUserId
          )
        : false;

      return res.status(200).json({
        message: "Post retrieved successfully",
        data: {
          ...post,
          isLiked,
          likesCount: (post as any).likes.length,
          sharesCount: (post as any).shares.length,
        },
      });
    } catch (error: any) {
      console.error("Error getting post:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Update a post
   */
  static async updatePost(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { postId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { error } = ValidateCommunitySchema.updatePost(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const post = await Post.findOne({
        _id: new Types.ObjectId(postId),
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      });

      if (!post) {
        return res.status(404).json({ message: "Post not found or unauthorized" });
      }

      // Update fields
      if (req.body.content !== undefined) post.content = req.body.content;
      if (req.body.imageUrl !== undefined) post.imageUrl = req.body.imageUrl;
      if (req.body.videoUrl !== undefined) post.videoUrl = req.body.videoUrl;
      if (req.body.location !== undefined) post.location = req.body.location;

      await post.save();

      const updatedPost = await Post.findById(post._id)
        .populate("userId", "firstName lastName businessName email phoneNumber verified")
        .lean();

      return res.status(200).json({
        message: "Post updated successfully",
        data: updatedPost,
      });
    } catch (error: any) {
      console.error("Error updating post:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Delete a post (soft delete)
   */
  static async deletePost(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { postId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const post = await Post.findOne({
        _id: new Types.ObjectId(postId),
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      });

      if (!post) {
        return res.status(404).json({ message: "Post not found or unauthorized" });
      }

      post.isDeleted = true;
      await post.save();

      return res.status(200).json({ message: "Post deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting post:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Like/Unlike a post
   */
  static async toggleLikePost(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { postId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const post = await Post.findById(new Types.ObjectId(postId));
      if (!post || post.isDeleted) {
        return res.status(404).json({ message: "Post not found" });
      }

      const userIdObj = new Types.ObjectId(userId);
      const isLiked = post.likes.some(
        (likeId) => likeId.toString() === userId
      );

      if (isLiked) {
        // Unlike
        post.likes = post.likes.filter(
          (likeId) => likeId.toString() !== userId
        );
      } else {
        // Like
        post.likes.push(userIdObj);
      }

      await post.save();

      return res.status(200).json({
        message: isLiked ? "Post unliked" : "Post liked",
        data: {
          isLiked: !isLiked,
          likesCount: post.likes.length,
        },
      });
    } catch (error: any) {
      console.error("Error toggling like:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Share a post
   */
  static async sharePost(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { postId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const post = await Post.findById(new Types.ObjectId(postId));
      if (!post || post.isDeleted) {
        return res.status(404).json({ message: "Post not found" });
      }

      const userIdObj = new Types.ObjectId(userId);
      const hasShared = post.shares.some(
        (shareId) => shareId.toString() === userId
      );

      if (!hasShared) {
        post.shares.push(userIdObj);
        await post.save();
      }

      return res.status(200).json({
        message: "Post shared successfully",
        data: {
          sharesCount: post.shares.length,
        },
      });
    } catch (error: any) {
      console.error("Error sharing post:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  // ==================== COMMENTS ====================

  /**
   * Create a comment
   */
  static async createComment(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { error } = ValidateCommunitySchema.createComment(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      // Verify post exists
      const post = await Post.findById(new Types.ObjectId(req.body.postId));
      if (!post || post.isDeleted) {
        return res.status(404).json({ message: "Post not found" });
      }

      const comment = new Comment({
        postId: new Types.ObjectId(req.body.postId),
        userId: new Types.ObjectId(userId),
        content: req.body.content,
        parentCommentId: req.body.parentCommentId
          ? new Types.ObjectId(req.body.parentCommentId)
          : null,
        likes: [],
      });

      await comment.save();

      // Update post comments count
      post.commentsCount += 1;
      await post.save();

      const populatedComment = await Comment.findById(comment._id)
        .populate("userId", "firstName lastName businessName email phoneNumber verified")
        .lean();

      return res.status(201).json({
        message: "Comment created successfully",
        data: populatedComment,
      });
    } catch (error: any) {
      console.error("Error creating comment:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Get comments for a post
   */
  static async getPostComments(req: Request, res: Response) {
    try {
      const { postId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;

      const currentUserId = req.user?._id;

      const comments = await Comment.find({
        postId: new Types.ObjectId(postId),
        isDeleted: false,
        parentCommentId: null, // Only top-level comments
      })
        .populate("userId", "firstName lastName businessName email phoneNumber verified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Get replies for each comment
      const commentsWithReplies = await Promise.all(
        comments.map(async (comment: any) => {
          const replies = await Comment.find({
            parentCommentId: comment._id,
            isDeleted: false,
          })
            .populate("userId", "firstName lastName businessName email phoneNumber verified")
            .sort({ createdAt: 1 })
            .limit(5)
            .lean();

          const isLiked = currentUserId
            ? comment.likes.some(
                (likeId: Types.ObjectId) => likeId.toString() === currentUserId
              )
            : false;

          return {
            ...comment,
            isLiked,
            likesCount: comment.likes.length,
            replies: replies.map((reply: any) => ({
              ...reply,
              isLiked: currentUserId
                ? reply.likes.some(
                    (likeId: Types.ObjectId) => likeId.toString() === currentUserId
                  )
                : false,
              likesCount: reply.likes.length,
            })),
          };
        })
      );

      const total = await Comment.countDocuments({
        postId: new Types.ObjectId(postId),
        isDeleted: false,
        parentCommentId: null,
      });

      return res.status(200).json({
        message: "Comments retrieved successfully",
        data: commentsWithReplies,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error("Error getting comments:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Update a comment
   */
  static async updateComment(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { commentId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { content } = req.body;
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }

      if (content.length > 500) {
        return res.status(400).json({ message: "Comment must be less than 500 characters" });
      }

      const comment = await Comment.findOne({
        _id: new Types.ObjectId(commentId),
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      });

      if (!comment) {
        return res.status(404).json({ message: "Comment not found or unauthorized" });
      }

      comment.content = content.trim();
      await comment.save();

      const updatedComment = await Comment.findById(comment._id)
        .populate("userId", "firstName lastName businessName email phoneNumber verified")
        .lean();

      return res.status(200).json({
        message: "Comment updated successfully",
        data: updatedComment,
      });
    } catch (error: any) {
      console.error("Error updating comment:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Delete a comment
   */
  static async deleteComment(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { commentId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const comment = await Comment.findOne({
        _id: new Types.ObjectId(commentId),
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      });

      if (!comment) {
        return res.status(404).json({ message: "Comment not found or unauthorized" });
      }

      comment.isDeleted = true;
      await comment.save();

      // Update post comments count
      const post = await Post.findById(comment.postId);
      if (post) {
        post.commentsCount = Math.max(0, post.commentsCount - 1);
        await post.save();
      }

      return res.status(200).json({ message: "Comment deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting comment:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Like/Unlike a comment
   */
  static async toggleLikeComment(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { commentId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const comment = await Comment.findById(new Types.ObjectId(commentId));
      if (!comment || comment.isDeleted) {
        return res.status(404).json({ message: "Comment not found" });
      }

      const userIdObj = new Types.ObjectId(userId);
      const isLiked = comment.likes.some(
        (likeId) => likeId.toString() === userId
      );

      if (isLiked) {
        comment.likes = comment.likes.filter(
          (likeId) => likeId.toString() !== userId
        );
      } else {
        comment.likes.push(userIdObj);
      }

      await comment.save();

      return res.status(200).json({
        message: isLiked ? "Comment unliked" : "Comment liked",
        data: {
          isLiked: !isLiked,
          likesCount: comment.likes.length,
        },
      });
    } catch (error: any) {
      console.error("Error toggling comment like:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  // ==================== STORIES ====================

  /**
   * Create a story
   */
  static async createStory(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { error } = ValidateCommunitySchema.createStory(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      // Stories expire after 24 hours
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const story = new Story({
        userId: new Types.ObjectId(userId),
        items: req.body.items.map((item: any) => ({
          imageUrl: item.imageUrl,
          videoUrl: item.videoUrl || null,
          caption: item.caption || null,
          views: [],
        })),
        expiresAt,
      });

      await story.save();

      const populatedStory = await Story.findById(story._id)
        .populate("userId", "firstName lastName businessName email phoneNumber verified profilePicture")
        .lean();

      return res.status(201).json({
        message: "Story created successfully",
        data: populatedStory,
      });
    } catch (error: any) {
      console.error("Error creating story:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Get stories from users you follow
   */
  static async getStories(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get users that the current user follows
      const following = await Follow.find({
        followerId: new Types.ObjectId(userId),
      }).select("followingId");

      const followingIds = following.map((f) => f.followingId);
      followingIds.push(new Types.ObjectId(userId)); // Include own stories

      // Get active stories (not expired)
      const stories = await Story.find({
        userId: { $in: followingIds },
        expiresAt: { $gt: new Date() },
      })
        .populate("userId", "firstName lastName businessName email phoneNumber verified profilePicture")
        .sort({ createdAt: -1 })
        .lean();

      // Group stories by user
      const storiesByUser: any = {};
      stories.forEach((story: any) => {
        const userIdStr = story.userId._id.toString();
        if (!storiesByUser[userIdStr]) {
          // Build userName from available fields
          const firstName = story.userId.firstName || '';
          const lastName = story.userId.lastName || '';
          const businessName = story.userId.businessName || '';
          let userName = businessName || `${firstName} ${lastName}`.trim();
          if (!userName) userName = story.userId.email || 'Unknown User';
          
          storiesByUser[userIdStr] = {
            id: userIdStr,
            userId: story.userId._id,
            userName: userName,
            userAvatar: story.userId.profilePicture || '',
            items: [],
            verificationLevel: story.userId.verified || "none",
            hasUnviewed: false,
          };
        }

        // Check if current user has viewed all items
        const hasUnviewed = story.items.some((item: any) => {
          return !item.views.some(
            (viewId: Types.ObjectId) => viewId.toString() === userId
          );
        });

        if (hasUnviewed) {
          storiesByUser[userIdStr].hasUnviewed = true;
        }

        storiesByUser[userIdStr].items.push(...story.items);
      });

      const storiesList = Object.values(storiesByUser);

      return res.status(200).json({
        message: "Stories retrieved successfully",
        data: storiesList,
      });
    } catch (error: any) {
      console.error("Error getting stories:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Mark a story item as viewed
   */
  static async viewStory(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { storyId, itemId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const story = await Story.findById(new Types.ObjectId(storyId));
      if (!story) {
        return res.status(404).json({ message: "Story not found" });
      }

      const item = story.items.find(
        (i) => i._id?.toString() === itemId
      );
      if (!item) {
        return res.status(404).json({ message: "Story item not found" });
      }

      const userIdObj = new Types.ObjectId(userId);
      const hasViewed = item.views.some(
        (viewId: Types.ObjectId) => viewId.toString() === userId
      );

      if (!hasViewed) {
        item.views.push(userIdObj);
        await story.save();
      }

      return res.status(200).json({ message: "Story viewed successfully" });
    } catch (error: any) {
      console.error("Error viewing story:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  // ==================== FOLLOW ====================

  /**
   * Follow a user
   */
  static async followUser(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { error } = ValidateCommunitySchema.followUser(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const followingId = new Types.ObjectId(req.body.userId);

      if (userId === followingId.toString()) {
        return res.status(400).json({ message: "Cannot follow yourself" });
      }

      // Check if user exists
      const user = await User.findById(followingId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if already following
      const existingFollow = await Follow.findOne({
        followerId: new Types.ObjectId(userId),
        followingId,
      });

      if (existingFollow) {
        return res.status(400).json({ message: "Already following this user" });
      }

      const follow = new Follow({
        followerId: new Types.ObjectId(userId),
        followingId,
      });

      await follow.save();

      return res.status(200).json({
        message: "User followed successfully",
        data: follow,
      });
    } catch (error: any) {
      if (error.code === 11000) {
        return res.status(400).json({ message: "Already following this user" });
      }
      console.error("Error following user:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Unfollow a user
   */
  static async unfollowUser(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { userId: followingId } = req.params;

      const follow = await Follow.findOneAndDelete({
        followerId: new Types.ObjectId(userId),
        followingId: new Types.ObjectId(followingId),
      });

      if (!follow) {
        return res.status(404).json({ message: "Not following this user" });
      }

      return res.status(200).json({ message: "User unfollowed successfully" });
    } catch (error: any) {
      console.error("Error unfollowing user:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Get followers of a user
   */
  static async getFollowers(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const followers = await Follow.find({
        followingId: new Types.ObjectId(userId),
      })
        .populate("followerId", "firstName lastName businessName email phoneNumber verified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Follow.countDocuments({
        followingId: new Types.ObjectId(userId),
      });

      return res.status(200).json({
        message: "Followers retrieved successfully",
        data: followers.map((f: any) => f.followerId),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error("Error getting followers:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Get users that a user follows
   */
  static async getFollowing(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const following = await Follow.find({
        followerId: new Types.ObjectId(userId),
      })
        .populate("followingId", "firstName lastName businessName email phoneNumber verified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Follow.countDocuments({
        followerId: new Types.ObjectId(userId),
      });

      return res.status(200).json({
        message: "Following retrieved successfully",
        data: following.map((f: any) => f.followingId),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error("Error getting following:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Check if current user follows a specific user
   */
  static async checkFollowStatus(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const { userId: targetUserId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const follow = await Follow.findOne({
        followerId: new Types.ObjectId(userId),
        followingId: new Types.ObjectId(targetUserId),
      });

      return res.status(200).json({
        message: "Follow status retrieved successfully",
        data: {
          isFollowing: !!follow,
        },
      });
    } catch (error: any) {
      console.error("Error checking follow status:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Get user profile with stats
   */
  static async getUserProfile(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?._id;

      // Determine the MongoDB ObjectId for the user
      let userObjectId: Types.ObjectId;
      let user: any;
      
      // Check if userId is a valid MongoDB ObjectId (24 hex characters)
      const isValidObjectId = /^[a-fA-F0-9]{24}$/.test(userId);
      
      if (isValidObjectId) {
        userObjectId = new Types.ObjectId(userId);
        user = await User.findById(userObjectId)
          .select("-password -__v")
          .lean();
      } else {
        // userId is likely a UUID, look up the user by user_id field
        user = await User.findOne({ user_id: userId })
          .select("-password -__v")
          .lean();
        if (user) {
          userObjectId = user._id as Types.ObjectId;
        }
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get stats using the MongoDB ObjectId
      const postsCount = await Post.countDocuments({
        userId: userObjectId!,
        isDeleted: false,
      });

      const followersCount = await Follow.countDocuments({
        followingId: userObjectId!,
      });

      const followingCount = await Follow.countDocuments({
        followerId: userObjectId!,
      });

      // Check if current user follows this user
      let isFollowing = false;
      // Check if this user follows the current user (for "Follow Back" feature)
      let isFollowedByUser = false;
      
      if (currentUserId && currentUserId !== userObjectId!.toString()) {
        const currentUserObjectId = new Types.ObjectId(currentUserId);
        
        // Check if current user follows this user
        const followRecord = await Follow.findOne({
          followerId: currentUserObjectId,
          followingId: userObjectId!,
        });
        isFollowing = !!followRecord;
        
        // Check if this user follows the current user
        const followBackRecord = await Follow.findOne({
          followerId: userObjectId!,
          followingId: currentUserObjectId,
        });
        isFollowedByUser = !!followBackRecord;
      }

      // Map verification level
      let verificationLevel: "none" | "bronze" | "gold" | "platinum" = "none";
      if (user.verified === "Bronze") verificationLevel = "bronze";
      else if (user.verified === "Gold") verificationLevel = "gold";
      else if (user.verified === "Platinum") verificationLevel = "platinum";

      return res.status(200).json({
        message: "User profile retrieved successfully",
        data: {
          ...user,
          postsCount,
          followersCount,
          followingCount,
          isFollowing,
          isFollowedByUser, // True if this user follows the current user
          verificationLevel,
        },
      });
    } catch (error: any) {
      console.error("Error getting user profile:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }
}


