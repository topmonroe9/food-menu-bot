import { GrammyError, InlineKeyboard } from "grammy";
import { bot } from "../bot/instance.js";
import { getOrder, getOrderMessages, saveOrderMessage, updateOrder, createOrder, type OrderFull, type OrderStatus } from "../db/orders.js";
import { notifyRecipients } from "../db/admins.js";
import { getSetting } from "../db/settings.js";
import { clearCart, getCart } from "../db/cart.js";
import { adminOrderText } from "./orderText.js";
import { orderCardKeyboard } from "../bot/admin/keyboards.js";
import { escapeHtml, money } from "../lib/format.js";
import { humanDateTime } from "../lib/time.js";
import type { CheckoutDraft } from "../db/state.js";

export class OrderFlowError extends Error {}

function load(orderId: number): OrderFull {
  const order = getOrder(orderId);
  if (!order) throw new OrderFlowError("Заказ не найден");
  return order;
}

function expect(order: OrderFull, allowed: OrderStatus[]) {
  if (!allowed.includes(order.status)) throw new OrderFlowError("Статус заказа уже изменился");
}

async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GrammyError && /not modified/.test(err.description)) return undefined;
    console.error("telegram call failed:", err instanceof GrammyError ? err.description : err);
    return undefined;
  }
}

export async function sendAdminCards(orderId: number) {
  const recipients = notifyRecipients();
  for (const { chat_id, message_id } of getOrderMessages(orderId)) {
    await safe(() => bot.api.deleteMessage(chat_id, message_id));
  }
  for (const chatId of recipients) await saveCardFor(orderId, chatId);
}

export async function saveCardFor(orderId: number, chatId: number) {
  const order = load(orderId);
  const msg = await safe(() =>
    bot.api.sendMessage(chatId, adminOrderText(order), {
      parse_mode: "HTML",
      reply_markup: orderCardKeyboard(order),
      link_preview_options: { is_disabled: true },
    }),
  );
  if (msg) saveOrderMessage(orderId, chatId, msg.message_id);
}

export async function refreshAdminCards(orderId: number) {
  const order = load(orderId);
  for (const { chat_id, message_id } of getOrderMessages(orderId)) {
    await safe(() =>
      bot.api.editMessageText(chat_id, message_id, adminOrderText(order), {
        parse_mode: "HTML",
        reply_markup: orderCardKeyboard(order),
        link_preview_options: { is_disabled: true },
      }),
    );
  }
}

async function tellClient(order: OrderFull, text: string, keyboard?: InlineKeyboard) {
  await safe(() =>
    bot.api.sendMessage(order.user_id, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    }),
  );
}

export function paymentText(order: OrderFull): string {
  const details = getSetting("payment_details").trim();
  return [
    `Сумма к оплате: <b>${money(order.total)}</b>`,
    details ? `\nРеквизиты:\n${escapeHtml(details)}` : "\nРеквизиты шеф пришлёт в личные сообщения.",
    "\nПосле перевода нажмите «Я оплатил» 👇",
  ].join("\n");
}

export const paidButton = (orderId: number) =>
  new InlineKeyboard().text("💳 Я оплатил", `c:paid:${orderId}`).row().text("Отменить заказ", `c:cx:${orderId}`);

export async function submitOrder(userId: number, draft: CheckoutDraft): Promise<OrderFull> {
  const lines = getCart(userId);
  if (lines.length === 0) throw new OrderFlowError("Корзина пуста");
  const orderId = createOrder({
    userId,
    lines,
    slotId: draft.slotId ?? null,
    requestedAt: draft.requestedAt ?? null,
    requestedNote: draft.note ?? null,
    comment: draft.comment ?? null,
  });
  clearCart(userId);
  await sendAdminCards(orderId);
  return load(orderId);
}

export async function scheduleOrder(orderId: number, at: string) {
  const order = load(orderId);
  expect(order, ["new", "awaiting_payment", "payment_check", "paid"]);
  const isFirstConfirm = order.status === "new";
  updateOrder(orderId, {
    scheduled_at: at,
    status: isFirstConfirm ? "awaiting_payment" : order.status,
    pickup_reminded: 0,
  });
  const updated = load(orderId);

  if (isFirstConfirm) {
    const address = getSetting("pickup_address").trim();
    const lines = [`✅ Шеф принял заказ #${orderId} и поставил его на <b>${humanDateTime(at)}</b>.`];
    if (address) lines.push(`📍 Самовывоз: ${escapeHtml(address)}`);
    lines.push("", paymentText(updated));
    await tellClient(updated, lines.join("\n"), paidButton(orderId));
  } else {
    await tellClient(updated, `🕐 Шеф перенёс заказ #${orderId} на <b>${humanDateTime(at)}</b>.`);
  }
  await refreshAdminCards(orderId);
  return updated;
}

export async function clientMarkedPaid(orderId: number, userId: number) {
  const order = load(orderId);
  if (order.user_id !== userId) throw new OrderFlowError("Это не ваш заказ");
  expect(order, ["awaiting_payment"]);
  updateOrder(orderId, { status: "payment_check" });
  await sendAdminCards(orderId);
  return load(orderId);
}

export async function confirmPayment(orderId: number) {
  const order = load(orderId);
  expect(order, ["awaiting_payment", "payment_check"]);
  updateOrder(orderId, { status: "paid" });
  const updated = load(orderId);
  const when = updated.scheduled_at ? ` Ждём вас ${humanDateTime(updated.scheduled_at)}.` : "";
  await tellClient(updated, `💚 Оплата по заказу #${orderId} получена, шеф начинает готовить!${when}`);
  await refreshAdminCards(orderId);
  return updated;
}

export async function rejectPayment(orderId: number) {
  const order = load(orderId);
  expect(order, ["payment_check"]);
  updateOrder(orderId, { status: "awaiting_payment" });
  const updated = load(orderId);
  await tellClient(
    updated,
    `🤔 Шеф пока не видит оплату по заказу #${orderId}. Проверьте, пожалуйста, перевод.\n\n${paymentText(updated)}`,
    paidButton(orderId),
  );
  await refreshAdminCards(orderId);
  return updated;
}

export async function markReady(orderId: number) {
  const order = load(orderId);
  expect(order, ["paid"]);
  updateOrder(orderId, { status: "ready" });
  const updated = load(orderId);
  const address = getSetting("pickup_address").trim();
  await tellClient(
    updated,
    `📦 Заказ #${orderId} готов, можно забирать!${address ? `\n📍 ${escapeHtml(address)}` : ""}`,
  );
  await refreshAdminCards(orderId);
  return updated;
}

export async function markDone(orderId: number) {
  const order = load(orderId);
  expect(order, ["ready", "paid"]);
  updateOrder(orderId, { status: "done" });
  const updated = load(orderId);
  await tellClient(
    updated,
    "Спасибо за заказ! Приятного аппетита 🤍\nБудем рады видеть вас снова.",
    new InlineKeyboard().text("🔁 Повторить заказ", `c:repeat:${orderId}`).row().text("📖 Меню", "c:menu"),
  );
  await refreshAdminCards(orderId);
  return updated;
}

export async function cancelByAdmin(orderId: number) {
  const order = load(orderId);
  expect(order, ["new", "awaiting_payment", "payment_check", "paid", "ready"]);
  updateOrder(orderId, { status: "cancelled" });
  const updated = load(orderId);
  await tellClient(updated, `Заказ #${orderId} отменён шефом. Если остались вопросы — напишите шефу в личку.`);
  await refreshAdminCards(orderId);
  return updated;
}

export async function cancelByClient(orderId: number, userId: number) {
  const order = load(orderId);
  if (order.user_id !== userId) throw new OrderFlowError("Это не ваш заказ");
  expect(order, ["new", "awaiting_payment"]);
  updateOrder(orderId, { status: "cancelled" });
  await sendAdminCards(orderId);
  return load(orderId);
}
