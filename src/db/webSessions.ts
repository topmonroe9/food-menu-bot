import { db } from "./index.js";
import { nowLocal } from "../lib/time.js";
import type { User } from "./users.js";

export function sessionUser(token: string): User | undefined {
  return db
    .prepare("SELECT u.* FROM web_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?")
    .get(token) as User | undefined;
}

export function bindSession(token: string, userId: number) {
  const now = nowLocal();
  db.prepare(
    `INSERT INTO web_sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, last_seen_at = excluded.last_seen_at`,
  ).run(token, userId, now, now);
}
