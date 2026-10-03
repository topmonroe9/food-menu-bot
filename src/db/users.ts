import { db } from "./index.js";
import { nowLocal } from "../lib/time.js";

export interface User {
  id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  last_activity_at: string;
  created_at: string;
  is_blocked: number;
}

export interface TelegramFrom {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

const upsert = db.prepare(`
  INSERT INTO users (id, first_name, last_name, username, last_activity_at, created_at)
  VALUES (@id, @first_name, @last_name, @username, @now, @now)
  ON CONFLICT(id) DO UPDATE SET
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    username = excluded.username,
    last_activity_at = excluded.last_activity_at,
    is_blocked = 0
`);

export function touchUser(from: TelegramFrom) {
  upsert.run({
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name ?? null,
    username: from.username ?? null,
    now: nowLocal(),
  });
}

export function getUser(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function displayName(user: Pick<User, "first_name" | "last_name" | "username">): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || (user.username ? `@${user.username}` : "Без имени");
}

export function chatLink(user: Pick<User, "id" | "username">): string {
  return user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.id}`;
}

export interface ClientRow extends User {
  orders_count: number;
  last_order_at: string | null;
  total_spent: number;
}

export type ClientSort = "recent" | "revenue" | "orders";

const CLIENT_SORT: Record<ClientSort, string> = {
  recent: "MAX(u.last_activity_at, COALESCE(MAX(o.updated_at), '')) DESC",
  revenue: "total_spent DESC, orders_count DESC",
  orders: "orders_count DESC, total_spent DESC",
};

export function listClients(search = "", limit = 100, sort: ClientSort = "recent"): ClientRow[] {
  const like = `%${search.trim().toLowerCase()}%`;
  return db
    .prepare(
      `SELECT u.*,
         COUNT(o.id) AS orders_count,
         MAX(o.created_at) AS last_order_at,
         COALESCE(SUM(CASE WHEN o.status IN ('paid','ready','done') THEN o.total END), 0) AS total_spent
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       WHERE ? = '%%'
          OR lower(u.first_name || ' ' || COALESCE(u.last_name, '') || ' ' || COALESCE(u.username, '')) LIKE ?
       GROUP BY u.id
       ORDER BY ${CLIENT_SORT[sort] ?? CLIENT_SORT.recent}
       LIMIT ?`,
    )
    .all(like, like, limit) as ClientRow[];
}

export function setBlocked(id: number) {
  db.prepare("UPDATE users SET is_blocked = 1 WHERE id = ?").run(id);
}

export function reachableUserIds(): number[] {
  return (db.prepare("SELECT id FROM users WHERE is_blocked = 0 ORDER BY id").all() as { id: number }[]).map((r) => r.id);
}

export interface FavoriteDish {
  title: string;
  orders: number;
  qty: number;
  amount: number;
}

export interface ClientStats {
  revenue: number;
  paid_orders: number;
  cancelled_orders: number;
  total_orders: number;
  avg_check: number;
  first_order_at: string | null;
  last_order_at: string | null;
  avg_days_between: number | null;
  favorites: FavoriteDish[];
}

const PAID = "('paid','ready','done')";

export function clientStats(userId: number): ClientStats {
  const summary = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ${PAID} THEN total END), 0) AS revenue,
         COUNT(CASE WHEN status IN ${PAID} THEN 1 END) AS paid_orders,
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_orders,
         COUNT(*) AS total_orders,
         MIN(CASE WHEN status != 'cancelled' THEN created_at END) AS first_order_at,
         MAX(CASE WHEN status != 'cancelled' THEN created_at END) AS last_order_at
       FROM orders WHERE user_id = ?`,
    )
    .get(userId) as Omit<ClientStats, "avg_check" | "avg_days_between" | "favorites">;

  const dates = (
    db
      .prepare("SELECT created_at FROM orders WHERE user_id = ? AND status != 'cancelled' ORDER BY created_at")
      .all(userId) as { created_at: string }[]
  ).map((r) => new Date(r.created_at.replace(" ", "T")).getTime());
  const avgDays =
    dates.length > 1 ? Math.round(((dates[dates.length - 1] - dates[0]) / (dates.length - 1) / 86_400_000) * 10) / 10 : null;

  const favorites = db
    .prepare(
      `SELECT
         CASE WHEN i.variant_title != '' THEN i.dish_title || ' (' || i.variant_title || ')' ELSE i.dish_title END AS title,
         COUNT(DISTINCT i.order_id) AS orders,
         SUM(i.qty) AS qty,
         SUM(i.qty * i.price) AS amount
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.user_id = ? AND o.status != 'cancelled'
       GROUP BY title
       ORDER BY orders DESC, qty DESC
       LIMIT 10`,
    )
    .all(userId) as FavoriteDish[];

  return {
    ...summary,
    avg_check: summary.paid_orders > 0 ? Math.round(summary.revenue / summary.paid_orders) : 0,
    avg_days_between: avgDays,
    favorites,
  };
}
