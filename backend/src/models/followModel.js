import { getDatabase, saveDatabase } from "../config/database.js";

/**
 * Find a follow relationship
 * @param {string} followerId - The user doing the following
 * @param {string} followeeId - The user being followed
 * @returns {Object|null} Follow object or null
 */
export async function findFollow(followerId, followeeId) {
  const db = getDatabase();
  return (
    db.data.follows.find(
      (f) => f.followerId === followerId && f.followeeId === followeeId,
    ) || null
  );
}

/**
 * Check if a user is following another user
 * @param {string} followerId - The user doing the following
 * @param {string} followeeId - The user being followed
 * @returns {boolean} True if follower is following followee
 */
export async function isFollowing(followerId, followeeId) {
  const db = getDatabase();
  return db.data.follows.some(
    (f) => f.followerId === followerId && f.followeeId === followeeId,
  );
}

/**
 * Get all users that a user is following
 * @param {string} userId - The user's ID
 * @returns {Array} Array of followee IDs
 */
export async function getFollowing(userId) {
  const db = getDatabase();
  return db.data.follows
    .filter((f) => f.followerId === userId)
    .map((f) => f.followeeId);
}

/**
 * Get all users following a user
 * @param {string} userId - The user's ID
 * @returns {Array} Array of follower IDs
 */
export async function getFollowers(userId) {
  const db = getDatabase();
  return db.data.follows
    .filter((f) => f.followeeId === userId)
    .map((f) => f.followerId);
}

/**
 * Get following count for a user
 * @param {string} userId - The user's ID
 * @returns {number} Number of users being followed
 */
export async function getFollowingCount(userId) {
  const db = getDatabase();
  return db.data.follows.filter((f) => f.followerId === userId).length;
}

/**
 * Get follower count for a user
 * @param {string} userId - The user's ID
 * @returns {number} Number of followers
 */
export async function getFollowerCount(userId) {
  const db = getDatabase();
  return db.data.follows.filter((f) => f.followeeId === userId).length;
}

/**
 * Add a follow relationship
 * @param {Object} followData - Follow data { id, followerId, followeeId, createdAt }
 * @returns {Object} Created follow object
 */
export async function createFollow(followData) {
  const db = getDatabase();
  db.data.follows.push(followData);
  await saveDatabase();
  return followData;
}

/**
 * Remove a follow relationship
 * @param {string} followerId - The user doing the following
 * @param {string} followeeId - The user being followed
 * @returns {boolean} True if follow was removed, false if not found
 */
export async function removeFollow(followerId, followeeId) {
  const db = getDatabase();
  const index = db.data.follows.findIndex(
    (f) => f.followerId === followerId && f.followeeId === followeeId,
  );

  if (index === -1) return false;

  db.data.follows.splice(index, 1);
  await saveDatabase();
  return true;
}
