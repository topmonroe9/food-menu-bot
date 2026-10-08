import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

export interface WebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

const MAX_AGE_SECONDS = 24 * 60 * 60;

const secretKey = createHmac("sha256", "WebAppData").update(config.botToken).digest();

export function validateInitData(initData: string, maxAgeSeconds = MAX_AGE_SECONDS): WebAppUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "null") as WebAppUser | null;
    return user && Number.isInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}
