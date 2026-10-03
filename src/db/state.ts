import { db } from "./index.js";

export interface CheckoutDraft {
  slotId?: number;
  requestedAt?: string;
  note?: string;
  comment?: string;
  awaiting?: "note" | "comment";
}

export type UserState =
  | { state: "checkout"; data: CheckoutDraft }
  | { state: "admin_custom_time"; data: { orderId: number } }
  | { state: "broadcast_wait"; data: Record<string, never> };

export function getState(userId: number): UserState | undefined {
  const row = db.prepare("SELECT state, data FROM user_state WHERE user_id = ?").get(userId) as
    | { state: string; data: string }
    | undefined;
  if (!row) return undefined;
  return { state: row.state, data: JSON.parse(row.data) } as UserState;
}

export function setState(userId: number, value: UserState) {
  db.prepare(
    `INSERT INTO user_state (user_id, state, data) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, data = excluded.data`,
  ).run(userId, value.state, JSON.stringify(value.data));
}

export function clearState(userId: number) {
  db.prepare("DELETE FROM user_state WHERE user_id = ?").run(userId);
}
