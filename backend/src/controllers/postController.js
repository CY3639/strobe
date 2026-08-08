import * as postService from "../services/postService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

/**
 * POST /v1/posts
 * Create a new post
 */
export const createPost = asyncHandler(async (req, res) => {
  const post = await postService.createPost(req.userId, req.body);

  res.status(HTTP_STATUS.CREATED).json({
    message: RESPONSE_MESSAGES.CREATED,
    post,
  });
});

/**
 * GET /v1/posts/:id
 * Get a single post
 */
export const getPost = asyncHandler(async (req, res) => {
  const post = await postService.getPost(
    req.params.id,
    req.userId,
    req.userRole,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    post,
  });
});

/**
 * GET /v1/users/:userId/posts
 * Get posts by a user
 */
export const getUserPosts = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const posts = await postService.getPostsByUser(
    req.params.userId,
    limit,
    offset,
    req.userId,
    req.userRole,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    posts,
  });
});

/**
 * PUT /v1/posts/:id
 * Update a post
 */
export const updatePost = asyncHandler(async (req, res) => {
  const post = await postService.updatePost(
    req.params.id,
    req.userId,
    req.body,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.UPDATED,
    post,
  });
});

/**
 * DELETE /v1/posts/:id
 * Delete a post
 */
export const deletePost = asyncHandler(async (req, res) => {
  await postService.deletePost(req.params.id, req.userId);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.DELETED,
  });
});

/**
 * POST /v1/posts/:id/like
 * Like a post
 */
export const likePost = asyncHandler(async (req, res) => {
  const like = await postService.likePost(req.params.id, req.userId);

  res.status(HTTP_STATUS.CREATED).json({
    message: "Post liked",
    like,
  });
});

/**
 * DELETE /v1/posts/:id/like
 * Unlike a post
 */
export const unlikePost = asyncHandler(async (req, res) => {
  await postService.unlikePost(req.params.id, req.userId);

  res.status(HTTP_STATUS.OK).json({
    message: "Post unliked",
  });
});

/**
 * POST /v1/posts/:id/hide
 * Hide a post (moderator only)
 */
export const hidePost = asyncHandler(async (req, res) => {
  const post = await postService.hidePost(
    req.params.id,
    req.userId,
    req.userRole,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.UPDATED,
    post,
  });
});
