import * as commentService from "../services/commentService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

/**
 * POST /v1/posts/:postId/comments
 * Create a comment on a post
 */
export const createComment = asyncHandler(async (req, res) => {
  const comment = await commentService.createComment(
    req.params.postId,
    req.userId,
    req.body.text,
  );

  res.status(HTTP_STATUS.CREATED).json({
    message: RESPONSE_MESSAGES.CREATED,
    comment,
  });
});

/**
 * GET /v1/posts/:postId/comments
 * Get all comments on a post
 */
export const getPostComments = asyncHandler(async (req, res) => {
  const comments = await commentService.getCommentsByPost(req.params.postId);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    comments,
  });
});

/**
 * DELETE /v1/posts/:postId/comments/:commentId
 * Delete a comment
 */
export const deleteComment = asyncHandler(async (req, res) => {
  await commentService.deleteComment(req.params.commentId, req.userId);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.DELETED,
  });
});
