import express from "express";
import * as commentController from "../controllers/commentController.js";
import { authenticate, optionalAuthenticate } from "../middleware/auth.js";

const router = express.Router({ mergeParams: true });

// Create comment (authenticated)
router.post("/", authenticate, commentController.createComment);

// Get post comments (public)
router.get("/", optionalAuthenticate, commentController.getPostComments);

// Delete comment (authenticated)
router.delete("/:commentId", authenticate, commentController.deleteComment);

export default router;
