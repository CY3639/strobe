import express from "express";
import * as feedController from "../controllers/feedController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Get personalised feed
router.get("/", authenticate, feedController.getPersonalFeed);

export default router;
