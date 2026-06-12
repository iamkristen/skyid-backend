import { Response, Request } from "express";
import { StorageService, uploadSingle } from "../utils/storage.service";
import path from "path";

export default class CommunityUploadController {
  /**
   * Upload image/video for a post
   */
  static async uploadPostMedia(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Upload file using storage service
      const fileUrl = await StorageService.uploadFile(file.path, "posts");

      return res.status(200).json({
        message: "File uploaded successfully",
        data: {
          url: fileUrl,
          fileName: path.basename(file.path),
          mimeType: file.mimetype,
          size: file.size,
        },
      });
    } catch (error: any) {
      console.error("Error uploading post media:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Upload image/video for a story
   */
  static async uploadStoryMedia(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Upload file using storage service
      const fileUrl = await StorageService.uploadFile(file.path, "stories");

      return res.status(200).json({
        message: "File uploaded successfully",
        data: {
          url: fileUrl,
          fileName: path.basename(file.path),
          mimeType: file.mimetype,
          size: file.size,
        },
      });
    } catch (error: any) {
      console.error("Error uploading story media:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Upload multiple files for stories (multiple story items)
   */
  static async uploadMultipleStoryMedia(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      if (files.length > 10) {
        return res.status(400).json({ message: "Maximum 10 files allowed" });
      }

      // Upload all files
      const uploadPromises = files.map((file) =>
        StorageService.uploadFile(file.path, "stories")
      );
      const urls = await Promise.all(uploadPromises);

      const uploadedFiles = files.map((file, index) => ({
        url: urls[index],
        fileName: path.basename(file.path),
        mimeType: file.mimetype,
        size: file.size,
      }));

      return res.status(200).json({
        message: "Files uploaded successfully",
        data: uploadedFiles,
      });
    } catch (error: any) {
      console.error("Error uploading multiple story media:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }

  /**
   * Upload profile picture
   */
  static async uploadProfilePicture(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Only allow images for profile pictures
      if (!file.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "Only images are allowed for profile pictures" });
      }

      // Upload file using storage service
      const fileUrl = await StorageService.uploadFile(file.path, "profiles");

      return res.status(200).json({
        message: "Profile picture uploaded successfully",
        data: {
          url: fileUrl,
          fileName: path.basename(file.path),
          mimeType: file.mimetype,
          size: file.size,
        },
      });
    } catch (error: any) {
      console.error("Error uploading profile picture:", error);
      return res.status(500).json({ message: error.message || "Internal server error" });
    }
  }
}



