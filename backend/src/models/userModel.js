import { getDatabase, saveDatabase } from "../config/database.js";

function sanitizeUser(user) {
  if (!user) return null;
  const safeUser = { ...user };
  delete safeUser.password;
  return safeUser;
}

/**
 * Find a user by ID
 * @param {string} userId - The user's ID
 * @returns {Object|null} User object or null
 */
export async function findUserById(userId) {
  const db = getDatabase();
  const user = db.data.users.find((u) => u.id === userId) || null;
  return sanitizeUser(user);
}

/**
 * Find a user by email
 * @param {string} email - The email to search for
 * @returns {Object|null} User object or null
 */
export async function findUserAuthByEmail(email) {
  const db = getDatabase();
  const needle = (email || "").trim().toLowerCase();
  return db.data.users.find((u) => (u.email || "").toLowerCase() === needle) || null;
}

/**
 * Get all users
 * @returns {Array} Array of user objects
 */
export async function getAllUsers() {
  const db = getDatabase();
  return db.data.users.map(sanitizeUser);
}

/**
 * Create a new user
 * @param {Object} userData - User data { id, username, email, password, createdAt }
 * @returns {Object} Created user object
 */
export async function createUser(userData) {
  const db = getDatabase();
  db.data.users.push(userData);
  await saveDatabase();

  // Return user without password
  return sanitizeUser(userData);
}

/**
 * Update a user
 * @param {string} userId - The user's ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated user object or null if not found
 */
export async function updateUser(userId, updates) {
  const db = getDatabase();
  const user = db.data.users.find((u) => u.id === userId);

  if (!user) return null;

  Object.assign(user, updates, { updatedAt: new Date().toISOString() });
  await saveDatabase();

  return sanitizeUser(user);
}

/**
 * Delete a user
 * @param {string} userId - The user's ID
 * @returns {boolean} True if user was deleted, false if not found
 */
export async function deleteUser(userId) {
  const db = getDatabase();
  const index = db.data.users.findIndex((u) => u.id === userId);

  if (index === -1) return false;

  db.data.users.splice(index, 1);
  await saveDatabase();
  return true;
}

/**
 * Delete a user and all related data (posts, comments, likes, follows, moments)
 * @param {string} userId - The user's ID
 * @returns {boolean} True if user was deleted, false if not found
 */
export async function deleteUserWithCascade(userId) {
  const db = getDatabase();
  const userExists = db.data.users.some((u) => u.id === userId);

  if (!userExists) return false;

  const ownedPostIds = db.data.posts
    .filter((p) => p.userId === userId)
    .map((p) => p.id);

  db.data.posts = db.data.posts.filter((p) => p.userId !== userId);
  db.data.comments = db.data.comments.filter(
    (c) => c.userId !== userId && !ownedPostIds.includes(c.postId),
  );
  db.data.likes = db.data.likes.filter(
    (l) => l.userId !== userId && !ownedPostIds.includes(l.postId),
  );
  db.data.follows = db.data.follows.filter(
    (f) => f.followerId !== userId && f.followeeId !== userId,
  );
  db.data.moments = db.data.moments.filter((m) => m.userId !== userId);
  db.data.users = db.data.users.filter((u) => u.id !== userId);

  await saveDatabase();
  return true;
}

/**
 * Check if username exists
 * @param {string} username - Username to check
 * @returns {boolean} True if username exists
 */
export async function usernameExists(username) {
  const db = getDatabase();
  return db.data.users.some((u) => u.username === username);
}

/**
 * Check if email exists
 * @param {string} email - Email to check
 * @returns {boolean} True if email exists
 */
export async function emailExists(email) {
  const db = getDatabase();
  const needle = (email || "").trim().toLowerCase();
  return db.data.users.some((u) => (u.email || "").toLowerCase() === needle);
}

/**
 * Search users by username
 * @param {string} query - Search query
 * @param {number} limit - Maximum results to return
 * @returns {Array} Array of matching users
 */
export async function searchUsers(query, limit = 10) {
  const db = getDatabase();
  const lowerQuery = query.toLowerCase();

  return db.data.users
    .filter((u) => u.username.toLowerCase().includes(lowerQuery))
    .slice(0, limit)
    .map((user) => {
      return sanitizeUser(user);
    });
}
