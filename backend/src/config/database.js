import { Low } from "lowdb";
import { JSONFile } from "lowdb";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../../db.json");

/**
 * Initialise database with default schema
 */
const defaultData = {
  users: [],
  posts: [],
  comments: [],
  likes: [],
  follows: [],
  moments: [],
};

let db = null;

/**
 * Get or initialise the database
 * @returns {Promise<Object>} Database instance
 */
export async function initialiseDatabase() {
  if (db) return db;

  const adapter = new JSONFile(dbPath);
  db = new Low(adapter, defaultData);

  await db.read();
  if (!db.data) {
    db.data = { ...defaultData };
  }

  // Set defaults if first run
  if (!db.data.users) db.data.users = [];
  if (!db.data.posts) db.data.posts = [];
  if (!db.data.comments) db.data.comments = [];
  if (!db.data.likes) db.data.likes = [];
  if (!db.data.follows) db.data.follows = [];
  if (!db.data.moments) db.data.moments = [];

  await db.write();
  return db;
}

/**
 * Get the database instance
 * @returns {Object} Database instance
 */
export function getDatabase() {
  if (!db) {
    throw new Error(
      "Database not initialised. Call initialiseDatabase() first.",
    );
  }
  return db;
}

/**
 * Save database to disk
 * @returns {Promise<void>}
 */
export async function saveDatabase() {
  if (db) {
    await db.write();
  }
}
