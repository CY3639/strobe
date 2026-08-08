import { v4 as uuidv4 } from "uuid";

/**
 * Generate a UUID
 * @returns {string} UUID
 */
export function generateId() {
  return uuidv4();
}

/**
 * Generate a short ID for user-facing references
 * @returns {string} Short ID (8 characters)
 */
export function generateShortId() {
  return uuidv4().split("-")[0];
}
