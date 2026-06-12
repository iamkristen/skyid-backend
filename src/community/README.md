# Community/Social Media API

This module provides all the backend functionality for the community/social media features in the SKY ID app.

## Features

- ✅ Posts (create, read, update, delete, like, share)
- ✅ Comments (create, read, update, delete, like, nested replies)
- ✅ Stories (create, view, auto-expire after 24 hours)
- ✅ Follow/Unfollow users
- ✅ User profiles with stats
- ✅ File uploads (images/videos) - **Currently simulated, ready for Azure migration**

## API Endpoints

### Posts
- `POST /api/v1/community/posts` - Create a post
- `GET /api/v1/community/posts/feed` - Get feed (paginated)
- `GET /api/v1/community/posts/user/:userId` - Get user's posts
- `GET /api/v1/community/posts/:postId` - Get single post
- `PUT /api/v1/community/posts/:postId` - Update post
- `DELETE /api/v1/community/posts/:postId` - Delete post
- `POST /api/v1/community/posts/:postId/like` - Like/Unlike post
- `POST /api/v1/community/posts/:postId/share` - Share post

### Comments
- `POST /api/v1/community/comments` - Create comment
- `GET /api/v1/community/posts/:postId/comments` - Get post comments
- `PUT /api/v1/community/comments/:commentId` - Update comment
- `DELETE /api/v1/community/comments/:commentId` - Delete comment
- `POST /api/v1/community/comments/:commentId/like` - Like/Unlike comment

### Stories
- `POST /api/v1/community/stories` - Create story
- `GET /api/v1/community/stories` - Get stories from followed users
- `POST /api/v1/community/stories/:storyId/items/:itemId/view` - Mark story as viewed

### Follow
- `POST /api/v1/community/follow` - Follow a user
- `DELETE /api/v1/community/follow/:userId` - Unfollow a user
- `GET /api/v1/community/users/:userId/followers` - Get followers
- `GET /api/v1/community/users/:userId/following` - Get following list
- `GET /api/v1/community/users/:userId/follow-status` - Check follow status

### Profile
- `GET /api/v1/community/users/:userId/profile` - Get user profile with stats

### File Uploads (Simulated)
- `POST /api/v1/community/upload/post-media` - Upload image/video for post
- `POST /api/v1/community/upload/story-media` - Upload image/video for story
- `POST /api/v1/community/upload/story-media/multiple` - Upload multiple files for stories
- `POST /api/v1/community/upload/profile-picture` - Upload profile picture

## File Upload

Currently, file uploads are **simulated** and stored locally in the `uploads/` directory. Files are served statically via Express.

### Upload Format

All upload endpoints accept `multipart/form-data` with a file field:
- Post media: field name `file`
- Story media: field name `file`
- Multiple story media: field name `files` (array)
- Profile picture: field name `file`

### Response Format

```json
{
  "message": "File uploaded successfully",
  "data": {
    "url": "http://localhost:8000/uploads/posts/abc123.jpg",
    "fileName": "abc123.jpg",
    "mimeType": "image/jpeg",
    "size": 123456
  }
}
```

### Migration to Azure

See `src/utils/AZURE_STORAGE_MIGRATION.md` for detailed migration instructions.

## Environment Variables

Add to `.env`:
```
API_BASE_URL=http://localhost:8000  # For file URLs (optional, defaults to localhost:8000)
```

When migrating to Azure, you'll also need:
```
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER_NAME=skyid-uploads
AZURE_STORAGE_ACCOUNT_NAME=...
AZURE_STORAGE_ACCOUNT_KEY=...
```

## Authentication

All endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <token>
```

## Usage Example

### Create a Post with Image

1. First, upload the image:
```bash
POST /api/v1/community/upload/post-media
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <image_file>
```

2. Then create the post with the returned URL:
```bash
POST /api/v1/community/posts
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Check out this amazing product!",
  "imageUrl": "http://localhost:8000/uploads/posts/abc123.jpg"
}
```

### Get Feed

```bash
GET /api/v1/community/posts/feed?page=1&limit=20
Authorization: Bearer <token>
```

## Notes

- Posts and comments use soft delete (marked as deleted, not removed from DB)
- Stories automatically expire after 24 hours using MongoDB TTL index
- Feed shows posts from users you follow + your own posts
- All endpoints support pagination where applicable
- File size limit: 10MB per file
- Allowed file types: JPEG, PNG, GIF, WebP, MP4, QuickTime, AVI



