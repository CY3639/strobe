import * as authService from "../services/authService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

/**
 * POST /v1/auth/register
 * Register a new user
 */
export const registerUser = asyncHandler(async (req, res) => {
  const { user, token } = await authService.registerUser(req.body);

  res.status(HTTP_STATUS.CREATED).json({
    message: RESPONSE_MESSAGES.CREATED,
    user,
    token,
  });
});

/**
 * POST /v1/auth/login
 * Login a user
 */
export const loginUser = asyncHandler(async (req, res) => {
  const { user, token } = await authService.loginUser(req.body);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    user,
    token,
  });
});
