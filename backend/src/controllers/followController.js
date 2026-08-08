import * as followService from "../services/followService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

/**
 * POST /v1/users/:userId/follow
 * Follow a user
 */
export const followUser = asyncHandler(async (req, res) => {
  const follow = await followService.followUser(req.userId, req.params.userId);

  res.status(HTTP_STATUS.CREATED).json({
    message: "User followed",
    follow,
  });
});

/**
 * DELETE /v1/users/:userId/follow
 * Unfollow a user
 */
export const unfollowUser = asyncHandler(async (req, res) => {
  await followService.unfollowUser(req.userId, req.params.userId);

  res.status(HTTP_STATUS.OK).json({
    message: "User unfollowed",
  });
});

/**
 * GET /v1/users/:userId/followers
 * Get followers of a user
 */
export const getFollowers = asyncHandler(async (req, res) => {
  const followers = await followService.getFollowers(
    req.params.userId,
    req.userId,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    followers,
  });
});

/**
 * GET /v1/users/:userId/following
 * Get users that a user is following
 */
export const getFollowing = asyncHandler(async (req, res) => {
  const following = await followService.getFollowing(
    req.params.userId,
    req.userId,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    following,
  });
});
