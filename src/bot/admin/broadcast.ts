import { Composer, type Context } from "grammy";
import { isAdmin } from "../../db/admins.js";
import { getBroadcast, updateBroadcast } from "../../db/broadcasts.js";
import { clearState, getState, setState } from "../../db/state.js";
import { confirmKeyboard, controlKeyboard, runBroadcast, startDraft } from "../../services/broadcast.js";
import { answer } from "../ui.js";

export const broadcastComposer = new Composer();
const admin = broadcastComposer.filter((ctx) => !!ctx.from && isAdmin(ctx.from.id));

export async function askBroadcast(ctx: Context) {
  setState(ctx.from!.id, { state: "broadcast_wait", data: {} });
  await ctx.reply(
    "📣 <b>Новая рассылка</b>\n\nПришлите сообщение, которое получат все пользователи бота: текст или фото/видео с подписью. Можно жирный, курсив, ссылки, эмодзи — всё как в обычном сообщении Telegram.\n\n/cancel — отмена",
    { parse_mode: "HTML" },
  );
}

admin.command("broadcast", askBroadcast);
admin.callbackQuery("a:broadcast", async (ctx) => {
  await answer(ctx);
  await askBroadcast(ctx);
});

admin.command("cancel", async (ctx, next) => {
  if (getState(ctx.from!.id)?.state !== "broadcast_wait") return next();
  clearState(ctx.from!.id);
  await ctx.reply("Рассылка отменена");
});

admin.on("message", async (ctx, next) => {
  if (getState(ctx.from.id)?.state !== "broadcast_wait") return next();
  const msg = ctx.message;
  if (msg.text?.startsWith("/")) return next();
  if (msg.media_group_id) {
    await ctx.reply("Альбомы пока не поддерживаются — пришлите одно фото с подписью 🙏");
    return;
  }
  clearState(ctx.from.id);
  await startDraft(ctx.from.id, ctx.chat.id, msg.message_id, msg.text ?? msg.caption ?? "[медиа]");
});

admin.callbackQuery(/^b:(btn|ask|back|go|cx):(\d+)$/, async (ctx) => {
  const [, action, rawId] = ctx.match;
  const b = getBroadcast(Number(rawId));
  if (!b || b.status !== "draft") return answer(ctx, "Эта рассылка уже отправлена или отменена", true);

  if (action === "btn") {
    updateBroadcast(b.id, { with_menu_button: b.with_menu_button ? 0 : 1 });
    await answer(ctx, b.with_menu_button ? "Кнопка убрана" : "Кнопка добавлена");
    await ctx.editMessageReplyMarkup({ reply_markup: controlKeyboard(getBroadcast(b.id)!) }).catch(() => undefined);
    return;
  }
  if (action === "ask") {
    await answer(ctx);
    await ctx.editMessageReplyMarkup({ reply_markup: confirmKeyboard(b) }).catch(() => undefined);
    return;
  }
  if (action === "back") {
    await answer(ctx);
    await ctx.editMessageReplyMarkup({ reply_markup: controlKeyboard(b) }).catch(() => undefined);
    return;
  }
  if (action === "cx") {
    updateBroadcast(b.id, { status: "cancelled" });
    await answer(ctx, "Отменено");
    await ctx.editMessageText("Рассылка отменена").catch(() => undefined);
    return;
  }
  await answer(ctx, "Запускаю рассылку");
  void runBroadcast(b.id).catch((err) => console.error("broadcast failed:", err));
});
