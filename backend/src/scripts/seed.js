import { faker } from "@faker-js/faker";
import { generateId } from "../utils/idGenerator.js";
import { hashPassword } from "../utils/password.js";
import {
  initialiseDatabase,
  saveDatabase,
  getDatabase,
} from "../config/database.js";
import { MOMENT_DURATION_HOURS, ROLES } from "../config/constants.js";

function nowIso() {
  return new Date().toISOString();
}

function randomPastIso() {
  return faker.date.past().toISOString();
}

function randomRecentIso(days = 2) {
  return faker.date.recent({ days }).toISOString();
}

function pickMany(array, count) {
  return faker.helpers.shuffle(array).slice(0, count);
}

function createRecordWithTimestamps(record) {
  return {
    ...record,
    createdAt: randomPastIso(),
    updatedAt: nowIso(),
  };
}

function logCreated(label, count) {
  console.log(`  ${count} ${label} created`);
}

/**
 * Generate sample users
 */
async function generateUsers(count = 10) {
  const users = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const email = faker.internet.email().toLowerCase();
      return {
        id: generateId(),
        username: email,
        email,
        password: await hashPassword("password123"),
        role: i === 0 ? ROLES.MODERATOR : ROLES.USER,
        createdAt: randomPastIso(),
        updatedAt: nowIso(),
      };
    }),
  );

  return users;
}

/**
 * Generate sample posts
 */
function generatePosts(users, postsPerUser = 3) {
  return users.flatMap((user) =>
    Array.from({ length: postsPerUser }, () =>
      createRecordWithTimestamps({
        id: generateId(),
        userId: user.id,
        title: faker.lorem.sentence(),
        description: faker.lorem.paragraphs(1),
        images: [faker.image.url(), faker.image.url()].slice(
          0,
          faker.number.int({ min: 0, max: 2 }),
        ),
        status: "active",
      }),
    ),
  );
}

/**
 * Generate sample follows
 */
function generateFollows(users) {
  const follows = [];

  // Each user follows 2-5 random users
  for (const user of users) {
    const followCount = faker.number.int({ min: 2, max: 5 });
    const usersToFollow = pickMany(users, followCount);

    for (const followee of usersToFollow) {
      if (user.id !== followee.id) {
        follows.push({
          id: generateId(),
          followerId: user.id,
          followeeId: followee.id,
          createdAt: randomPastIso(),
        });
      }
    }
  }

  return follows;
}

/**
 * Generate sample likes
 */
function generateLikes(posts, users) {
  const likes = [];

  for (const post of posts) {
    const likerCount = faker.number.int({ min: 0, max: 5 });
    const likersToSelect = pickMany(users, likerCount);

    for (const liker of likersToSelect) {
      if (liker.id !== post.userId) {
        likes.push({
          id: generateId(),
          postId: post.id,
          userId: liker.id,
          createdAt: randomPastIso(),
        });
      }
    }
  }

  return likes;
}

/**
 * Generate sample comments
 */
function generateComments(posts, users) {
  return posts.flatMap((post) => {
    const commentCount = faker.number.int({ min: 0, max: 5 });
    return Array.from({ length: commentCount }, () => {
      const commentAuthor = faker.helpers.arrayElement(users);
      return createRecordWithTimestamps({
        id: generateId(),
        postId: post.id,
        userId: commentAuthor.id,
        text: faker.lorem.sentences(1),
      });
    });
  });
}

/**
 * Generate sample moments
 */
function generateMoments(users) {
  return users.flatMap((user) => {
    const count = faker.number.int({ min: 1, max: 3 });

    return Array.from({ length: count }, () => {
      const createdAt = randomRecentIso(2);
      const expiresAtDate = new Date(
        new Date(createdAt).getTime() + MOMENT_DURATION_HOURS * 60 * 60 * 1000,
      );
      const expiresAt = expiresAtDate.toISOString();

      return {
        id: generateId(),
        userId: user.id,
        imageUrl: faker.image.url(),
        caption: faker.lorem.sentence(),
        status: expiresAtDate.getTime() < Date.now() ? "archived" : "active",
        createdAt,
        expiresAt,
        updatedAt: nowIso(),
      };
    });
  });
}

/**
 * Run seed
 */
async function seed() {
  try {
    console.log("Seeding database...\n");

    // Initialise database
    await initialiseDatabase();
    const db = getDatabase();

    // Clear existing data
    ["users", "posts", "follows", "likes", "comments", "moments"].forEach(
      (key) => {
        db.data[key] = [];
      },
    );

    // Generate data
    console.log("Generating users...");
    const users = await generateUsers(10);
    db.data.users = users;
    logCreated("users", users.length);

    console.log("Generating posts...");
    const posts = generatePosts(users, 3);
    db.data.posts = posts;
    logCreated("posts", posts.length);

    console.log("Generating follows...");
    const follows = generateFollows(users);
    db.data.follows = follows;
    logCreated("follow relationships", follows.length);

    console.log("Generating likes...");
    const likes = generateLikes(posts, users);
    db.data.likes = likes;
    logCreated("likes", likes.length);

    console.log("Generating comments...");
    const comments = generateComments(posts, users);
    db.data.comments = comments;
    logCreated("comments", comments.length);

    console.log("Generating moments...");
    const moments = generateMoments(users);
    db.data.moments = moments;
    logCreated("moments", moments.length);

    // Save to disk
    await saveDatabase();

    console.log("\nDatabase seeded successfully.\n");

    // Print sample credentials
    console.log("Sample credentials:");
    users.slice(0, 3).forEach((user, i) => {
      console.log(
        `   ${i + 1}. Email: ${user.email}, Password: password123, Role: ${user.role}`,
      );
    });

    console.log("\n");
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

// Run the seed
seed();
