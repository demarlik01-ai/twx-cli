import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  bearerToken?: string;
}

/**
 * Load credentials from environment variables or .env file.
 * Searches: process.env → ./.env → ~/.config/twx-cli/.env
 */
export function loadCredentials(): XCredentials {
  // Try loading .env files
  const envPaths = [
    resolve(process.cwd(), ".env"),
    resolve(process.env.HOME ?? "~", ".config/twx-cli/.env"),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      }
      break;
    }
  }

  const apiKey = process.env.X_API_KEY ?? process.env.TWITTER_API_KEY;
  const apiSecret = process.env.X_API_SECRET ?? process.env.TWITTER_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN ?? process.env.TWITTER_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET ?? process.env.TWITTER_ACCESS_TOKEN_SECRET;
  const bearerToken = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    const missing: string[] = [];
    if (!apiKey) missing.push("X_API_KEY");
    if (!apiSecret) missing.push("X_API_SECRET");
    if (!accessToken) missing.push("X_ACCESS_TOKEN");
    if (!accessTokenSecret) missing.push("X_ACCESS_TOKEN_SECRET");
    throw new Error(
      `Missing credentials: ${missing.join(", ")}\n` +
      `Set them as environment variables or in .env / ~/.config/twx-cli/.env`
    );
  }

  return { apiKey, apiSecret, accessToken, accessTokenSecret, bearerToken };
}
