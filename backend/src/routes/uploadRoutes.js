import express from "express";
import * as uploadController from "../controllers/uploadController.js";
import { authenticate } from "../middleware/auth.js";
import { singleImageUpload } from "../middleware/upload.js";

const router = express.Router();

// Get upload URL (authenticated)
router.post("/url", authenticate, uploadController.getUploadUrl);

// Upload file (authenticated)
router.put(
  "/:userId/:postId/:fileId",
  authenticate,
  singleImageUpload,
  uploadController.uploadFile,
);

export default router;
