import express from "express";
import * as postController from "../controllers/postController.js";
import {
  authenticate,
  optionalAuthenticate,
  requireModerator,
} from "../middleware/auth.js";

const router = express.Router();

// Create post (authenticated)
router.post("/", authenticate, postController.createPost);

// Get user's posts (public)
router.get("/user/:userId", optionalAuthenticate, postController.getUserPosts);

// Get single post (public)
router.get("/:id", optionalAuthenticate, postController.getPost);

// Update post (authenticated)
router.put("/:id", authenticate, postController.updatePost);

// Delete post (authenticated)
router.delete("/:id", authenticate, postController.deletePost);

// Like and unlike post (authenticated)
router.post("/:id/like", authenticate, postController.likePost);
router.delete("/:id/like", authenticate, postController.unlikePost);

// Hide post (moderator only)
router.post(
  "/:id/hide",
  authenticate,
  requireModerator,
  postController.hidePost,
);

export default router;
