import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { HTTP_STATUS, ERROR_MESSAGES, ERROR_TYPES, ROLES } from '../config/constants.js';

/**
 * Middleware to verify JWT token
 * Attaches user ID to request if token is valid
 */
export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORISED).json({
        error: ERROR_TYPES.UNAUTHORISED,
        message: ERROR_MESSAGES.UNAUTHORISED,
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    const decoded = jwt.verify(token, config.jwtSecret);

    req.userId = decoded.sub;
    req.userRole = decoded.role || ROLES.USER;
    req.username = decoded.username;

    next();
  } catch (error) {
    return res.status(HTTP_STATUS.UNAUTHORISED).json({
      error: ERROR_TYPES.UNAUTHORISED,
      message: ERROR_MESSAGES.INVALID_TOKEN,
    });
  }
}

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
export function generateToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role || ROLES.USER, username: user.username },
    config.jwtSecret,
    { expiresIn: '24h' }
  );
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if token is missing
 */
export function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwtSecret);
      req.userId = decoded.sub;
      req.userRole = decoded.role || ROLES.USER;
      req.username = decoded.username;
    }

    next();
  } catch (error) {
    // Silently ignore token errors for optional auth reqs
    next();
  }
}

export function requireModerator(req, res, next) {
  if (req.userRole !== ROLES.MODERATOR) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      error: ERROR_TYPES.FORBIDDEN,
      message: 'Moderator role required',
    });
  }

  return next();
}
