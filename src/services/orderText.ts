import { escapeHtml, money } from "../lib/format.js";
import { humanDateTime } from "../lib/time.js";
import { getSlot } from "../db/slots.js";
import { STATUS_LABEL, type OrderFull } from "../db/orders.js";
import { displayName } from "../db/users.js";

function itemsBlock(order: OrderFull): string {
  return order.items
    .map((i) => {
      const name = i.variant_title ? `${i.dish_title} (${i.variant_title})` : i.dish_title;
      return `• ${escapeHtml(name)} × ${i.qty} — ${money(i.price * i.qty)}`;
    })
    .join("\n");
}

export function requestedText(order: OrderFull): string {
  if (order.requested_at) {
    const slot = order.slot_id ? getSlot(order.slot_id) : undefined;
    const window = slot ? ` (окошко ${slot.start_time}–${slot.end_time})` : "";
    return `${humanDateTime(order.requested_at)}${window}`;
  }
  return order.requested_note ? `«${escapeHtml(order.requested_note)}»` : "не указано";
}

export function adminOrderText(order: OrderFull): string {
  const client = escapeHtml(displayName(order));
  const username = order.username ? ` @${escapeHtml(order.username)}` : "";
  const lines = [
    `<b>Заказ #${order.id}</b> · ${STATUS_LABEL[order.status]}`,
    `👤 <a href="tg://user?id=${order.user_id}">${client}</a>${username}`,
    "",
    itemsBlock(order),
    `<b>Итого: ${money(order.total)}</b>`,
    "",
    `🗓 Клиент хочет: ${requestedText(order)}`,
  ];
  if (order.scheduled_at) lines.push(`⏰ Назначено: <b>${humanDateTime(order.scheduled_at)}</b>`);
  if (order.comment) lines.push(`💬 ${escapeHtml(order.comment)}`);
  return lines.join("\n");
}

export function clientOrderText(order: OrderFull): string {
  const lines = [`<b>Заказ #${order.id}</b> · ${STATUS_LABEL[order.status]}`, "", itemsBlock(order), `<b>Итого: ${money(order.total)}</b>`];
  if (order.scheduled_at) lines.push("", `⏰ ${humanDateTime(order.scheduled_at)}`);
  else lines.push("", `🗓 Ваше пожелание: ${requestedText(order)}`);
  if (order.comment) lines.push(`💬 ${escapeHtml(order.comment)}`);
  return lines.join("\n");
}
