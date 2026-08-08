import * as followModel from "../models/followModel.js";
import * as userModel from "../models/userModel.js";
import { generateId } from "../utils/idGenerator.js";
import {
  forbiddenError,
  notFoundError,
  conflictError,
} from "../middleware/errorHandler.js";
import { enrichUsers } from "../utils/enrichment.js";
import { ERROR_MESSAGES } from "../config/constants.js";

/**
 * Follow a user
 * @param {string} followerId - User ID doing the following
 * @param {string} followeeId - User ID to be followed
 * @returns {Promise<Object>} Follow relationship object
 */
export async function followUser(followerId, followeeId) {
  if (followerId === followeeId) {
    throw forbiddenError(ERROR_MESSAGES.CANNOT_FOLLOW_YOURSELF);
  }

  const follower = await userModel.findUserById(followerId);
  if (!follower) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  const followee = await userModel.findUserById(followeeId);
  if (!followee) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  const alreadyFollowing = await followModel.isFollowing(
    followerId,
    followeeId,
  );
  if (alreadyFollowing) {
    throw conflictError(ERROR_MESSAGES.ALREADY_FOLLOWING);
  }

  const follow = await followModel.createFollow({
    id: generateId(),
    followerId,
    followeeId,
    createdAt: new Date().toISOString(),
  });

  return follow;
}

/**
 * Unfollow a user
 * @param {string} followerId - User ID doing the unfollowing
 * @param {string} followeeId - User ID to unfollow
 * @returns {Promise<boolean>} True if unfollowed
 */
export async function unfollowUser(followerId, followeeId) {
  const followee = await userModel.findUserById(followeeId);
  if (!followee) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  const removed = await followModel.removeFollow(followerId, followeeId);
  if (!removed) {
    throw notFoundError(ERROR_MESSAGES.NOT_FOLLOWING);
  }

  return true;
}

/**
 * Get followers of a user with enriched data
 * @param {string} userId - User ID
 * @param {string} currentUserId - Current user ID (optional, for enrichment)
 * @returns {Promise<Array>} Array of follower user objects (enriched)
 */
export async function getFollowers(userId, currentUserId = null) {
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  const followerIds = await followModel.getFollowers(userId);
  const followers = await Promise.all(
    followerIds.map((id) => userModel.findUserById(id)),
  );

  return enrichUsers(followers, currentUserId);
}

/**
 * Get users that a user is following with enriched data
 * @param {string} userId - User ID
 * @param {string} currentUserId - Current user ID (optional, for enrichment)
 * @returns {Promise<Array>} Array of followee user objects (enriched)
 */
export async function getFollowing(userId, currentUserId = null) {
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  const followingIds = await followModel.getFollowing(userId);
  const following = await Promise.all(
    followingIds.map((id) => userModel.findUserById(id)),
  );

  return enrichUsers(following, currentUserId);
}

/**
 * Check if one user is following another
 * @param {string} followerId - Follower user ID
 * @param {string} followeeId - Followee user ID
 * @returns {Promise<boolean>} True if follower is following followee
 */
export async function isFollowing(followerId, followeeId) {
  return followModel.isFollowing(followerId, followeeId);
}
