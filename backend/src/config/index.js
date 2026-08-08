import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, "../../.env"));

const {
  PORT = "3000",
  HOST = "0.0.0.0",
  NODE_ENV = "development",
  JWT_SECRET = "dev-secret-change-in-production",
  UPLOADS_DIR = "uploads",
  PUBLIC_BASE_URL = "",
} = process.env;

const normalisedPublicBaseUrl = PUBLIC_BASE_URL.trim().replace(/\/$/, "");

export const config = {
  port: Number(PORT),
  host: HOST,
  nodeEnv: NODE_ENV,
  jwtSecret: JWT_SECRET,
  uploadsDir: UPLOADS_DIR,
  publicBaseUrl: normalisedPublicBaseUrl,
};

export function toPublicUrl(pathname = "") {
  if (!config.publicBaseUrl) return pathname;
  if (!pathname) return config.publicBaseUrl;
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${config.publicBaseUrl}${suffix}`;
}
