import * as commentModel from "../models/commentModel.js";
import * as postModel from "../models/postModel.js";
import * as userModel from "../models/userModel.js";
import { generateId } from "../utils/idGenerator.js";
import {
  validationError,
  notFoundError,
  forbiddenError,
} from "../middleware/errorHandler.js";
import { validateCommentText } from "../utils/validation.js";
import { ERROR_MESSAGES } from "../config/constants.js";

/**
 * Create a comment on a post
 * @param {string} postId - Post ID
 * @param {string} userId - Author's user ID
 * @param {string} text - Comment text
 * @returns {Promise<Object>} Created comment with author info
 */
export async function createComment(postId, userId, text) {
  // Validate post exists
  const post = await postModel.findPostById(postId);
  if (!post) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_FOUND);
  }

  // Validate user exists
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw notFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
  }

  // Validate comment text
  const textValidation = validateCommentText(text);
  if (!textValidation.valid) {
    throw validationError(textValidation.error);
  }

  const now = new Date().toISOString();
  const comment = await commentModel.createComment({
    id: generateId(),
    postId,
    userId,
    text,
    createdAt: now,
    updatedAt: now,
  });

  return {
    ...comment,
    author: {
      id: user.id,
      username: user.username,
    },
  };
}

/**
 * Get all comments for a post
 * @param {string} postId - Post ID
 * @returns {Promise<Array>} Array of comments with author info
 */
export async function getCommentsByPost(postId) {
  // Verify post exists
  const post = await postModel.findPostById(postId);
  if (!post) {
    throw notFoundError(ERROR_MESSAGES.POST_NOT_FOUND);
  }

  const comments = await commentModel.getCommentsByPostId(postId);

  // Enrich with author information
  return Promise.all(
    comments.map(async (comment) => {
      const author = await userModel.findUserById(comment.userId);
      return {
        ...comment,
        author: {
          id: author.id,
          username: author.username,
        },
      };
    }),
  );
}

/**
 * Delete a comment
 * @param {string} commentId - Comment ID
 * @param {string} userId - User ID (must be comment author)
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteComment(commentId, userId) {
  const comment = await commentModel.findCommentById(commentId);

  if (!comment) {
    throw notFoundError(ERROR_MESSAGES.COMMENT_NOT_FOUND);
  }

  if (comment.userId !== userId) {
    throw forbiddenError(ERROR_MESSAGES.CANNOT_DELETE_COMMENT);
  }

  return commentModel.deleteComment(commentId);
}
