import { Composer, InlineKeyboard, type Context } from "grammy";
import { cartLineLabel, cartTotal, getCart } from "../../db/cart.js";
import { getSlot, isSlotFree, listBookableSlots } from "../../db/slots.js";
import { clearState, getState, setState, type CheckoutDraft } from "../../db/state.js";
import { escapeHtml, money } from "../../lib/format.js";
import { humanDateTime, nowLocal, shortDay, timeSteps } from "../../lib/time.js";
import { OrderFlowError, submitOrder } from "../../services/orders.js";
import { cookName } from "../../db/settings.js";
import { addButton, answer, mainStyle, showText } from "../ui.js";
import { showCart } from "./cart.js";

export const checkout = new Composer();

function draftOf(userId: number): CheckoutDraft {
  const state = getState(userId);
  return state?.state === "checkout" ? state.data : {};
}

function saveDraft(userId: number, draft: CheckoutDraft) {
  setState(userId, { state: "checkout", data: draft });
}

async function askWhen(ctx: Context) {
  const userId = ctx.from!.id;
  if (getCart(userId).length === 0) {
    await showCart(ctx);
    return;
  }
  const slots = listBookableSlots();
  if (slots.length === 0) {
    saveDraft(userId, { awaiting: "note" });
    await showText(
      ctx,
      `Свободных окошек в расписании пока нет.\n\n✍️ Напишите, когда вам было бы удобно забрать заказ (например: «в субботу после 18:00») — ${cookName().name} согласует время.`,
      new InlineKeyboard().text("« Корзина", "c:cart"),
    );
    return;
  }
  saveDraft(userId, {});
  const kb = new InlineKeyboard();
  for (const s of slots) kb.text(`${shortDay(s.date)} · ${s.start_time}–${s.end_time}`, `co:s:${s.id}`).row();
  kb.text("📅 Другая дата", "co:other").row().text("« Корзина", "c:cart");
  await showText(ctx, "<b>Когда вам удобно забрать заказ?</b>\nВыберите удобное окошко 👇", kb);
}

async function askComment(ctx: Context, draft: CheckoutDraft) {
  saveDraft(ctx.from!.id, { ...draft, awaiting: "comment" });
  await showText(
    ctx,
    "Добавите комментарий к заказу?\n✍️ Напишите его сообщением (например: «без лука», «нужен торт на 8 человек»).",
    new InlineKeyboard().text("Без комментария →", "co:nc").row().text("« Изменить время", "co:start"),
  );
}

async function showSummary(ctx: Context, draft: CheckoutDraft) {
  const userId = ctx.from!.id;
  saveDraft(userId, { ...draft, awaiting: undefined });
  const lines = getCart(userId);
  if (lines.length === 0) {
    await showCart(ctx);
    return;
  }
  const when = draft.requestedAt ? humanDateTime(draft.requestedAt) : `«${escapeHtml(draft.note ?? "")}»`;
  const parts = [
    "<b>Проверьте заказ</b>",
    "",
    ...lines.map((l) => `• ${escapeHtml(cartLineLabel(l))} × ${l.qty} — ${money(l.price * l.qty)}`),
    "",
    `<b>Итого: ${money(cartTotal(lines))}</b>`,
    `🗓 Когда: ${when}`,
  ];
  if (draft.comment) parts.push(`💬 ${escapeHtml(draft.comment)}`);
  parts.push("", `После подтверждения заказ уйдёт ${cookName().dative}. Когда время будет подтверждено, я пришлю реквизиты для оплаты.`);
  const text = parts.join("\n");
  await showText(
    ctx,
    text,
    addButton(new InlineKeyboard(), { text: "✅ Подтвердить заказ", data: "co:ok", style: mainStyle() })
      .row()
      .text("🕐 Изменить время", "co:start")
      .text("💬 Комментарий", "co:comment")
      .row()
      .text("« Корзина", "c:cart"),
  );
}

checkout.callbackQuery("co:start", async (ctx) => {
  await answer(ctx);
  await askWhen(ctx);
});

checkout.callbackQuery(/^co:s:(\d+)$/, async (ctx) => {
  const slot = getSlot(Number(ctx.match[1]));
  if (!slot || !isSlotFree(slot)) {
    await answer(ctx, "Это окошко уже занято, выберите другое", true);
    await askWhen(ctx);
    return;
  }
  await answer(ctx);
  const now = nowLocal();
  const times = timeSteps(slot.start_time, slot.end_time).filter((t) => `${slot.date} ${t}` > now);
  const kb = new InlineKeyboard();
  times.forEach((t, i) => {
    kb.text(t, `co:t:${slot.id}:${t.replace(":", "")}`);
    if (i % 4 === 3) kb.row();
  });
  kb.row().text("« Другое окошко", "co:start");
  await showText(ctx, `<b>${shortDay(slot.date)}</b>, окошко ${slot.start_time}–${slot.end_time}\nВо сколько удобно забрать?`, kb);
});

checkout.callbackQuery(/^co:t:(\d+):(\d{4})$/, async (ctx) => {
  const slot = getSlot(Number(ctx.match[1]));
  if (!slot) {
    await answer(ctx, "Окошко больше недоступно", true);
    await askWhen(ctx);
    return;
  }
  await answer(ctx);
  const time = `${ctx.match[2].slice(0, 2)}:${ctx.match[2].slice(2)}`;
  const draft = draftOf(ctx.from.id);
  await askComment(ctx, { comment: draft.comment, slotId: slot.id, requestedAt: `${slot.date} ${time}` });
});

checkout.callbackQuery("co:other", async (ctx) => {
  await answer(ctx);
  saveDraft(ctx.from.id, { ...draftOf(ctx.from.id), awaiting: "note" });
  await showText(
    ctx,
    `✍️ Напишите, когда вам было бы удобно забрать заказ (например: «в пятницу после 18:00»). ${cookName().name} посмотрит и предложит время.`,
    new InlineKeyboard().text("« Назад", "co:start"),
  );
});

checkout.callbackQuery("co:nc", async (ctx) => {
  await answer(ctx);
  await showSummary(ctx, { ...draftOf(ctx.from.id), comment: undefined });
});

checkout.callbackQuery("co:comment", async (ctx) => {
  await answer(ctx);
  await askComment(ctx, draftOf(ctx.from.id));
});

checkout.callbackQuery("co:ok", async (ctx) => {
  const userId = ctx.from.id;
  const draft = draftOf(userId);
  if (!draft.requestedAt && !draft.note) {
    await answer(ctx);
    await askWhen(ctx);
    return;
  }
  if (draft.slotId) {
    const slot = getSlot(draft.slotId);
    if (!slot || !isSlotFree(slot)) {
      await answer(ctx, "Пока вы оформляли, окошко заняли 😔 Выберите другое", true);
      await askWhen(ctx);
      return;
    }
  }
  try {
    const order = await submitOrder(userId, draft);
    clearState(userId);
    await answer(ctx, "Заказ отправлен!");
    await showText(
      ctx,
      `🎉 <b>Заказ #${order.id} отправлен ${cookName().dative}!</b>\n\nКак только время будет подтверждено, я пришлю реквизиты для оплаты.`,
      new InlineKeyboard().text("📦 Мои заказы", "c:orders"),
    );
  } catch (err) {
    if (!(err instanceof OrderFlowError)) throw err;
    await answer(ctx, err.message, true);
    await showCart(ctx);
  }
});

checkout.on("message:text", async (ctx, next) => {
  const state = getState(ctx.from.id);
  if (state?.state !== "checkout" || !state.data.awaiting || ctx.message.text.startsWith("/")) return next();
  const text = ctx.message.text.trim().slice(0, 500);
  if (state.data.awaiting === "note") {
    await askComment(ctx, { ...state.data, slotId: undefined, requestedAt: undefined, note: text });
  } else {
    await showSummary(ctx, { ...state.data, comment: text });
  }
});
