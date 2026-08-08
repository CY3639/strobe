import * as postModel from "../models/postModel.js";
import * as likeModel from "../models/likeModel.js";
import * as commentModel from "../models/commentModel.js";
import * as userModel from "../models/userModel.js";
import { generateId } from "../utils/idGenerator.js";
import { enrichPost, enrichPosts } from "../utils/enrichment.js";
import {
  validationError,
  notFoundError,
  forbiddenError,
  conflictError,
} from "../middleware/errorHandler.js";
import {
  validatePostTitle,
  validatePostDescription,
  validateImages,
} from "../utils/validation.js";
import { ERROR_MESSAGES, ROLES } from "../config/constants.js";

function canViewerSeePost(post, viewerId, viewerRole) {
  if (!post) return false;

  if (viewerRole === ROLES.MODERATOR || viewerId === post.userId) {
    return true;
  }

  return post.status !== "hidden";
}

/**
 * Create a new post
 * @param {string} userId - Author's user ID
 * @param {Object} postData - { title, description, images }
 * @returns {Promise<Object>} Created post object (enriched)
 */
export async function createPost(userId, postData) {
  const {
    title,
    description = "",
    images = [],
    id: requestedPostId = null,
  } = postData;

  // Validate inputs
  const titleValidation = validatePostTitle(title);
  if (!titleValidation.valid) {
    throw validationError(titleValidation.error);
  }

  const descriptionValidation = validatePostDescription(description);
  if (!descriptionValidation.valid) {
    throw validationError(descriptionValidation.error);
  }

  const imagesValidation = validateImages(images);
  if (!imagesValidation.valid) {
    throw validationError(imagesValidation.error);
  }

  const now = new Date().toISOString();
  const postId = requestedPostId || generateId();
  const post = await postModel.createPost({
    id: postId,
    userId,
    title,
    description,
    images,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  return enrichPost(post, userId);
}

/**
 * Get a single post
 * @param {string} postId - Post ID
 * @param {string} currentUserId - Current user ID (optional, for enrichment)
 * @returns {Promise<Object>} Post object (enriched)
 */
export async function getPost(
  postId,
  currentUserId = null,
  currentUserRole = ROLES.USER,
) {
  const post = await postModel.findPostById(postId);

  if (!post) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_FOUND);
  }

  const canView = canViewerSeePost(post, currentUserId, currentUserRole);
  if (!canView) {
    throw forbiddenError("You do not have permission to view this post");
  }

  return enrichPost(post, currentUserId);
}

/**
 * Get posts by a user
 * @param {string} userId - User ID
 * @param {number} limit - Maximum results
 * @param {number} offset - Offset for pagination
 * @param {string} currentUserId - Current user ID (optional)
 * @returns {Promise<Array>} Array of posts (enriched)
 */
export async function getPostsByUser(
  userId,
  limit = 20,
  offset = 0,
  currentUserId = null,
  currentUserRole = ROLES.USER,
) {
  // Verify user exists
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  const posts = await postModel.getPostsByUserId(
    userId,
    Math.max(limit * 3, 20),
    offset,
  );
  const visiblePosts = [];

  for (const post of posts) {
    if (canViewerSeePost(post, currentUserId, currentUserRole)) {
      visiblePosts.push(post);
      if (visiblePosts.length >= limit) break;
    }
  }

  return enrichPosts(visiblePosts, currentUserId);
}

/**
 * Update a post
 * @param {string} postId - Post ID
 * @param {string} userId - User ID (must be post author)
 * @param {Object} updates - { title, description, images, status }
 * @returns {Promise<Object>} Updated post (enriched)
 */
export async function updatePost(postId, userId, updates) {
  const post = await postModel.findPostById(postId);

  if (!post) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_FOUND);
  }

  if (post.userId !== userId) {
    throw forbiddenError(ERROR_MESSAGES.CANNOT_MODIFY_POST);
  }

  // Validate provided fields
  if (updates.title) {
    const titleValidation = validatePostTitle(updates.title);
    if (!titleValidation.valid) {
      throw validationError(titleValidation.error);
    }
  }

  if (updates.description !== undefined) {
    const descriptionValidation = validatePostDescription(updates.description);
    if (!descriptionValidation.valid) {
      throw validationError(descriptionValidation.error);
    }
  }

  if (updates.images) {
    const imagesValidation = validateImages(updates.images);
    if (!imagesValidation.valid) {
      throw validationError(imagesValidation.error);
    }
  }

  const safeUpdates = { ...updates };
  delete safeUpdates.status;
  const updated = await postModel.updatePost(postId, safeUpdates);
  return enrichPost(updated, userId);
}

/**
 * Delete a post
 * @param {string} postId - Post ID
 * @param {string} userId - User ID (must be post author)
 * @returns {Promise<boolean>} True if deleted
 */
export async function deletePost(postId, userId) {
  const post = await postModel.findPostById(postId);

  if (!post) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_FOUND);
  }

  if (post.userId !== userId) {
    throw forbiddenError(ERROR_MESSAGES.CANNOT_DELETE_POST);
  }

  // Clean up related data
  await likeModel.removeLikesByPostId(postId);
  await commentModel.deleteCommentsByPostId(postId);

  return postModel.deletePost(postId);
}

/**
 * Like a post
 * @param {string} postId - Post ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Like object
 */
export async function likePost(postId, userId) {
  const post = await postModel.findPostById(postId);
  if (!post) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_FOUND);
  }

  const alreadyLiked = await likeModel.hasUserLikedPost(postId, userId);
  if (alreadyLiked) {
    throw conflictError(ERROR_MESSAGES.POST_ALREADY_LIKED);
  }

  const like = await likeModel.createLike({
    id: generateId(),
    postId,
    userId,
    createdAt: new Date().toISOString(),
  });

  return like;
}

/**
 * Unlike a post
 * @param {string} postId - Post ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if unliked
 */
export async function unlikePost(postId, userId) {
  const post = await postModel.findPostById(postId);
  if (!post) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_FOUND);
  }

  const removed = await likeModel.removeLike(postId, userId);
  if (!removed) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_LIKED);
  }

  return true;
}

/**
 * Get posts with their stats
 * @param {Array} postIds - Array of post IDs
 * @param {string} currentUserId - Current user ID (optional)
 * @returns {Promise<Array>} Array of posts (enriched)
 */
export async function getPostsWithStats(postIds, currentUserId = null) {
  const posts = await Promise.all(
    postIds.map((id) => postModel.findPostById(id)),
  );

  return enrichPosts(
    posts.filter((p) => p !== null),
    currentUserId,
  );
}

export async function hidePost(postId, moderatorId, moderatorRole) {
  if (moderatorRole !== ROLES.MODERATOR) {
    throw forbiddenError("Only moderators can hide posts");
  }

  const post = await postModel.findPostById(postId);
  if (!post) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_FOUND);
  }

  return postModel.updatePost(postId, {
    status: "hidden",
    hiddenBy: moderatorId,
    hiddenAt: new Date().toISOString(),
  });
}
