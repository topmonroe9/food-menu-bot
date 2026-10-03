import { GrammyError, InlineKeyboard, Keyboard, type Context } from "grammy";
import { config } from "../config.js";
import { isAdmin } from "../db/admins.js";

export const BTN_MENU = "📖 Меню";
export const BTN_CART = "🛒 Корзина";
export const BTN_ORDERS = "📦 Мои заказы";
export const BTN_ADMIN = "⚙️ Админка";

export function adminUrl(): string | null {
  return config.webAppUrl.startsWith("https://") ? `${config.webAppUrl}/admin/` : null;
}

export function mainKeyboard(userId: number): Keyboard {
  const kb = new Keyboard().text(BTN_MENU).text(BTN_CART).row().text(BTN_ORDERS);
  const url = adminUrl();
  if (isAdmin(userId) && url) kb.webApp(BTN_ADMIN, url);
  return kb.resized().persistent();
}

function isMessageGone(err: unknown) {
  return err instanceof GrammyError && /message to (delete|edit) not found|message can't be/.test(err.description);
}

export async function showText(ctx: Context, text: string, keyboard?: InlineKeyboard, fresh = false) {
  const message = fresh ? undefined : ctx.callbackQuery?.message;
  const options = { parse_mode: "HTML" as const, reply_markup: keyboard, link_preview_options: { is_disabled: true } };
  if (message && "text" in message && message.text !== undefined) {
    try {
      await ctx.editMessageText(text, options);
      return;
    } catch (err) {
      if (err instanceof GrammyError && /not modified/.test(err.description)) return;
      if (!isMessageGone(err)) throw err;
    }
  } else if (message) {
    await ctx.deleteMessage().catch(() => undefined);
  }
  await ctx.reply(text, options);
}

export async function answer(ctx: Context, text?: string, alert = false) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text, show_alert: alert }).catch(() => undefined);
}
