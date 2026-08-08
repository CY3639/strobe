import * as userModel from "../models/userModel.js";
import fs from "fs/promises";
import path from "path";
import { generateId } from "../utils/idGenerator.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { generateToken } from "../middleware/auth.js";
import {
  validationError,
  conflictError,
  notFoundError,
  forbiddenError,
  unauthorisedError,
} from "../middleware/errorHandler.js";
import {
  validateEmail,
  validatePassword,
  validateRole,
} from "../utils/validation.js";
import { ERROR_MESSAGES, ROLES } from "../config/constants.js";
import { config } from "../config/index.js";
import { enrichUsers } from "../utils/enrichment.js";

function normaliseEmail(value) {
  return (value || "").trim().toLowerCase();
}

/**
 * Register a new user
 * @param {Object} userData - { email, password, role }
 * @returns {Promise<Object>} { user, token }
 */
export async function registerUser(userData) {
  const { email, password, role } = userData;
  const normalisedEmail = normaliseEmail(email);
  // Username is always set to match email (should match Cognito behaviour)
  const username = normalisedEmail;

  // Validate inputs
  const emailValidation = validateEmail(normalisedEmail);
  if (!emailValidation.valid) {
    throw validationError(emailValidation.error);
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw validationError(passwordValidation.error);
  }

  const requestedRole = role ?? ROLES.USER;
  const roleValidation = validateRole(requestedRole);
  if (!roleValidation.valid) {
    throw validationError(roleValidation.error);
  }

  // Check if email already exists (email is the unique identifier)
  if (await userModel.emailExists(normalisedEmail)) {
    throw conflictError(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
  }

  // Create user
  const userId = generateId();
  const now = new Date().toISOString();
  const hashedPassword = await hashPassword(password);

  const user = await userModel.createUser({
    id: userId,
    username,
    email: normalisedEmail,
    password: hashedPassword,
    role: requestedRole,
    createdAt: now,
    updatedAt: now,
  });

  const token = generateToken(user);

  return {
    user,
    token,
  };
}

/**
 * Login a user
 * @param {Object} credentials - { email, password }
 * @returns {Promise<Object>} { user, token }
 */
export async function loginUser(credentials) {
  const { email, password } = credentials;
  const normalisedEmail = normaliseEmail(email);

  // Validate inputs
  if (!normalisedEmail || !password) {
    throw validationError(ERROR_MESSAGES.MISSING_REQUIRED_FIELDS);
  }

  // Find user by email
  const user = await userModel.findUserAuthByEmail(normalisedEmail);
  if (!user) {
    throw unauthorisedError(ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  // Check password
  if (!(await comparePassword(password, user.password))) {
    throw unauthorisedError(ERROR_MESSAGES.INVALID_CREDENTIALS);
  }

  const safeUser = { ...user };
  delete safeUser.password;
  const token = generateToken(safeUser);

  return {
    user: safeUser,
    token,
  };
}

/**
 * Get user profile
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User object
 */
export async function getUserProfile(userId) {
  const user = await userModel.findUserById(userId);

  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  return user;
}

/**
 * List users for discovery/search
 * @param {string} query - Optional username query
 * @param {number} limit - Maximum users to return
 * @param {string|null} currentUserId - Optional current user ID for enrichment
 * @returns {Promise<Array>} Enriched user list
 */
export async function listUsers(query = "", limit = 20, currentUserId = null) {
  const users = query
    ? await userModel.searchUsers(query, limit)
    : (await userModel.getAllUsers()).slice(0, limit);

  return enrichUsers(users, currentUserId);
}

/**
 * Delete an authenticated user's own account
 * @param {string} authenticatedUserId - User ID from auth token
 * @param {string} targetUserId - User ID in request path
 * @returns {Promise<void>}
 */
export async function deleteUserAccount(authenticatedUserId, targetUserId) {
  if (authenticatedUserId !== targetUserId) {
    throw forbiddenError(ERROR_MESSAGES.CANNOT_DELETE_USER);
  }

  const existingUser = await userModel.findUserById(targetUserId);
  if (!existingUser) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  await userModel.deleteUserWithCascade(targetUserId);

  const userUploadsDir = path.join(config.uploadsDir, targetUserId);
  await fs.rm(userUploadsDir, { recursive: true, force: true });
}
