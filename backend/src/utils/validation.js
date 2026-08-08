import { VALIDATION, ERROR_MESSAGES } from "../config/constants.js";

/**
 * Validate username format and length
 * @param {string} username - Username to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateUsername(username) {
  if (!username || typeof username !== "string") {
    return { valid: false, error: ERROR_MESSAGES.MISSING_REQUIRED_FIELDS };
  }

  if (
    username.length < VALIDATION.USERNAME_MIN_LENGTH ||
    username.length > VALIDATION.USERNAME_MAX_LENGTH
  ) {
    return { valid: false, error: ERROR_MESSAGES.USERNAME_INVALID };
  }

  // Allow alphanumeric, underscore, and hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: ERROR_MESSAGES.USERNAME_INVALID };
  }

  return { valid: true, error: null };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateEmail(email) {
  if (!email || typeof email !== "string") {
    return { valid: false, error: ERROR_MESSAGES.INVALID_EMAIL };
  }

  if (!VALIDATION.EMAIL_PATTERN.test(email)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_EMAIL };
  }

  return { valid: true, error: null };
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { valid: false, error: ERROR_MESSAGES.PASSWORD_TOO_SHORT };
  }

  if (password.length < VALIDATION.PASSWORD_MIN_LENGTH) {
    return { valid: false, error: ERROR_MESSAGES.PASSWORD_TOO_SHORT };
  }

  return { valid: true, error: null };
}

/**
 * Validate user role
 * @param {string} role - Role to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateRole(role) {
  if (typeof role !== "string") {
    return { valid: false, error: ERROR_MESSAGES.INVALID_ROLE };
  }

  if (!["user", "moderator"].includes(role)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_ROLE };
  }

  return { valid: true, error: null };
}

/**
 * Validate post title
 * @param {string} title - Title to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validatePostTitle(title) {
  if (!title || typeof title !== "string" || title.trim() === "") {
    return { valid: false, error: "Title is required" };
  }

  if (title.length > VALIDATION.POST_TITLE_MAX_LENGTH) {
    return { valid: false, error: "Title is too long" };
  }

  return { valid: true, error: null };
}

/**
 * Validate post description
 * @param {string} description - Description to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validatePostDescription(description) {
  if (description && typeof description !== "string") {
    return { valid: false, error: "Description must be a string" };
  }

  if (
    description &&
    description.length > VALIDATION.POST_DESCRIPTION_MAX_LENGTH
  ) {
    return { valid: false, error: "Description is too long" };
  }

  return { valid: true, error: null };
}

/**
 * Validate comment text
 * @param {string} text - Comment text to validate
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateCommentText(text) {
  if (!text || typeof text !== "string" || text.trim() === "") {
    return { valid: false, error: "Comment text is required" };
  }

  if (text.length > VALIDATION.COMMENT_MAX_LENGTH) {
    return { valid: false, error: "Comment text is too long" };
  }

  return { valid: true, error: null };
}

/**
 * Validate array of image URLs
 * @param {Array} images - Array of image URLs
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateImages(images) {
  if (!Array.isArray(images)) {
    return { valid: false, error: "Images must be an array" };
  }

  if (images.length > VALIDATION.MAX_IMAGES_PER_POST) {
    return { valid: false, error: ERROR_MESSAGES.TOO_MANY_IMAGES };
  }

  // Validate each image is a string (URL or file path)
  for (const image of images) {
    if (typeof image !== "string" || image.trim() === "") {
      return { valid: false, error: "Each image must be a non-empty string" };
    }
  }

  return { valid: true, error: null };
}

/**
 * Validate required fields are present
 * @param {Object} data - Data object to check
 * @param {Array} requiredFields - Array of field names that must be present
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateRequiredFields(data, requiredFields) {
  for (const field of requiredFields) {
    if (!data[field]) {
      return {
        valid: false,
        error: `${field} is required`,
      };
    }
  }

  return { valid: true, error: null };
}
