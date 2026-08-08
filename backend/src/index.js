import express from "express";
import cors from "cors";
import { config } from "./config/index.js";
import { initialiseDatabase } from "./config/database.js";
import { errorHandler } from "./middleware/errorHandler.js";

import authRoutes from "./routes/authRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import feedRoutes from "./routes/feedRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import followRoutes from "./routes/followRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import momentRoutes from "./routes/momentRoutes.js";
import userRoutes from "./routes/userRoutes.js";

const app = express();

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve uploaded files
app.use("/uploads", express.static(config.uploadsDir));

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/v1/auth", authRoutes);
app.use("/v1/posts", postRoutes);
app.use("/v1/feed", feedRoutes);
app.use("/v1/users", userRoutes);
app.use("/v1/posts/:postId/comments", commentRoutes);
app.use("/v1/users/:userId", followRoutes);
app.use("/v1/uploads", uploadRoutes);
app.use("/v1/moments", momentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "NotFound",
    message: "Endpoint not found",
  });
});

// Error handler (must be last)
app.use(errorHandler);

async function start() {
  try {
    await initialiseDatabase();
    app.listen(config.port, config.host, () => {
      const displayHost = config.host === "0.0.0.0" ? "localhost" : config.host;
      console.log(`Server is now running at http://${displayHost}:${config.port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

// Start the server
start();

export default app;
