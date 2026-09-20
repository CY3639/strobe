// Seeds Strobe's AWS backend (Cognito + DynamoDB + S3) with the same shape of
// data the original seed.js wrote into lowdb's db.json.
//
// Run from backend/:
//   node --env-file=.env.seed src/scripts/seed-aws.js (real run)
//   node --env-file=.env.seed src/scripts/seed-aws.js --dry-run  (no AWS writes)
//
// Required env vars (same names your Lambdas already use):
//   COGNITO_USER_POOL_ID, MEDIA_BUCKET,
//   DYNAMODB_USERS_TABLE, DYNAMODB_POSTS_TABLE, DYNAMODB_FOLLOWS_TABLE,
//   DYNAMODB_LIKES_TABLE, DYNAMODB_COMMENTS_TABLE, DYNAMODB_MOMENTS_TABLE
// Optional:
//   SEED_USERS (10), SEED_POSTS_PER_USER (3), SEED_PASSWORD (Password123!),
//   SEED_IMAGE_DIR (seed-images), SEED_UPLOAD_DELAY_MS (500)

import { faker } from "@faker-js/faker";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REGION = "ap-southeast-2";
const MOMENT_DURATION_HOURS = 24;
const MODERATOR_GROUP = "moderator"; // must match what your Lambdas check

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const DRY_RUN = process.argv.includes("--dry-run");

const CONFIG = {
  userPoolId: requireEnv("COGNITO_USER_POOL_ID"),
  bucket: requireEnv("MEDIA_BUCKET"),
  tables: {
    users: requireEnv("DYNAMODB_USERS_TABLE"),
    posts: requireEnv("DYNAMODB_POSTS_TABLE"),
    follows: requireEnv("DYNAMODB_FOLLOWS_TABLE"),
    likes: requireEnv("DYNAMODB_LIKES_TABLE"),
    comments: requireEnv("DYNAMODB_COMMENTS_TABLE"),
    moments: requireEnv("DYNAMODB_MOMENTS_TABLE"),
  },
  userCount: Number(process.env.SEED_USERS ?? 10),
  postsPerUser: Number(process.env.SEED_POSTS_PER_USER ?? 3),
  // Cognito's default policy rejects "password123" (needs upper, number, symbol).
  password: process.env.SEED_PASSWORD ?? "Password123!",
  imageDir: process.env.SEED_IMAGE_DIR ?? "seed-images",
  uploadDelayMs: Number(process.env.SEED_UPLOAD_DELAY_MS ?? 500),
};

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

// Deterministic fake data: same run -> same emails, captions, comments.
faker.seed(432);

// ---------------------------------------------------------------------------
// Small helpers (same spirit as the original seed.js)
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();
const randomPastIso = () => faker.date.past().toISOString();
const randomRecentIso = (days = 2) => faker.date.recent({ days }).toISOString();
const pickMany = (array, count) => faker.helpers.shuffle(array).slice(0, count);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logCreated(label, count) {
  console.log(`  ${count} ${label} ${DRY_RUN ? "(dry run)" : "written"}`);
}

// ---------------------------------------------------------------------------
// Images: prefer your own photos, fall back to deterministic placeholders
// ---------------------------------------------------------------------------

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function loadLocalImages(dir) {
  try {
    const names = await fs.readdir(dir);
    const files = names.filter((n) => CONTENT_TYPES[path.extname(n).toLowerCase()]);
    return Promise.all(
      files.map(async (name) => ({
        name,
        body: await fs.readFile(path.join(dir, name)),
        contentType: CONTENT_TYPES[path.extname(name).toLowerCase()],
      })),
    );
  } catch {
    return [];
  }
}

async function fetchPlaceholderImage(seed) {
  const res = await fetch(`https://picsum.photos/seed/${seed}/800/600.jpg`);
  if (!res.ok) throw new Error(`Placeholder image fetch failed: ${res.status}`);
  return {
    name: `picsum-${seed}.jpg`,
    body: Buffer.from(await res.arrayBuffer()),
    contentType: "image/jpeg",
  };
}

// ---------------------------------------------------------------------------
// Cognito: identity comes first, because its `sub` is every user's id
// ---------------------------------------------------------------------------

function subFrom(attributes) {
  return attributes.find((a) => a.Name === "sub")?.Value;
}

async function ensureCognitoUser(email, isModerator) {
  if (DRY_RUN) return randomUUID();

  let sub;
  try {
    const created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: CONFIG.userPoolId,
        Username: email,
        MessageAction: "SUPPRESS", // don't email fake addresses
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
      }),
    );
    sub = subFrom(created.User.Attributes);
  } catch (error) {
    if (error.name !== "UsernameExistsException") throw error;
    // Re-running the seed: reuse the existing identity rather than failing.
    const existing = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: CONFIG.userPoolId, Username: email }),
    );
    sub = subFrom(existing.UserAttributes);
  }

  // Permanent password moves the user from FORCE_CHANGE_PASSWORD to CONFIRMED,
  // so your /v1/auth/login Lambda can sign them in immediately.
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: CONFIG.userPoolId,
      Username: email,
      Password: CONFIG.password,
      Permanent: true,
    }),
  );

  if (isModerator) {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: CONFIG.userPoolId,
        Username: email,
        GroupName: MODERATOR_GROUP,
      }),
    );
  }

  return sub;
}

// ---------------------------------------------------------------------------
// DynamoDB: batched writes with retry of unprocessed items
// ---------------------------------------------------------------------------

async function batchPut(table, items) {
  if (DRY_RUN || items.length === 0) return;

  for (let i = 0; i < items.length; i += 25) {
    let pending = {
      [table]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })),
    };

    for (let attempt = 0; Object.keys(pending).length > 0; attempt++) {
      if (attempt >= 6) throw new Error(`Gave up writing batch to ${table}`);
      const result = await ddb.send(new BatchWriteCommand({ RequestItems: pending }));
      pending = result.UnprocessedItems ?? {};
      if (Object.keys(pending).length > 0) await sleep(100 * 2 ** attempt);
    }
  }
}

// ---------------------------------------------------------------------------
// Generators (mirroring seed.js, but shaped like your Lambdas' records)
// ---------------------------------------------------------------------------

async function generateUsers(count) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const email = `seed${String(i + 1).padStart(2, "0")}@strobe.example`;
    const isModerator = i === 0;
    const id = await ensureCognitoUser(email, isModerator);
    users.push({
      id, // Cognito sub, the same value your Lambdas read from claims.sub
      username: email,
      email,
      role: isModerator ? "moderator" : "user",
      createdAt: randomPastIso(),
      updatedAt: nowIso(),
    });
  }
  return users;
}

function generatePosts(users, postsPerUser) {
  return users.flatMap((user) =>
    Array.from({ length: postsPerUser }, () => {
      const id = randomUUID();
      const imageCount = faker.number.int({ min: 0, max: 2 });
      return {
        id,
        userId: user.id,
        title: faker.lorem.sentence(),
        description: faker.lorem.paragraphs(1),
        // Same key format as lambdaUpload: userId/postId/fileId
        images: Array.from({ length: imageCount }, () => `${user.id}/${id}/${randomUUID()}`),
        status: "active",
        createdAt: randomPastIso(),
        updatedAt: nowIso(),
      };
    }),
  );
}

function generateFollows(users) {
  const follows = [];
  for (const user of users) {
    const targets = pickMany(users, faker.number.int({ min: 2, max: 5 }));
    for (const followee of targets) {
      if (followee.id === user.id) continue;
      follows.push({
        id: `${user.id}#${followee.id}`, // deterministic, matches lambdaUser
        followerId: user.id,
        followeeId: followee.id,
        createdAt: randomPastIso(),
      });
    }
  }
  return follows;
}

function generateLikes(posts, users) {
  const likes = [];
  for (const post of posts) {
    const likers = pickMany(users, faker.number.int({ min: 0, max: 5 }));
    for (const liker of likers) {
      if (liker.id === post.userId) continue;
      likes.push({
        postId: post.id, // partition key
        userId: liker.id, // sort key
        id: randomUUID(),
        createdAt: randomPastIso(),
      });
    }
  }
  return likes;
}

function generateComments(posts, users) {
  return posts.flatMap((post) =>
    Array.from({ length: faker.number.int({ min: 0, max: 5 }) }, () => ({
      id: randomUUID(),
      postId: post.id,
      userId: faker.helpers.arrayElement(users).id,
      text: faker.lorem.sentences(1),
      createdAt: randomPastIso(),
      updatedAt: nowIso(),
    })),
  );
}

function generateMoments(users) {
  return users.flatMap((user) =>
    Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => {
      const createdAt = randomRecentIso(2);
      const expires = new Date(
        new Date(createdAt).getTime() + MOMENT_DURATION_HOURS * 60 * 60 * 1000,
      );
      return {
        id: randomUUID(),
        userId: user.id,
        // Kept as an external URL, like the original seed.
        imageUrl: `https://picsum.photos/seed/${randomUUID()}/600/900.jpg`,
        caption: faker.lorem.sentence(),
        status: expires.getTime() < Date.now() ? "archived" : "active",
        createdAt,
        expiresAt: expires.toISOString(),
        updatedAt: nowIso(),
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// S3 uploads happen LAST, after the post rows exist, so any upload-triggered
// pipeline (EventBridge -> SQS -> classifier) finds the post it belongs to.
// ---------------------------------------------------------------------------

async function uploadPostImages(posts) {
  const keys = posts.flatMap((post) => post.images);
  if (keys.length === 0) return 0;

  const localImages = await loadLocalImages(CONFIG.imageDir);
  console.log(
    localImages.length
      ? `  Using ${localImages.length} local image(s) from ./${CONFIG.imageDir}`
      : "  No local images found, using picsum.photos placeholders",
  );

  let uploaded = 0;
  for (const [index, key] of keys.entries()) {
    const image = localImages.length
      ? localImages[index % localImages.length]
      : await fetchPlaceholderImage(index);

    if (!DRY_RUN) {
      await s3.send(
        new PutObjectCommand({
          Bucket: CONFIG.bucket,
          Key: key,
          Body: image.body,
          ContentType: image.contentType,
        }),
      );
      await sleep(CONFIG.uploadDelayMs); // be gentle with downstream Bedrock calls
    }
    uploaded++;
  }
  return uploaded;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function seed() {
  console.log(`Seeding Strobe on AWS${DRY_RUN ? " (DRY RUN, nothing written)" : ""}...\n`);

  console.log("Creating Cognito identities + user rows...");
  const users = await generateUsers(CONFIG.userCount);
  await batchPut(CONFIG.tables.users, users);
  logCreated("users", users.length);

  console.log("Generating posts...");
  const posts = generatePosts(users, CONFIG.postsPerUser);
  await batchPut(CONFIG.tables.posts, posts);
  logCreated("posts", posts.length);

  console.log("Generating follows...");
  const follows = generateFollows(users);
  await batchPut(CONFIG.tables.follows, follows);
  logCreated("follows", follows.length);

  console.log("Generating likes...");
  const likes = generateLikes(posts, users);
  await batchPut(CONFIG.tables.likes, likes);
  logCreated("likes", likes.length);

  console.log("Generating comments...");
  const comments = generateComments(posts, users);
  await batchPut(CONFIG.tables.comments, comments);
  logCreated("comments", comments.length);

  console.log("Generating moments...");
  const moments = generateMoments(users);
  await batchPut(CONFIG.tables.moments, moments);
  logCreated("moments", moments.length);

  console.log("Uploading post images to S3...");
  const uploaded = await uploadPostImages(posts);
  logCreated("images", uploaded);

  console.log("\nDone. Sample logins:");
  users.slice(0, 3).forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.email} / ${CONFIG.password} (${u.role})`);
  });
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});