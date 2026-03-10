import fs from "node:fs";
import path from "node:path";

const TOKEN_PATH = path.resolve(".", ".token.json");

interface TokenData {
  access_token: string;
  expires_at: number;
  token_type: string;
}

/**
 * Get a valid IGDB/Twitch access token.
 * Reads from .token.json if present and not expired,
 * otherwise requests a new one via Twitch OAuth.
 */
export async function getAccessToken(): Promise<string> {
  // Try reading cached token
  const cached = readCachedToken();
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached.access_token;
  }

  // Request a new token
  console.log("  [token] Refreshing Twitch OAuth token...");
  const token = await requestNewToken();
  writeCachedToken(token);
  return token.access_token;
}

function readCachedToken(): TokenData | null {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const raw = fs.readFileSync(TOKEN_PATH, "utf-8");
    const data = JSON.parse(raw) as TokenData;
    if (!data.access_token || !data.expires_at) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCachedToken(token: TokenData): void {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), "utf-8");
}

async function requestNewToken(): Promise<TokenData> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const grantType = process.env.TWITCH_GRANT_TYPE ?? "client_credentials";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET in .env",
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: grantType,
  });

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: params,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitch token request failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  return {
    access_token: json.access_token,
    expires_at: Date.now() + json.expires_in * 1000,
    token_type: json.token_type,
  };
}
