import express from "express";
import * as momentController from "../controllers/momentController.js";
import { authenticate, requireModerator } from "../middleware/auth.js";

const router = express.Router();

// Create and read moments (authenticated)
router.post("/", authenticate, momentController.createMoment);
router.get("/feed", authenticate, momentController.getMomentFeed);
router.get("/archive", authenticate, momentController.getMomentArchive);

// Moderate and delete moments (authenticated)
router.post(
  "/:id/hide",
  authenticate,
  requireModerator,
  momentController.hideMoment,
);
router.delete("/:id", authenticate, momentController.deleteMoment);

export default router;
