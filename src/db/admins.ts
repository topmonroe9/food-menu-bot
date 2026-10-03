import { db } from "./index.js";
import { config } from "../config.js";
import { nowLocal } from "../lib/time.js";

export type AdminRole = "owner" | "helper";

export interface AdminRow {
  user_id: number;
  role: AdminRole;
  notify: number;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

export function syncOwnersFromEnv() {
  const insert = db.prepare(
    `INSERT INTO admins (user_id, role, notify, created_at) VALUES (?, 'owner', 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET role = 'owner'`,
  );
  for (const id of config.ownerIds) insert.run(id, nowLocal());
}

export function getAdmin(userId: number): { user_id: number; role: AdminRole; notify: number } | undefined {
  return db.prepare("SELECT user_id, role, notify FROM admins WHERE user_id = ?").get(userId) as
    | { user_id: number; role: AdminRole; notify: number }
    | undefined;
}

export function isAdmin(userId: number): boolean {
  return config.ownerIds.includes(userId) || !!getAdmin(userId);
}

export function isOwner(userId: number): boolean {
  return config.ownerIds.includes(userId) || getAdmin(userId)?.role === "owner";
}

export function listAdmins(): AdminRow[] {
  return db
    .prepare(
      `SELECT a.*, u.first_name, u.last_name, u.username
       FROM admins a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.role = 'owner' DESC, a.created_at`,
    )
    .all() as AdminRow[];
}

export function addAdmin(userId: number, role: AdminRole) {
  db.prepare(
    `INSERT INTO admins (user_id, role, notify, created_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET role = excluded.role`,
  ).run(userId, role, nowLocal());
}

export function removeAdmin(userId: number) {
  db.prepare("DELETE FROM admins WHERE user_id = ?").run(userId);
}

export function setAdminNotify(userId: number, notify: boolean) {
  db.prepare("UPDATE admins SET notify = ? WHERE user_id = ?").run(notify ? 1 : 0, userId);
}

export function notifyRecipients(): number[] {
  return (db.prepare("SELECT user_id FROM admins WHERE notify = 1").all() as { user_id: number }[]).map(
    (r) => r.user_id,
  );
}

export function allAdminIds(): number[] {
  const ids = (db.prepare("SELECT user_id FROM admins").all() as { user_id: number }[]).map((r) => r.user_id);
  return [...new Set([...ids, ...config.ownerIds])];
}
