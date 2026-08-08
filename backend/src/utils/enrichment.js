import * as userModel from "../models/userModel.js";
import * as likeModel from "../models/likeModel.js";
import * as commentModel from "../models/commentModel.js";
import * as followModel from "../models/followModel.js";
import * as postModel from "../models/postModel.js";

/**
 * Enrich a post with likes count and comments count
 * @param {Object} post - Post object
 * @param {string} currentUserId - Current user's ID (optional, for checking if they liked it)
 * @returns {Promise<Object>} Enriched post
 */
export async function enrichPost(post, currentUserId = null) {
  if (!post) return null;

  const likesCount = await likeModel.getLikeCountByPostId(post.id);
  const commentsCount = await commentModel.getCommentCountByPostId(post.id);
  let isLikedByCurrentUser = false;

  if (currentUserId) {
    isLikedByCurrentUser = await likeModel.hasUserLikedPost(
      post.id,
      currentUserId,
    );
  }

  const authorRecord = await userModel.findUserById(post.userId);

  return {
    ...post,
    author: authorRecord
      ? { id: authorRecord.id, username: authorRecord.username }
      : null,
    stats: {
      likes: likesCount,
      comments: commentsCount,
    },
    currentUserLiked: isLikedByCurrentUser,
  };
}

/**
 * Enrich multiple posts
 * @param {Array} posts - Array of post objects
 * @param {string} currentUserId - Current user's ID (optional)
 * @returns {Promise<Array>} Array of enriched posts
 */
export async function enrichPosts(posts, currentUserId = null) {
  return Promise.all(posts.map((post) => enrichPost(post, currentUserId)));
}

/**
 * Enrich a user with follower/following counts
 * @param {Object} user - User object
 * @param {string} currentUserId - Current user's ID (optional, for checking if they follow)
 * @returns {Promise<Object>} Enriched user
 */
export async function enrichUser(user, currentUserId = null) {
  if (!user) return null;

  const followersCount = await followModel.getFollowerCount(user.id);
  const followingCount = await followModel.getFollowingCount(user.id);
  const postsCount = await postModel.getPostCountByUserId(user.id);
  let isFollowedByCurrentUser = false;

  if (currentUserId && currentUserId !== user.id) {
    isFollowedByCurrentUser = await followModel.isFollowing(
      currentUserId,
      user.id,
    );
  }

  return {
    ...user,
    stats: {
      followers: followersCount,
      following: followingCount,
      posts: postsCount,
    },
    currentUserFollows: isFollowedByCurrentUser,
  };
}

/**
 * Enrich multiple users
 * @param {Array} users - Array of user objects
 * @param {string} currentUserId - Current user's ID (optional)
 * @returns {Promise<Array>} Array of enriched users
 */
export async function enrichUsers(users, currentUserId = null) {
  return Promise.all(users.map((user) => enrichUser(user, currentUserId)));
}
