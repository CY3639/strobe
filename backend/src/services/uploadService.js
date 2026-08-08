import path from "path";
import fs from "fs/promises";
import { config, toPublicUrl } from "../config/index.js";
import { generateShortId } from "../utils/idGenerator.js";
import { validationError } from "../middleware/errorHandler.js";

// Allowed file types
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate file before upload
 * @param {Object} file - File object { mimetype, size, buffer }
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return {
      valid: false,
      error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP",
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Get file extension from mimetype
 * @param {string} mimetype - MIME type (e.g., 'image/jpeg')
 * @returns {string} File extension (e.g., 'jpg')
 */
function getFileExtension(mimetype) {
  const typeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return typeMap[mimetype] || "jpg";
}

/**
 * Generate an upload URL
 *
 * @param {string} userId - User ID (for organisation)
 * @param {string} postId - Post ID (for organisation)
 * @returns {Promise<Object>} { url, fileId }
 */
export async function getUploadUrl(userId, postId) {
  if (!postId) {
    throw validationError("postId is required to generate an upload URL");
  }

  const fileId = generateShortId();
  const uploadUrl = `/v1/uploads/${userId}/${postId}/${fileId}`;

  return {
    url: toPublicUrl(uploadUrl),
    fileId,
  };
}

/**
 * Store uploaded file locally
 * Called when file is PUT to the URL from getUploadUrl
 *
 * @param {string} userId - User ID
 * @param {string} postId - Post ID
 * @param {string} fileId - File ID from upload URL
 * @param {Object} file - File object { mimetype, size, buffer }
 * @returns {Promise<Object>} { fileId, url, size, mimetype }
 */
export async function storeUploadedFile(userId, postId, fileId, file) {
  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    throw validationError(validation.error);
  }

  // Ensure uploads directory exists
  await fs.mkdir(config.uploadsDir, { recursive: true });

  // Create file path
  const extension = getFileExtension(file.mimetype);
  const filename = `${fileId}.${extension}`;
  const relativeDir = path.join(userId, postId);
  const fullDir = path.join(config.uploadsDir, relativeDir);
  await fs.mkdir(fullDir, { recursive: true });
  const filepath = path.join(fullDir, filename);

  // Save file
  await fs.writeFile(filepath, file.buffer);

  // Return file info
  return {
    fileId,
    url: toPublicUrl(`/uploads/${userId}/${postId}/${filename}`),
    size: file.size,
    mimetype: file.mimetype,
  };
}

/**
 * Delete uploaded file
 * @param {string} fileId - File ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteUploadedFile(fileId) {
  try {
    const uploadsPath = config.uploadsDir;
    const userDirs = await fs.readdir(uploadsPath);

    for (const userDir of userDirs) {
      const userPath = path.join(uploadsPath, userDir);
      const postDirs = await fs.readdir(userPath);

      for (const postDir of postDirs) {
        const postPath = path.join(userPath, postDir);
        const files = await fs.readdir(postPath);

        for (const file of files) {
          if (file.startsWith(fileId)) {
            await fs.unlink(path.join(postPath, file));
            return true;
          }
        }
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Get file URL (for serving uploaded files)
 * @param {string} fileId - File ID
 * @returns {string} URL to access the file
 */
export function getFileUrl(fileId) {
  return `/uploads/${fileId}`;
}
