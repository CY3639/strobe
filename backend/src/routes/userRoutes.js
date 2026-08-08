import express from "express";
import * as userController from "../controllers/userController.js";
import { authenticate, optionalAuthenticate } from "../middleware/auth.js";

const router = express.Router();

// List and view users (public)
router.get("/", optionalAuthenticate, userController.listUsers);
router.get("/:id", optionalAuthenticate, userController.getUserProfile);

// Delete own account (authenticated)
router.delete("/:id", authenticate, userController.deleteOwnAccount);

export default router;
