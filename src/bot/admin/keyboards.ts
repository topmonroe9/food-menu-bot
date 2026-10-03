import { InlineKeyboard } from "grammy";
import type { OrderFull } from "../../db/orders.js";
import { chatLink } from "../../db/users.js";
import { addDays, shortDay, timeSteps, today } from "../../lib/time.js";
import { listSlots } from "../../db/slots.js";

const compactDate = (date: string) => date.replaceAll("-", "");
export const expandDate = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

export function orderCardKeyboard(order: OrderFull): InlineKeyboard {
  const kb = new InlineKeyboard();
  const id = order.id;
  switch (order.status) {
    case "new":
      if (order.requested_at) kb.text(`✅ Подтвердить ${order.requested_at.slice(11)}`, `a:ok:${id}`).row();
      kb.text("🕐 Назначить другое время", `a:time:${id}`).row();
      break;
    case "awaiting_payment":
      kb.text("✅ Оплата пришла", `a:paid:${id}`).row();
      kb.text("🕐 Перенести", `a:time:${id}`).row();
      break;
    case "payment_check":
      kb.text("✅ Оплата пришла", `a:paid:${id}`).text("❌ Не вижу оплату", `a:nopay:${id}`).row();
      break;
    case "paid":
      kb.text("📦 Готов к выдаче", `a:ready:${id}`).row();
      kb.text("🕐 Перенести", `a:time:${id}`).row();
      break;
    case "ready":
      kb.text("✔️ Выдан", `a:done:${id}`).row();
      break;
  }
  kb.url("💬 Написать клиенту", chatLink({ id: order.user_id, username: order.username }));
  if (order.status !== "done" && order.status !== "cancelled") kb.text("✖️ Отменить", `a:cx:${id}`);
  return kb;
}

export function cancelConfirmKeyboard(orderId: number): InlineKeyboard {
  return new InlineKeyboard().text("Да, отменить заказ", `a:cxy:${orderId}`).row().text("« Назад", `a:card:${orderId}`);
}

export function dayPickerKeyboard(orderId: number): InlineKeyboard {
  const slotDays = new Set(listSlots().map((s) => s.date));
  const kb = new InlineKeyboard();
  const start = today();
  for (let i = 0; i < 14; i++) {
    const date = addDays(start, i);
    const mark = slotDays.has(date) ? "🟢 " : "";
    const label = i === 0 ? "Сегодня" : i === 1 ? "Завтра" : shortDay(date);
    kb.text(`${mark}${label}`, `a:day:${orderId}:${compactDate(date)}`);
    if (i % 2 === 1) kb.row();
  }
  kb.row().text("⌨️ Ввести вручную", `a:custom:${orderId}`).row().text("« Назад", `a:card:${orderId}`);
  return kb;
}

export function timePickerKeyboard(orderId: number, date: string): InlineKeyboard {
  const daySlots = listSlots(date).filter((s) => s.date === date);
  const times = new Set<string>();
  if (daySlots.length > 0) {
    for (const s of daySlots) timeSteps(s.start_time, s.end_time).forEach((t) => times.add(t));
  } else {
    timeSteps("09:00", "22:00").forEach((t) => times.add(t));
  }
  const kb = new InlineKeyboard();
  [...times].sort().forEach((t, i) => {
    kb.text(t, `a:at:${orderId}:${compactDate(date)}:${t.replace(":", "")}`);
    if (i % 4 === 3) kb.row();
  });
  kb.row().text("« Другой день", `a:time:${orderId}`);
  return kb;
}
