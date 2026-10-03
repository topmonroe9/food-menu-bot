import { db } from "./index.js";
import { nowLocal, today } from "../lib/time.js";

export interface Slot {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
}

export interface SlotWithLoad extends Slot {
  booked: number;
}

const ACTIVE = "('new','awaiting_payment','payment_check','paid','ready')";

const withLoad = `
  SELECT s.*, (SELECT COUNT(*) FROM orders o WHERE o.slot_id = s.id AND o.status IN ${ACTIVE}) AS booked
  FROM slots s`;

export function listSlots(fromDate = today()): SlotWithLoad[] {
  return db
    .prepare(`${withLoad} WHERE s.date >= ? ORDER BY s.date, s.start_time`)
    .all(fromDate) as SlotWithLoad[];
}

export function listBookableSlots(): SlotWithLoad[] {
  const now = nowLocal();
  return listSlots().filter(
    (s) => `${s.date} ${s.end_time}` > now && (s.capacity === 0 || s.booked < s.capacity),
  );
}

export function getSlot(id: number): SlotWithLoad | undefined {
  return db.prepare(`${withLoad} WHERE s.id = ?`).get(id) as SlotWithLoad | undefined;
}

export function isSlotFree(slot: SlotWithLoad): boolean {
  return slot.capacity === 0 || slot.booked < slot.capacity;
}

export interface SlotInput {
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
}

export function createSlot(input: SlotInput): number {
  return Number(
    db
      .prepare("INSERT INTO slots (date, start_time, end_time, capacity) VALUES (?, ?, ?, ?)")
      .run(input.date, input.start_time, input.end_time, input.capacity).lastInsertRowid,
  );
}

export function updateSlot(id: number, input: SlotInput) {
  db.prepare("UPDATE slots SET date = ?, start_time = ?, end_time = ?, capacity = ? WHERE id = ?").run(
    input.date,
    input.start_time,
    input.end_time,
    input.capacity,
    id,
  );
}

export function deleteSlot(id: number) {
  db.prepare("DELETE FROM slots WHERE id = ?").run(id);
}

export function slotsBetween(from: string, to: string): Slot[] {
  return db
    .prepare("SELECT * FROM slots WHERE date >= ? AND date <= ? ORDER BY date, start_time")
    .all(from, to) as Slot[];
}
