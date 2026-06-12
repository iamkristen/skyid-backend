# Azure Blob Storage Migration Guide

This document explains how to replace the simulated storage service with Azure Blob Storage.

## Current Implementation

The current `StorageService` in `src/utils/storage.service.ts` simulates file storage by:
- Storing files locally in the `uploads/` directory
- Serving files via Express static middleware
- Returning URLs like `http://localhost:8000/uploads/posts/filename.jpg`

## Migration Steps

### 1. Install Azure Blob Storage SDK

```bash
npm install @azure/storage-blob
```

### 2. Set Environment Variables

Add to your `.env` file:
```
AZURE_STORAGE_CONNECTION_STRING=your_connection_string
AZURE_STORAGE_CONTAINER_NAME=skyid-uploads
AZURE_STORAGE_ACCOUNT_NAME=your_account_name
AZURE_STORAGE_ACCOUNT_KEY=your_account_key
```

### 3. Update `storage.service.ts`

Replace the `StorageService` class with Azure Blob Storage implementation:

```typescript
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import path from "path";
import fs from "fs";

export class StorageService {
  private static blobServiceClient: BlobServiceClient;
  private static containerClient: ContainerClient;

  static async initialize() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
    }

    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "skyid-uploads";
    this.containerClient = this.blobServiceClient.getContainerClient(containerName);

    // Create container if it doesn't exist
    await this.containerClient.createIfNotExists({
      access: "blob", // Public access
    });
  }

  static async uploadFile(
    filePath: string,
    folder: "posts" | "stories" | "profiles" = "posts"
  ): Promise<string> {
    try {
      const fileName = path.basename(filePath);
      const blobName = `${folder}/${fileName}`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      // Upload file
      await blockBlobClient.uploadFile(filePath);

      // Get the public URL
      const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
      const publicUrl = `https://${accountName}.blob.core.windows.net/${this.containerClient.containerName}/${blobName}`;

      // Delete local file after upload
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      console.log(`📁 [AZURE] File uploaded: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      console.error("Error uploading file to Azure:", error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  static async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Extract blob name from URL
      const urlParts = fileUrl.split("/");
      const blobName = urlParts.slice(-2).join("/"); // folder/filename

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();

      console.log(`🗑️ [AZURE] File deleted: ${blobName}`);
    } catch (error: any) {
      console.error("Error deleting file from Azure:", error);
    }
  }

  static getFileUrl(fileName: string, folder: "posts" | "stories" | "profiles" = "posts"): string {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "skyid-uploads";
    return `https://${accountName}.blob.core.windows.net/${containerName}/${folder}/${fileName}`;
  }
}
```

### 4. Initialize in `app.ts`

Add initialization in `app.ts`:

```typescript
import { StorageService } from "./src/utils/storage.service";

// Initialize Azure Storage
StorageService.initialize().catch((error) => {
  console.error("Failed to initialize Azure Storage:", error);
});
```

### 5. Remove Static File Serving

Remove this line from `app.ts`:
```typescript
app.use("/uploads", express.static("uploads"));
```

### 6. Update `.gitignore`

The `uploads/` directory can be removed from git tracking once Azure is set up.

## Testing

After migration, test the upload endpoints:
- `POST /api/v1/community/upload/post-media`
- `POST /api/v1/community/upload/story-media`
- `POST /api/v1/community/upload/profile-picture`

Files should now be accessible via Azure Blob Storage URLs instead of local URLs.



