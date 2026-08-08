import * as uploadService from "../services/uploadService.js";
import {
  asyncHandler,
  validationError,
  forbiddenError,
} from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

/**
 * POST /v1/uploads/url
 * Get an upload URL for uploading a file
 */
export const getUploadUrl = asyncHandler(async (req, res) => {
  const { postId } = req.body;
  const { url, fileId } = await uploadService.getUploadUrl(req.userId, postId);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    uploadUrl: url,
    fileId,
  });
});

/**
 * PUT /v1/uploads/:fileId
 * Upload a file to an upload URL
 */
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw validationError("No file provided");
  }

  if (req.params.userId !== req.userId) {
    throw forbiddenError("You can only upload files for your own user ID");
  }

  const fileInfo = await uploadService.storeUploadedFile(
    req.params.userId,
    req.params.postId,
    req.params.fileId,
    req.file,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    file: fileInfo,
  });
});
