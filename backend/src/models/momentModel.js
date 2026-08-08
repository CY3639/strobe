import { getDatabase, saveDatabase } from "../config/database.js";

function sortByNewestFirst(items) {
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Create a new moment
 * @param {Object} momentData - Moment data
 * @returns {Object} Created moment object
 */
export async function createMoment(momentData) {
  const db = getDatabase();
  db.data.moments.push(momentData);
  await saveDatabase();
  return momentData;
}

/**
 * Find a moment by ID
 * @param {string} momentId - The moment's ID
 * @returns {Object|null} Moment object or null
 */
export async function findMomentById(momentId) {
  const db = getDatabase();
  return db.data.moments.find((m) => m.id === momentId) || null;
}

/**
 * Update a moment
 * @param {string} momentId - The moment's ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated moment object or null if not found
 */
export async function updateMoment(momentId, updates) {
  const db = getDatabase();
  const moment = db.data.moments.find((m) => m.id === momentId);

  if (!moment) return null;

  Object.assign(moment, updates, { updatedAt: new Date().toISOString() });
  await saveDatabase();
  return moment;
}

/**
 * Delete a moment
 * @param {string} momentId - The moment's ID
 * @returns {boolean} True if moment was deleted, false if not found
 */
export async function deleteMoment(momentId) {
  const db = getDatabase();
  const index = db.data.moments.findIndex((m) => m.id === momentId);

  if (index === -1) return false;

  db.data.moments.splice(index, 1);
  await saveDatabase();
  return true;
}

/**
 * Get moments for a list of user IDs
 * @param {Array} userIds - Array of user IDs
 * @returns {Array} Array of moment objects sorted newest first
 */
export async function getMomentsByUserIds(userIds) {
  const db = getDatabase();
  const moments = db.data.moments.filter((m) => userIds.includes(m.userId));
  return sortByNewestFirst(moments);
}

/**
 * Get moments for one user
 * @param {string} userId - The user's ID
 * @returns {Array} Array of moment objects sorted newest first
 */
export async function getMomentsByUserId(userId) {
  const db = getDatabase();
  const moments = db.data.moments.filter((m) => m.userId === userId);
  return sortByNewestFirst(moments);
}
