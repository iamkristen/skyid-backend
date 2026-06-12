import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// Storage configuration - using disk storage for simulation
// This will be replaced with Azure Blob Storage later
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images and videos are allowed."));
    }
  },
});

/**
 * Simulated Azure Storage Service
 * This is a temporary implementation that simulates Azure Blob Storage
 * TODO: Replace with actual Azure Blob Storage SDK
 */
export class StorageService {
  private static baseUrl = process.env.API_BASE_URL || "http://localhost:8000";
  private static uploadsPath = path.join(__dirname, "../../uploads");

  /**
   * Upload a file (simulated - stores locally for now)
   * @param filePath - Path to the uploaded file
   * @param folder - Folder name (e.g., 'posts', 'stories')
   * @returns Public URL of the uploaded file
   */
  static async uploadFile(
    filePath: string,
    folder: "posts" | "stories" | "profiles" = "posts"
  ): Promise<string> {
    try {
      // In simulation, we just return a URL pointing to the local file
      // In production, this will upload to Azure Blob Storage
      const fileName = path.basename(filePath);
      
      // Create folder structure
      const folderPath = path.join(this.uploadsPath, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Move file to folder
      const destination = path.join(folderPath, fileName);
      fs.renameSync(filePath, destination);

      // Return simulated URL
      // In production, this will be the Azure Blob Storage URL
      const publicUrl = `${this.baseUrl}/uploads/${folder}/${fileName}`;
      
      console.log(`📁 [STORAGE] File uploaded (simulated): ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      console.error("Error uploading file:", error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Delete a file (simulated)
   * @param fileUrl - URL of the file to delete
   */
  static async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Extract file path from URL
      const urlParts = fileUrl.split("/uploads/");
      if (urlParts.length < 2) {
        console.warn(`⚠️ [STORAGE] Invalid file URL format: ${fileUrl}`);
        return;
      }

      const filePath = path.join(this.uploadsPath, urlParts[1]);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ [STORAGE] File deleted: ${filePath}`);
      }
    } catch (error: any) {
      console.error("Error deleting file:", error);
      // Don't throw error - file might not exist
    }
  }

  /**
   * Get file URL (for Azure, this will construct the blob URL)
   * @param fileName - Name of the file
   * @param folder - Folder name
   */
  static getFileUrl(fileName: string, folder: "posts" | "stories" | "profiles" = "posts"): string {
    return `${this.baseUrl}/uploads/${folder}/${fileName}`;
  }
}

/**
 * Middleware for handling single file upload
 */
export const uploadSingle = (fieldName: string) => {
  return upload.single(fieldName);
};

/**
 * Middleware for handling multiple file uploads
 */
export const uploadMultiple = (fieldName: string, maxCount: number = 10) => {
  return upload.array(fieldName, maxCount);
};



