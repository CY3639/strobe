import {
  MOMENT_DURATION_HOURS,
  ERROR_MESSAGES,
  ROLES,
} from "../config/constants.js";
import * as momentModel from "../models/momentModel.js";
import * as followModel from "../models/followModel.js";
import * as userModel from "../models/userModel.js";
import { generateId } from "../utils/idGenerator.js";
import {
  validationError,
  notFoundError,
  forbiddenError,
} from "../middleware/errorHandler.js";

function getExpiryDate(createdAtIso) {
  const createdAtMs = new Date(createdAtIso).getTime();
  return new Date(
    createdAtMs + MOMENT_DURATION_HOURS * 60 * 60 * 1000,
  ).toISOString();
}

async function ensureMomentLifecycle(moment) {
  const now = Date.now();
  const expiresAt = new Date(moment.expiresAt).getTime();

  if (moment.status === "active" && expiresAt <= now) {
    return momentModel.updateMoment(moment.id, {
      status: "archived",
      archivedAt: new Date().toISOString(),
    });
  }

  return moment;
}

async function canViewerSeeMoment(moment, viewerId, viewerRole) {
  if (!viewerId) {
    return false;
  }

  if (moment.userId === viewerId || viewerRole === ROLES.MODERATOR) {
    return true;
  }

  if (moment.status === "hidden") {
    return false;
  }

  return followModel.isFollowing(viewerId, moment.userId);
}

/**
 * Create a moment
 * @param {string} userId - Author's user ID
 * @param {Object} payload - { imageUrl, caption }
 * @returns {Promise<Object>} Created moment
 */
export async function createMoment(userId, payload) {
  const { imageUrl, caption = "" } = payload;

  if (!imageUrl || typeof imageUrl !== "string") {
    throw validationError("imageUrl is required");
  }

  if (caption.length > 500) {
    throw validationError("caption must be 500 characters or less");
  }

  const now = new Date().toISOString();
  const moment = await momentModel.createMoment({
    id: generateId(),
    userId,
    imageUrl,
    caption,
    status: "active",
    createdAt: now,
    expiresAt: getExpiryDate(now),
    updatedAt: now,
  });

  return moment;
}

/**
 * Get active moments visible to a user
 * @param {string} userId - Current user ID
 * @param {string} viewerRole - Current user role
 * @returns {Promise<Array>} Array of active moments
 */
export async function getMomentFeed(userId, viewerRole = ROLES.USER) {
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  const followingIds = await followModel.getFollowing(userId);
  const sourceUserIds = [...new Set([...followingIds, userId])];
  const moments = await momentModel.getMomentsByUserIds(sourceUserIds);

  const visibleMoments = [];
  for (const moment of moments) {
    const updated = await ensureMomentLifecycle(moment);
    if (updated.status !== "active") {
      continue;
    }
    if (await canViewerSeeMoment(updated, userId, viewerRole)) {
      visibleMoments.push(updated);
    }
  }

  return visibleMoments;
}

/**
 * Get archived moments visible to a user
 * @param {string} userId - Current user ID
 * @param {string} viewerRole - Current user role
 * @returns {Promise<Array>} Array of archived moments
 */
export async function getMomentArchive(userId, viewerRole = ROLES.USER) {
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  const followingIds = await followModel.getFollowing(userId);
  const sourceUserIds = [...new Set([...followingIds, userId])];
  const moments = await momentModel.getMomentsByUserIds(sourceUserIds);

  const visibleMoments = [];
  for (const moment of moments) {
    const updated = await ensureMomentLifecycle(moment);
    if (updated.status !== "archived") {
      continue;
    }
    if (await canViewerSeeMoment(updated, userId, viewerRole)) {
      visibleMoments.push(updated);
    }
  }

  return visibleMoments;
}

/**
 * Hide a moment (moderator only)
 * @param {string} momentId - Moment ID
 * @param {string} moderatorId - Moderator user ID
 * @param {string} moderatorRole - Moderator role from token
 * @returns {Promise<Object>} Updated moment
 */
export async function hideMoment(momentId, moderatorId, moderatorRole) {
  if (moderatorRole !== ROLES.MODERATOR) {
    throw forbiddenError("Only moderators can hide moments");
  }

  const moment = await momentModel.findMomentById(momentId);
  if (!moment) {
    throw notFoundError("Moment not found");
  }

  return momentModel.updateMoment(momentId, {
    status: "hidden",
    hiddenBy: moderatorId,
    hiddenAt: new Date().toISOString(),
  });
}

/**
 * Delete a moment (owner or moderator)
 * @param {string} momentId - Moment ID
 * @param {string} requesterId - Requesting user ID
 * @param {string} requesterRole - Requesting user role
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteMoment(momentId, requesterId, requesterRole) {
  const moment = await momentModel.findMomentById(momentId);
  if (!moment) {
    throw notFoundError("Moment not found");
  }

  if (requesterRole !== ROLES.MODERATOR && moment.userId !== requesterId) {
    throw forbiddenError("You do not have permission to delete this moment");
  }

  return momentModel.deleteMoment(momentId);
}
