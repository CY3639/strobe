// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORISED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

export const ROLES = {
  USER: "user",
  MODERATOR: "moderator",
};

// Validation Rules
export const VALIDATION = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  PASSWORD_MIN_LENGTH: 6,
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  POST_TITLE_MAX_LENGTH: 500,
  POST_DESCRIPTION_MAX_LENGTH: 5000,
  COMMENT_MAX_LENGTH: 1000,
  MAX_IMAGES_PER_POST: 5,
};

// Moment Duration
export const MOMENT_DURATION_HOURS = 24;

// Error Messages
export const ERROR_MESSAGES = {
  // Auth errors
  INVALID_CREDENTIALS: "Invalid username or password",
  USER_ALREADY_EXISTS: "Username already exists",
  EMAIL_ALREADY_EXISTS: "Email already exists",
  USER_NOT_FOUND: "User not found",
  CANNOT_DELETE_USER: "You can only delete your own account",
  UNAUTHORISED: "Unauthorised - Please log in",
  INVALID_TOKEN: "Invalid or expired token",

  // Post errors
  POST_NOT_FOUND: "Post not found",
  CANNOT_MODIFY_POST: "You can only modify your own posts",
  CANNOT_DELETE_POST: "You can only delete your own posts",
  POST_ALREADY_LIKED: "You have already liked this post",
  POST_NOT_LIKED: "You have not liked this post",
  INVALID_POST_DATA: "Invalid post data",

  // Comment errors
  COMMENT_NOT_FOUND: "Comment not found",
  CANNOT_DELETE_COMMENT: "You can only delete your own comments",

  // Follow errors
  CANNOT_FOLLOW_YOURSELF: "You cannot follow yourself",
  ALREADY_FOLLOWING: "You are already following this user",
  NOT_FOLLOWING: "You are not following this user",

  // Validation errors
  MISSING_REQUIRED_FIELDS: "Missing required fields",
  INVALID_EMAIL: "Invalid email address",
  PASSWORD_TOO_SHORT: "Password must be at least 6 characters",
  USERNAME_INVALID: "Username must be between 3 and 30 characters",
  INVALID_ROLE: "Role must be either user or moderator",
  TOO_MANY_IMAGES: `Maximum ${VALIDATION.MAX_IMAGES_PER_POST} images per post`,

  // Generic errors
  INTERNAL_ERROR: "An unexpected error occurred",
};

export const ERROR_TYPES = {
  NOT_FOUND: "NotFound",
  UNAUTHORISED: "Unauthorised",
  FORBIDDEN: "Forbidden",
  VALIDATION: "ValidationError",
  CONFLICT: "Conflict",
  INTERNAL: "InternalError",
};

// API Response Templates
export const RESPONSE_MESSAGES = {
  SUCCESS: "Success",
  CREATED: "Created successfully",
  UPDATED: "Updated successfully",
  DELETED: "Deleted successfully",
};
