import { Router } from "express";
import CommunityController from "./community.controller";
import CommunityUploadController from "./community.upload.controller";
import { validateToken } from "../middleware/validateToken";
import { uploadSingle, uploadMultiple } from "../utils/storage.service";

const communityRoutes = Router();

// All routes require authentication
communityRoutes.use(validateToken);

// ==================== POSTS ====================
communityRoutes.post("/posts", CommunityController.createPost);
communityRoutes.get("/posts/feed", CommunityController.getFeed);
communityRoutes.get("/posts/user/:userId", CommunityController.getUserPosts);
communityRoutes.get("/posts/:postId", CommunityController.getPost);
communityRoutes.put("/posts/:postId", CommunityController.updatePost);
communityRoutes.delete("/posts/:postId", CommunityController.deletePost);
communityRoutes.post("/posts/:postId/like", CommunityController.toggleLikePost);
communityRoutes.post("/posts/:postId/share", CommunityController.sharePost);

// ==================== COMMENTS ====================
communityRoutes.post("/comments", CommunityController.createComment);
communityRoutes.get("/posts/:postId/comments", CommunityController.getPostComments);
communityRoutes.put("/comments/:commentId", CommunityController.updateComment);
communityRoutes.delete("/comments/:commentId", CommunityController.deleteComment);
communityRoutes.post("/comments/:commentId/like", CommunityController.toggleLikeComment);

// ==================== STORIES ====================
communityRoutes.post("/stories", CommunityController.createStory);
communityRoutes.get("/stories", CommunityController.getStories);
communityRoutes.post("/stories/:storyId/items/:itemId/view", CommunityController.viewStory);

// ==================== FOLLOW ====================
communityRoutes.post("/follow", CommunityController.followUser);
communityRoutes.delete("/follow/:userId", CommunityController.unfollowUser);
communityRoutes.get("/users/:userId/followers", CommunityController.getFollowers);
communityRoutes.get("/users/:userId/following", CommunityController.getFollowing);
communityRoutes.get("/users/:userId/follow-status", CommunityController.checkFollowStatus);

// ==================== PROFILE ====================
communityRoutes.get("/users/:userId/profile", CommunityController.getUserProfile);

// ==================== FILE UPLOADS ====================
communityRoutes.post("/upload/post-media", uploadSingle("file"), CommunityUploadController.uploadPostMedia);
communityRoutes.post("/upload/story-media", uploadSingle("file"), CommunityUploadController.uploadStoryMedia);
communityRoutes.post("/upload/story-media/multiple", uploadMultiple("files", 10), CommunityUploadController.uploadMultipleStoryMedia);
communityRoutes.post("/upload/profile-picture", uploadSingle("file"), CommunityUploadController.uploadProfilePicture);

export default communityRoutes;

