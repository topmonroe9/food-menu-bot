import { Composer, InlineKeyboard, type Context } from "grammy";
import { getOrder, listUserOrders, STATUS_LABEL, type OrderFull } from "../../db/orders.js";
import { changeCartQty } from "../../db/cart.js";
import { getVariant } from "../../db/menu.js";
import { money } from "../../lib/format.js";
import { shortDateTime } from "../../lib/time.js";
import { cancelByClient, clientMarkedPaid, OrderFlowError, paidButton, paymentText } from "../../services/orders.js";
import { clientOrderText } from "../../services/orderText.js";
import { answer, BTN_ORDERS, showText } from "../ui.js";
import { showCart } from "./cart.js";

export const orders = new Composer();

async function showOrders(ctx: Context) {
  const list = listUserOrders(ctx.from!.id, 8);
  if (list.length === 0) {
    await showText(ctx, "У вас пока нет заказов.", new InlineKeyboard().text("📖 Открыть меню", "c:menu"));
    return;
  }
  const kb = new InlineKeyboard();
  for (const o of list) {
    const when = o.scheduled_at ? shortDateTime(o.scheduled_at) : o.created_at.slice(0, 10).split("-").reverse().join(".");
    kb.text(`#${o.id} · ${STATUS_LABEL[o.status]} · ${when} · ${money(o.total)}`, `c:o:${o.id}`).row();
  }
  await showText(ctx, "<b>Ваши заказы</b>", kb);
}

function orderKeyboard(order: OrderFull): InlineKeyboard {
  if (order.status === "awaiting_payment") return paidButton(order.id).row().text("« Мои заказы", "c:orders");
  const kb = new InlineKeyboard();
  if (order.status === "new") kb.text("Отменить заказ", `c:cx:${order.id}`).row();
  kb.text("🔁 Повторить заказ", `c:repeat:${order.id}`).row().text("« Мои заказы", "c:orders");
  return kb;
}

function ownOrder(ctx: Context, id: number): OrderFull | undefined {
  const order = getOrder(id);
  return order && order.user_id === ctx.from!.id ? order : undefined;
}

orders.hears(BTN_ORDERS, showOrders);
orders.command("orders", showOrders);

orders.callbackQuery("c:orders", async (ctx) => {
  await answer(ctx);
  await showOrders(ctx);
});

orders.callbackQuery(/^c:o:(\d+)$/, async (ctx) => {
  const order = ownOrder(ctx, Number(ctx.match[1]));
  await answer(ctx);
  if (!order) return;
  const text = order.status === "awaiting_payment" ? `${clientOrderText(order)}\n\n${paymentText(order)}` : clientOrderText(order);
  await showText(ctx, text, orderKeyboard(order));
});

orders.callbackQuery(/^c:paid:(\d+)$/, async (ctx) => {
  try {
    const order = await clientMarkedPaid(Number(ctx.match[1]), ctx.from.id);
    await answer(ctx, "Спасибо! Передал шефу");
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await ctx.reply(`🙏 Спасибо! Шеф проверит поступление по заказу #${order.id} и подтвердит оплату.`);
  } catch (err) {
    if (!(err instanceof OrderFlowError)) throw err;
    await answer(ctx, err.message, true);
  }
});

orders.callbackQuery(/^c:cx:(\d+)$/, async (ctx) => {
  await answer(ctx);
  const id = Number(ctx.match[1]);
  await ctx
    .editMessageReplyMarkup({
      reply_markup: new InlineKeyboard().text("Да, отменить", `c:cxy:${id}`).row().text("Нет, оставить", `c:o:${id}`),
    })
    .catch(() => undefined);
});

orders.callbackQuery(/^c:cxy:(\d+)$/, async (ctx) => {
  try {
    const order = await cancelByClient(Number(ctx.match[1]), ctx.from.id);
    await answer(ctx, "Заказ отменён");
    await showText(ctx, clientOrderText(order), orderKeyboard(order));
  } catch (err) {
    if (!(err instanceof OrderFlowError)) throw err;
    await answer(ctx, err.message, true);
  }
});

orders.callbackQuery(/^c:repeat:(\d+)$/, async (ctx) => {
  const order = ownOrder(ctx, Number(ctx.match[1]));
  if (!order) return answer(ctx);
  let missing = 0;
  for (const item of order.items) {
    const variant = item.variant_id ? getVariant(item.variant_id) : undefined;
    if (!variant || variant.is_deleted || !variant.is_available) {
      missing++;
      continue;
    }
    changeCartQty(ctx.from.id, variant.id, item.qty);
  }
  await answer(ctx, "Добавил в корзину");
  const note = missing > 0 ? "⚠️ Некоторых блюд из того заказа сейчас нет в меню.\n\n" : "";
  await showCart(ctx, note);
});
