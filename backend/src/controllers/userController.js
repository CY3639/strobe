import * as authService from "../services/authService.js";
import { enrichUser } from "../utils/enrichment.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

/**
 * GET /v1/users/:id
 * Get a public user profile
 */
export const getUserProfile = asyncHandler(async (req, res) => {
  const user = await authService.getUserProfile(req.params.id);
  const enriched = await enrichUser(user, req.userId ?? null);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    user: enriched,
  });
});

/**
 * GET /v1/users
 * List users for discovery or search
 */
export const listUsers = asyncHandler(async (req, res) => {
  const query = req.query.q ?? "";
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 100);
  const users = await authService.listUsers(query, limit, req.userId ?? null);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    users,
  });
});

/**
 * DELETE /v1/users/:id
 * Delete the authenticated user's own account
 */
export const deleteOwnAccount = asyncHandler(async (req, res) => {
  await authService.deleteUserAccount(req.userId, req.params.id);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.DELETED,
  });
});
