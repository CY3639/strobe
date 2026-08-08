import * as followModel from "../models/followModel.js";
import * as postModel from "../models/postModel.js";
import * as userModel from "../models/userModel.js";
import { enrichPosts } from "../utils/enrichment.js";
import { notFoundError } from "../middleware/errorHandler.js";
import { ERROR_MESSAGES, ROLES } from "../config/constants.js";

/**
 * Get the personalised feed for a user
 *
 * @param {string} userId - Current user ID
 * @param {number} limit - Maximum posts to return
 * @param {number} offset - Pagination offset
 * @param {string} userRole - Current user role
 * @returns {Promise<Array>} Array of posts from followed users (enriched)
 */
export async function getUserFeed(
  userId,
  limit = 20,
  offset = 0,
  userRole = ROLES.USER,
) {
  // Verify user exists
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  // Get list of users being followed
  const followingUserIds = await followModel.getFollowing(userId);

  // If not following anyone, return empty feed
  if (followingUserIds.length === 0) {
    return [];
  }

  // Get posts from followed users
  const posts = await postModel.getPostsFromUsers(
    followingUserIds,
    limit,
    offset,
  );

  const visiblePosts = posts.filter((post) => {
    if (userRole === ROLES.MODERATOR || post.userId === userId) {
      return true;
    }

    return post.status !== "hidden";
  });

  // Enrich with likes/comments counts and current user's interactions
  return enrichPosts(visiblePosts, userId);
}
