import { Composer, InlineKeyboard, type Context } from "grammy";
import { isAdmin } from "../../db/admins.js";
import { getOrder, listOrders, ordersCountByStatus, STATUS_LABEL } from "../../db/orders.js";
import { clearState, getState, setState } from "../../db/state.js";
import { displayName } from "../../db/users.js";
import { money } from "../../lib/format.js";
import { humanDateTime, parseUserDateTime, shortDateTime } from "../../lib/time.js";
import {
  cancelByAdmin,
  confirmPayment,
  markDone,
  markReady,
  OrderFlowError,
  rejectPayment,
  saveCardFor,
  scheduleOrder,
} from "../../services/orders.js";
import { adminUrl, answer, BTN_ADMIN } from "../ui.js";
import { cancelConfirmKeyboard, dayPickerKeyboard, expandDate, orderCardKeyboard, timePickerKeyboard } from "./keyboards.js";

export const adminComposer = new Composer();
const admin = adminComposer.filter((ctx) => !!ctx.from && isAdmin(ctx.from.id));

async function run(ctx: Context, action: () => Promise<unknown>, done: string) {
  try {
    await action();
    await answer(ctx, done);
  } catch (err) {
    if (!(err instanceof OrderFlowError)) throw err;
    await answer(ctx, err.message, true);
  }
}

async function showPanel(ctx: Context) {
  const counts = ordersCountByStatus();
  const text = [
    "<b>Панель заказов</b>",
    "",
    `🆕 Новых: ${counts.new ?? 0}`,
    `🔎 Проверить оплату: ${counts.payment_check ?? 0}`,
    `💳 Ждут оплату: ${counts.awaiting_payment ?? 0}`,
    `👩‍🍳 Готовятся: ${counts.paid ?? 0}`,
    `📦 Готовы к выдаче: ${counts.ready ?? 0}`,
  ].join("\n");
  const kb = new InlineKeyboard();
  const url = adminUrl();
  if (url) kb.webApp("⚙️ Открыть админку", url).row();
  kb.text("📋 Активные заказы", "a:list").text("📣 Рассылка", "a:broadcast");
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

admin.command("admin", showPanel);
admin.hears(BTN_ADMIN, showPanel);

admin.callbackQuery("a:list", async (ctx) => {
  await answer(ctx);
  const list = listOrders("active", 30);
  if (list.length === 0) {
    await ctx.reply("Активных заказов нет 🎉");
    return;
  }
  const kb = new InlineKeyboard();
  for (const o of list) {
    const when = o.scheduled_at ? shortDateTime(o.scheduled_at) : "время ?";
    kb.text(`#${o.id} ${STATUS_LABEL[o.status]} · ${when} · ${displayName(o)} · ${money(o.total)}`, `a:show:${o.id}`).row();
  }
  await ctx.reply("<b>Активные заказы</b> (сначала требующие действия)", { parse_mode: "HTML", reply_markup: kb });
});

admin.callbackQuery(/^a:show:(\d+)$/, async (ctx) => {
  await answer(ctx);
  await saveCardFor(Number(ctx.match[1]), ctx.from.id);
});

admin.callbackQuery(/^a:card:(\d+)$/, async (ctx) => {
  await answer(ctx);
  const order = getOrder(Number(ctx.match[1]));
  if (order) await ctx.editMessageReplyMarkup({ reply_markup: orderCardKeyboard(order) }).catch(() => undefined);
});

admin.callbackQuery(/^a:ok:(\d+)$/, async (ctx) => {
  const order = getOrder(Number(ctx.match[1]));
  if (!order?.requested_at) return answer(ctx, "Клиент не выбрал точное время", true);
  await run(ctx, () => scheduleOrder(order.id, order.requested_at!), "Время подтверждено, клиенту ушли реквизиты");
});

admin.callbackQuery(/^a:time:(\d+)$/, async (ctx) => {
  await answer(ctx);
  await ctx.editMessageReplyMarkup({ reply_markup: dayPickerKeyboard(Number(ctx.match[1])) }).catch(() => undefined);
});

admin.callbackQuery(/^a:day:(\d+):(\d{8})$/, async (ctx) => {
  await answer(ctx);
  await ctx
    .editMessageReplyMarkup({ reply_markup: timePickerKeyboard(Number(ctx.match[1]), expandDate(ctx.match[2])) })
    .catch(() => undefined);
});

admin.callbackQuery(/^a:at:(\d+):(\d{8}):(\d{4})$/, async (ctx) => {
  const at = `${expandDate(ctx.match[2])} ${ctx.match[3].slice(0, 2)}:${ctx.match[3].slice(2)}`;
  await run(ctx, () => scheduleOrder(Number(ctx.match[1]), at), `Назначено: ${shortDateTime(at)}`);
});

admin.callbackQuery(/^a:custom:(\d+)$/, async (ctx) => {
  await answer(ctx);
  setState(ctx.from.id, { state: "admin_custom_time", data: { orderId: Number(ctx.match[1]) } });
  await ctx.reply(`Напишите дату и время для заказа #${ctx.match[1]} в формате <code>12.10 17:30</code>`, {
    parse_mode: "HTML",
  });
});

admin.callbackQuery(/^a:paid:(\d+)$/, (ctx) =>
  run(ctx, () => confirmPayment(Number(ctx.match[1])), "Оплата подтверждена, клиент получил уведомление"),
);
admin.callbackQuery(/^a:nopay:(\d+)$/, (ctx) =>
  run(ctx, () => rejectPayment(Number(ctx.match[1])), "Клиенту отправлена просьба проверить перевод"),
);
admin.callbackQuery(/^a:ready:(\d+)$/, (ctx) => run(ctx, () => markReady(Number(ctx.match[1])), "Клиенту сообщили, что заказ готов"));
admin.callbackQuery(/^a:done:(\d+)$/, (ctx) => run(ctx, () => markDone(Number(ctx.match[1])), "Заказ закрыт"));

admin.callbackQuery(/^a:cx:(\d+)$/, async (ctx) => {
  await answer(ctx);
  await ctx.editMessageReplyMarkup({ reply_markup: cancelConfirmKeyboard(Number(ctx.match[1])) }).catch(() => undefined);
});
admin.callbackQuery(/^a:cxy:(\d+)$/, (ctx) => run(ctx, () => cancelByAdmin(Number(ctx.match[1])), "Заказ отменён"));

admin.on("message:text", async (ctx, next) => {
  const state = getState(ctx.from.id);
  if (state?.state !== "admin_custom_time" || ctx.message.text.startsWith("/")) return next();
  const at = parseUserDateTime(ctx.message.text);
  if (!at) {
    await ctx.reply("Не понял дату 🙈 Пример: <code>12.10 17:30</code>", { parse_mode: "HTML" });
    return;
  }
  clearState(ctx.from.id);
  try {
    await scheduleOrder(state.data.orderId, at);
    await ctx.reply(`✅ Заказ #${state.data.orderId} назначен на ${humanDateTime(at)}`);
  } catch (err) {
    if (!(err instanceof OrderFlowError)) throw err;
    await ctx.reply(err.message);
  }
});
