import * as feedService from "../services/feedService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

/**
 * GET /v1/feed
 * Get personalized feed for current user
 */
export const getPersonalFeed = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const posts = await feedService.getUserFeed(
    req.userId,
    limit,
    offset,
    req.userRole,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    posts,
  });
});
