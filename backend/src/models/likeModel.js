import { getDatabase, saveDatabase } from "../config/database.js";

/**
 * Find a like by post and user
 * @param {string} postId - The post's ID
 * @param {string} userId - The user's ID
 * @returns {Object|null} Like object or null
 */
export async function findLike(postId, userId) {
  const db = getDatabase();
  return (
    db.data.likes.find((l) => l.postId === postId && l.userId === userId) ||
    null
  );
}

/**
 * Check if a user has liked a post
 * @param {string} postId - The post's ID
 * @param {string} userId - The user's ID
 * @returns {boolean} True if user has liked the post
 */
export async function hasUserLikedPost(postId, userId) {
  const db = getDatabase();
  return db.data.likes.some((l) => l.postId === postId && l.userId === userId);
}

/**
 * Get like count for a post
 * @param {string} postId - The post's ID
 * @returns {number} Number of likes
 */
export async function getLikeCountByPostId(postId) {
  const db = getDatabase();
  return db.data.likes.filter((l) => l.postId === postId).length;
}

/**
 * Add a like
 * @param {Object} likeData - Like data { id, postId, userId, createdAt }
 * @returns {Object} Created like object
 */
export async function createLike(likeData) {
  const db = getDatabase();
  db.data.likes.push(likeData);
  await saveDatabase();
  return likeData;
}

/**
 * Remove a like
 * @param {string} postId - The post's ID
 * @param {string} userId - The user's ID
 * @returns {boolean} True if like was removed, false if not found
 */
export async function removeLike(postId, userId) {
  const db = getDatabase();
  const index = db.data.likes.findIndex(
    (l) => l.postId === postId && l.userId === userId,
  );

  if (index === -1) return false;

  db.data.likes.splice(index, 1);
  await saveDatabase();
  return true;
}

/**
 * Remove all likes for a post (when post is deleted)
 * @param {string} postId - The post's ID
 * @returns {void}
 */
export async function removeLikesByPostId(postId) {
  const db = getDatabase();
  db.data.likes = db.data.likes.filter((l) => l.postId !== postId);
  await saveDatabase();
}
