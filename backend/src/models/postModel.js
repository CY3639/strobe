import { getDatabase, saveDatabase } from "../config/database.js";

/**
 * Find a post by ID
 * @param {string} postId - The post's ID
 * @returns {Object|null} Post object or null
 */
export async function findPostById(postId) {
  const db = getDatabase();
  return db.data.posts.find((p) => p.id === postId) || null;
}

/**
 * Get all posts by a user
 * @param {string} userId - The user's ID
 * @param {number} limit - Maximum results
 * @param {number} offset - Offset for pagination
 * @returns {Array} Array of post objects
 */
export async function getPostsByUserId(userId, limit = 20, offset = 0) {
  const db = getDatabase();
  return db.data.posts
    .filter((p) => p.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(offset, offset + limit);
}

/**
 * Get all posts (for feed queries)
 * @param {number} limit - Maximum results
 * @param {number} offset - Offset for pagination
 * @returns {Array} Array of post objects sorted by newest first
 */
export async function getAllPosts(limit = 20, offset = 0) {
  const db = getDatabase();
  return db.data.posts
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(offset, offset + limit);
}

/**
 * Create a new post
 * @param {Object} postData - Post data
 * @returns {Object} Created post object
 */
export async function createPost(postData) {
  const db = getDatabase();
  db.data.posts.push(postData);
  await saveDatabase();
  return postData;
}

/**
 * Update a post
 * @param {string} postId - The post's ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated post object or null if not found
 */
export async function updatePost(postId, updates) {
  const db = getDatabase();
  const post = db.data.posts.find((p) => p.id === postId);

  if (!post) return null;

  Object.assign(post, updates, { updatedAt: new Date().toISOString() });
  await saveDatabase();
  return post;
}

/**
 * Delete a post
 * @param {string} postId - The post's ID
 * @returns {boolean} True if post was deleted, false if not found
 */
export async function deletePost(postId) {
  const db = getDatabase();
  const index = db.data.posts.findIndex((p) => p.id === postId);

  if (index === -1) return false;

  db.data.posts.splice(index, 1);
  await saveDatabase();
  return true;
}

/**
 * Get posts from a list of user IDs (for feed)
 * @param {Array} userIds - Array of user IDs
 * @param {number} limit - Maximum results
 * @param {number} offset - Offset for pagination
 * @returns {Array} Array of post objects
 */
export async function getPostsFromUsers(userIds, limit = 20, offset = 0) {
  const db = getDatabase();
  return db.data.posts
    .filter((p) => userIds.includes(p.userId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(offset, offset + limit);
}

/**
 * Get post count for a user
 * @param {string} userId - The user's ID
 * @returns {number} Number of posts
 */
export async function getPostCountByUserId(userId) {
  const db = getDatabase();
  return db.data.posts.filter((p) => p.userId === userId).length;
}
