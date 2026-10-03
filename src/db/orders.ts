import { db } from "./index.js";
import { nowLocal } from "../lib/time.js";
import type { CartLine } from "./cart.js";

export type OrderStatus = "new" | "awaiting_payment" | "payment_check" | "paid" | "ready" | "done" | "cancelled";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "🆕 Новый",
  awaiting_payment: "💳 Ждёт оплату",
  payment_check: "🔎 Проверить оплату",
  paid: "👩‍🍳 Готовится",
  ready: "📦 Готов к выдаче",
  done: "✔️ Выдан",
  cancelled: "✖️ Отменён",
};

export const ACTIVE_STATUSES: OrderStatus[] = ["new", "awaiting_payment", "payment_check", "paid", "ready"];

export interface Order {
  id: number;
  user_id: number;
  status: OrderStatus;
  slot_id: number | null;
  requested_at: string | null;
  requested_note: string | null;
  scheduled_at: string | null;
  comment: string | null;
  total: number;
  payment_reminded: number;
  pickup_reminded: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  variant_id: number | null;
  dish_title: string;
  variant_title: string;
  price: number;
  qty: number;
}

export interface OrderFull extends Order {
  items: OrderItem[];
  first_name: string;
  last_name: string | null;
  username: string | null;
}

export interface NewOrder {
  userId: number;
  lines: CartLine[];
  slotId: number | null;
  requestedAt: string | null;
  requestedNote: string | null;
  comment: string | null;
}

export function createOrder(input: NewOrder): number {
  return db.transaction(() => {
    const now = nowLocal();
    const total = input.lines.reduce((s, l) => s + l.price * l.qty, 0);
    const orderId = Number(
      db
        .prepare(
          `INSERT INTO orders (user_id, status, slot_id, requested_at, requested_note, comment, total, created_at, updated_at)
           VALUES (?, 'new', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(input.userId, input.slotId, input.requestedAt, input.requestedNote, input.comment, total, now, now)
        .lastInsertRowid,
    );
    const insertItem = db.prepare(
      "INSERT INTO order_items (order_id, variant_id, dish_title, variant_title, price, qty) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const l of input.lines) {
      const variant = [l.variant_title, l.weight].filter(Boolean).join(", ");
      insertItem.run(orderId, l.variant_id, l.dish_title, variant, l.price, l.qty);
    }
    return orderId;
  })();
}

const selectFull = `
  SELECT o.*, u.first_name, u.last_name, u.username
  FROM orders o JOIN users u ON u.id = o.user_id`;

function attachItems(orders: (Omit<OrderFull, "items">)[]): OrderFull[] {
  if (orders.length === 0) return [];
  const items = db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${orders.map(() => "?").join(",")}) ORDER BY id`)
    .all(...orders.map((o) => o.id)) as OrderItem[];
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

export function getOrder(id: number): OrderFull | undefined {
  const row = db.prepare(`${selectFull} WHERE o.id = ?`).get(id) as Omit<OrderFull, "items"> | undefined;
  return row ? attachItems([row])[0] : undefined;
}

export type OrderFilter = "active" | "attention" | OrderStatus | "all";

const ATTENTION_ORDER = `CASE o.status
  WHEN 'payment_check' THEN 0
  WHEN 'new' THEN 1
  WHEN 'paid' THEN 2
  WHEN 'ready' THEN 3
  WHEN 'awaiting_payment' THEN 4
  ELSE 5 END`;

export function listOrders(filter: OrderFilter = "active", limit = 100): OrderFull[] {
  let where = "1 = 1";
  let order = "o.updated_at DESC";
  if (filter === "active") {
    where = `o.status IN (${ACTIVE_STATUSES.map((s) => `'${s}'`).join(",")})`;
    order = `${ATTENTION_ORDER}, COALESCE(o.scheduled_at, o.requested_at, o.created_at), o.updated_at DESC`;
  } else if (filter === "attention") {
    where = "o.status IN ('new','payment_check')";
    order = `${ATTENTION_ORDER}, o.updated_at DESC`;
  } else if (filter !== "all") {
    where = `o.status = '${filter}'`;
  }
  const rows = db.prepare(`${selectFull} WHERE ${where} ORDER BY ${order} LIMIT ?`).all(limit) as Omit<
    OrderFull,
    "items"
  >[];
  return attachItems(rows);
}

export function listUserOrders(userId: number, limit = 10): OrderFull[] {
  const rows = db
    .prepare(`${selectFull} WHERE o.user_id = ? ORDER BY o.id DESC LIMIT ?`)
    .all(userId, limit) as Omit<OrderFull, "items">[];
  return attachItems(rows);
}

export function updateOrder(
  id: number,
  patch: Partial<Pick<Order, "status" | "scheduled_at" | "payment_reminded" | "pickup_reminded">>,
) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE orders SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({
    ...patch,
    id,
    updated_at: nowLocal(),
  });
}

export function ordersCountByStatus(): Record<string, number> {
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all() as {
    status: string;
    n: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function ordersScheduledOn(date: string): OrderFull[] {
  const rows = db
    .prepare(
      `${selectFull} WHERE substr(o.scheduled_at, 1, 10) = ? AND o.status IN ('awaiting_payment','payment_check','paid','ready')
       ORDER BY o.scheduled_at`,
    )
    .all(date) as Omit<OrderFull, "items">[];
  return attachItems(rows);
}

export function saveOrderMessage(orderId: number, chatId: number, messageId: number) {
  db.prepare(
    `INSERT INTO order_messages (order_id, chat_id, message_id) VALUES (?, ?, ?)
     ON CONFLICT(order_id, chat_id) DO UPDATE SET message_id = excluded.message_id`,
  ).run(orderId, chatId, messageId);
}

export function getOrderMessages(orderId: number): { chat_id: number; message_id: number }[] {
  return db.prepare("SELECT chat_id, message_id FROM order_messages WHERE order_id = ?").all(orderId) as {
    chat_id: number;
    message_id: number;
  }[];
}
