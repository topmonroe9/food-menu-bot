import { db } from "./index.js";
import { nowLocal } from "../lib/time.js";

export type BroadcastStatus = "draft" | "sending" | "done" | "cancelled" | "interrupted";

export interface Broadcast {
  id: number;
  created_by: number;
  source_chat_id: number;
  source_message_id: number;
  control_message_id: number | null;
  with_menu_button: number;
  status: BroadcastStatus;
  preview_text: string;
  total: number;
  sent: number;
  failed: number;
  created_at: string;
  finished_at: string | null;
}

export function createBroadcast(createdBy: number, chatId: number, messageId: number, previewText: string): number {
  return Number(
    db
      .prepare(
        `INSERT INTO broadcasts (created_by, source_chat_id, source_message_id, preview_text, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(createdBy, chatId, messageId, previewText.slice(0, 200), nowLocal()).lastInsertRowid,
  );
}

export function getBroadcast(id: number): Broadcast | undefined {
  return db.prepare("SELECT * FROM broadcasts WHERE id = ?").get(id) as Broadcast | undefined;
}

export function updateBroadcast(
  id: number,
  patch: Partial<Pick<Broadcast, "control_message_id" | "with_menu_button" | "status" | "total" | "sent" | "failed" | "finished_at">>,
) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  db.prepare(`UPDATE broadcasts SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...patch, id });
}

export function listBroadcasts(limit = 30): (Broadcast & { author: string | null })[] {
  return db
    .prepare(
      `SELECT b.*, u.first_name AS author FROM broadcasts b LEFT JOIN users u ON u.id = b.created_by
       WHERE b.status != 'draft' ORDER BY b.id DESC LIMIT ?`,
    )
    .all(limit) as (Broadcast & { author: string | null })[];
}

export function markInterruptedBroadcasts() {
  db.prepare("UPDATE broadcasts SET status = 'interrupted', finished_at = ? WHERE status = 'sending'").run(nowLocal());
}
