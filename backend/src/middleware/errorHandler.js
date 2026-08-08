import { ERROR_TYPES, HTTP_STATUS } from '../config/constants.js';

class AppError extends Error {
  constructor(type, message, status) {
    super(message);
    this.type = type;
    this.status = status;
  }
}

/**
 * Centralized error handler
 * Should be added as the last middleware in Express
 */
export function errorHandler(err, req, res, next) {
  void next;
  const status = err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const type = err.type || ERROR_TYPES.INTERNAL;
  const message = err.message || 'An unexpected error occurred';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: type,
    message,
  });
}

/**
 * Wrap async route handlers to catch errors
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create a validation error
 */
export function validationError(message) {
  return new AppError(ERROR_TYPES.VALIDATION, message, HTTP_STATUS.BAD_REQUEST);
}

/**
 * Create a not found error
 */
export function notFoundError(message) {
  return new AppError(ERROR_TYPES.NOT_FOUND, message, HTTP_STATUS.NOT_FOUND);
}

/**
 * Create a forbidden error
 */
export function forbiddenError(message) {
  return new AppError(ERROR_TYPES.FORBIDDEN, message, HTTP_STATUS.FORBIDDEN);
}

/**
 * Create a conflict error
 */
export function conflictError(message) {
  return new AppError(ERROR_TYPES.CONFLICT, message, HTTP_STATUS.CONFLICT);
}

/**
 * Create an unauthorised error
 */
export function unauthorisedError(message) {
  return new AppError(ERROR_TYPES.UNAUTHORISED, message, HTTP_STATUS.UNAUTHORISED);
}
