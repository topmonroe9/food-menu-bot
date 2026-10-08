import { GrammyError, InlineKeyboard, Keyboard, type Context } from "grammy";
import { config } from "../config.js";
import { isAdmin } from "../db/admins.js";
import { getSetting } from "../db/settings.js";
import { toButtonStyle, type ButtonStyle } from "../lib/buttons.js";

export const BTN_MENU = "📖 Меню";
export const BTN_CART = "🛒 Корзина";
export const BTN_ORDERS = "📦 Мои заказы";
export const BTN_ADMIN = "⚙️ Админка";

export function adminUrl(): string | null {
  return config.webAppUrl.startsWith("https://") ? `${config.webAppUrl}/admin/` : null;
}

export function siteUrl(): string | null {
  return config.webAppUrl ? `${config.webAppUrl}/` : null;
}

export function whatsappShareUrl(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`Наше меню, заказать можно прямо на сайте 👇\n${url}`)}`;
}

export function mainKeyboard(userId: number): Keyboard {
  const kb = new Keyboard().text(BTN_MENU).text(BTN_CART).row().text(BTN_ORDERS);
  // a web_app keyboard button opens the mini app without initData, so the api can't tell who it is.
  // a plain button opens the panel instead, and its inline button launches the mini app properly
  if (isAdmin(userId)) kb.text(BTN_ADMIN);
  return kb.resized().persistent();
}

export interface StyledButton {
  text: string;
  data: string;
  style?: ButtonStyle;
}

export function addButton(kb: InlineKeyboard, button: StyledButton): InlineKeyboard {
  return kb.text(button.style ? { text: button.text, style: button.style } : button.text, button.data);
}

// telegram widens the keyboard to fit its labels, two short ones still fit a phone screen side by side
const PAIR_LABEL_MAX = 17;

// starts a row unless the current one is still empty, so keyboards never get blank rows
export function newRow(kb: InlineKeyboard): InlineKeyboard {
  return kb.inline_keyboard.at(-1)?.length ? kb.row() : kb;
}

export function addGrid(kb: InlineKeyboard, buttons: StyledButton[]) {
  const short = (b: StyledButton | undefined) => !!b && [...b.text].length <= PAIR_LABEL_MAX;
  for (let i = 0; i < buttons.length; ) {
    const size = short(buttons[i]) && short(buttons[i + 1]) ? 2 : 1;
    newRow(kb);
    for (const button of buttons.slice(i, i + size)) addButton(kb, button);
    i += size;
  }
}

export function addNumbers(kb: InlineKeyboard, buttons: StyledButton[], perRow: number) {
  buttons.forEach((button, i) => {
    if (i % perRow === 0) newRow(kb);
    addButton(kb, button);
  });
}

// the one button on a screen that moves the order forward: cart, checkout, confirm
export function mainStyle(): ButtonStyle {
  return toButtonStyle(getSetting("main_button_style"));
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
