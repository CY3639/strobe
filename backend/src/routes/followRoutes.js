import express from "express";
import * as followController from "../controllers/followController.js";
import { authenticate, optionalAuthenticate } from "../middleware/auth.js";

const router = express.Router({ mergeParams: true });

// Follow and unfollow (authenticated)
router.post("/follow", authenticate, followController.followUser);
router.delete("/follow", authenticate, followController.unfollowUser);

// Get followers and following (public)
router.get("/followers", optionalAuthenticate, followController.getFollowers);
router.get("/following", optionalAuthenticate, followController.getFollowing);

export default router;
