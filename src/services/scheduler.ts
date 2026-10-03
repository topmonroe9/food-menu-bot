import { bot } from "../bot/instance.js";
import { db } from "../db/index.js";
import { notifyRecipients } from "../db/admins.js";
import { getOrder, listOrders, ordersScheduledOn, updateOrder, STATUS_LABEL } from "../db/orders.js";
import { getSetting } from "../db/settings.js";
import { displayName } from "../db/users.js";
import { escapeHtml, money } from "../lib/format.js";
import { hoursBetween, longDay, nowLocal, today } from "../lib/time.js";
import { paidButton, paymentText } from "./orders.js";

async function send(chatId: number, text: string, extra: Parameters<typeof bot.api.sendMessage>[2] = {}) {
  try {
    await bot.api.sendMessage(chatId, text, { parse_mode: "HTML", ...extra });
  } catch (err) {
    console.error(`reminder to ${chatId} failed:`, err);
  }
}

async function paymentReminders(now: string) {
  const hours = Number(getSetting("payment_reminder_hours")) || 0;
  if (hours <= 0) return;
  for (const order of listOrders("awaiting_payment", 200)) {
    if (order.payment_reminded || hoursBetween(order.updated_at, now) < hours) continue;
    updateOrder(order.id, { payment_reminded: 1 });
    await send(order.user_id, `⏰ Напоминаю про оплату заказа #${order.id}.\n\n${paymentText(order)}`, {
      reply_markup: paidButton(order.id),
    });
  }
}

async function pickupReminders(now: string) {
  const rows = db
    .prepare("SELECT id FROM orders WHERE status IN ('paid','ready') AND pickup_reminded = 0 AND scheduled_at IS NOT NULL")
    .all() as { id: number }[];
  const address = getSetting("pickup_address").trim();
  for (const { id } of rows) {
    const order = getOrder(id)!;
    const left = hoursBetween(now, order.scheduled_at!);
    if (left > 2 || left < -1) continue;
    updateOrder(id, { pickup_reminded: 1 });
    const where = address ? `\n📍 ${escapeHtml(address)}` : "";
    await send(order.user_id, `👋 Напоминаю: заказ #${id} ждёт вас сегодня в <b>${order.scheduled_at!.slice(11)}</b>.${where}`);
  }
}

function lastDigestDate(): string | undefined {
  return (db.prepare("SELECT value FROM settings WHERE key = 'last_digest_date'").get() as { value: string } | undefined)
    ?.value;
}

async function morningDigest() {
  const hour = Number(getSetting("digest_hour"));
  const date = today();
  if (!Number.isInteger(hour) || hour < 0 || new Date().getHours() < hour || lastDigestDate() === date) return;
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('last_digest_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(date);

  const todays = ordersScheduledOn(date);
  const pending = listOrders("attention");
  if (todays.length === 0 && pending.length === 0) return;

  const lines = [`☀️ <b>Доброе утро! ${longDay(date)}</b>`];
  if (todays.length > 0) {
    lines.push("", `Сегодня ${todays.length} заказ(а):`);
    for (const o of todays) {
      lines.push(`${o.scheduled_at!.slice(11)} · #${o.id} ${escapeHtml(displayName(o))} · ${money(o.total)} · ${STATUS_LABEL[o.status]}`);
    }
  }
  if (pending.length > 0) lines.push("", `Ждут вашего ответа: ${pending.length} — /admin`);
  for (const chatId of notifyRecipients()) await send(chatId, lines.join("\n"));
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = nowLocal();
    await paymentReminders(now);
    await pickupReminders(now);
    await morningDigest();
  } catch (err) {
    console.error("scheduler tick failed:", err);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  setInterval(tick, 60_000);
  void tick();
}
