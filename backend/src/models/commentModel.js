import { getDatabase, saveDatabase } from "../config/database.js";

/**
 * Find a comment by ID
 * @param {string} commentId - The comment's ID
 * @returns {Object|null} Comment object or null
 */
export async function findCommentById(commentId) {
  const db = getDatabase();
  return db.data.comments.find((c) => c.id === commentId) || null;
}

/**
 * Get all comments for a post
 * @param {string} postId - The post's ID
 * @returns {Array} Array of comment objects
 */
export async function getCommentsByPostId(postId) {
  const db = getDatabase();
  return db.data.comments
    .filter((c) => c.postId === postId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Create a new comment
 * @param {Object} commentData - Comment data
 * @returns {Object} Created comment object
 */
export async function createComment(commentData) {
  const db = getDatabase();
  db.data.comments.push(commentData);
  await saveDatabase();
  return commentData;
}

/**
 * Delete a comment
 * @param {string} commentId - The comment's ID
 * @returns {boolean} True if comment was deleted, false if not found
 */
export async function deleteComment(commentId) {
  const db = getDatabase();
  const index = db.data.comments.findIndex((c) => c.id === commentId);

  if (index === -1) return false;

  db.data.comments.splice(index, 1);
  await saveDatabase();
  return true;
}

/**
 * Get comment count for a post
 * @param {string} postId - The post's ID
 * @returns {number} Number of comments
 */
export async function getCommentCountByPostId(postId) {
  const db = getDatabase();
  return db.data.comments.filter((c) => c.postId === postId).length;
}

/**
 * Delete all comments for a post (when post is deleted)
 * @param {string} postId - The post's ID
 * @returns {void}
 */
export async function deleteCommentsByPostId(postId) {
  const db = getDatabase();
  db.data.comments = db.data.comments.filter((c) => c.postId !== postId);
  await saveDatabase();
}
