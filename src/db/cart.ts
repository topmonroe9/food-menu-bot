import { db } from "./index.js";
import { variantLabel } from "./menu.js";

export interface CartLine {
  variant_id: number;
  qty: number;
  price: number;
  dish_id: number;
  dish_title: string;
  variant_title: string;
  weight: string;
}

export function getCart(userId: number): CartLine[] {
  return db
    .prepare(
      `SELECT c.variant_id, c.qty, v.price, v.title AS variant_title, v.weight, d.id AS dish_id, d.title AS dish_title
       FROM cart_items c
       JOIN variants v ON v.id = c.variant_id AND v.is_deleted = 0 AND v.is_available = 1
       JOIN dishes d ON d.id = v.dish_id AND d.is_visible = 1
       WHERE c.user_id = ?
       ORDER BY d.title, v.position`,
    )
    .all(userId) as CartLine[];
}

export function cartLineLabel(line: CartLine): string {
  const variant = variantLabel({ title: line.variant_title, weight: line.weight });
  return variant ? `${line.dish_title} (${variant})` : line.dish_title;
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

export function cartCount(userId: number): number {
  return getCart(userId).reduce((sum, l) => sum + l.qty, 0);
}

export function cartQty(userId: number, variantId: number): number {
  const row = db.prepare("SELECT qty FROM cart_items WHERE user_id = ? AND variant_id = ?").get(userId, variantId) as
    | { qty: number }
    | undefined;
  return row?.qty ?? 0;
}

export function changeCartQty(userId: number, variantId: number, delta: number) {
  const qty = Math.min(cartQty(userId, variantId) + delta, 99);
  if (qty <= 0) {
    db.prepare("DELETE FROM cart_items WHERE user_id = ? AND variant_id = ?").run(userId, variantId);
  } else {
    db.prepare(
      `INSERT INTO cart_items (user_id, variant_id, qty) VALUES (?, ?, ?)
       ON CONFLICT(user_id, variant_id) DO UPDATE SET qty = excluded.qty`,
    ).run(userId, variantId, qty);
  }
}

export function clearCart(userId: number) {
  db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(userId);
}
