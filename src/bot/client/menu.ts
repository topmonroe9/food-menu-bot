import { Composer, GrammyError, InlineKeyboard, InputFile, type Context } from "grammy";
import { InputMediaBuilder } from "grammy";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../config.js";
import { cacheDishFileId, listVisibleCategories, listVisibleDishes, variantLabel, type DishWithVariants } from "../../db/menu.js";
import { cartQty, cartTotal, getCart, changeCartQty } from "../../db/cart.js";
import { escapeHtml, money } from "../../lib/format.js";
import { answer, BTN_MENU, showText } from "../ui.js";

export const menu = new Composer();

function cartButtonLabel(userId: number): string {
  const lines = getCart(userId);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  return count > 0 ? `🛒 Корзина (${count}) · ${money(cartTotal(lines))}` : "🛒 Корзина";
}

export async function showCategories(ctx: Context, fresh = false) {
  const categories = listVisibleCategories();
  if (categories.length === 0) {
    await showText(ctx, "Меню пока пустое — шеф скоро его заполнит 🙌", undefined, fresh);
    return;
  }
  const kb = new InlineKeyboard();
  for (const c of categories) kb.text(`${c.title} · ${c.dishes_count}`, `m:${c.id}:0`).row();
  kb.text(cartButtonLabel(ctx.from!.id), "c:cart");
  await showText(ctx, "<b>Меню</b>\nВыберите раздел 👇", kb, fresh);
}

function caption(dish: DishWithVariants): string {
  const lines = [`<b>${escapeHtml(dish.title)}</b>`];
  if (dish.description) lines.push("", escapeHtml(dish.description));
  lines.push("");
  for (const v of dish.variants) {
    const label = variantLabel(v);
    lines.push(label ? `• ${escapeHtml(label)} — <b>${money(v.price)}</b>` : `<b>${money(v.price)}</b>`);
  }
  return lines.join("\n");
}

function dishKeyboard(userId: number, dish: DishWithVariants, categoryId: number, index: number, total: number) {
  const kb = new InlineKeyboard();
  for (const v of dish.variants) {
    const qty = cartQty(userId, v.id);
    const label = variantLabel(v) || "В корзину";
    const ref = `${v.id}:${categoryId}:${index}`;
    if (qty > 0) {
      kb.text("➖", `v:-:${ref}`).text(`✅ ${label} × ${qty}`, `v:+:${ref}`).text("➕", `v:+:${ref}`).row();
    } else {
      kb.text(`➕ ${label} · ${money(v.price)}`, `v:+:${ref}`).row();
    }
  }
  if (total > 1) {
    kb.text("◀️", `m:${categoryId}:${(index - 1 + total) % total}`)
      .text(`${index + 1} / ${total}`, "noop")
      .text("▶️", `m:${categoryId}:${(index + 1) % total}`)
      .row();
  }
  kb.text("« Разделы", "c:menu").text(cartButtonLabel(userId), "c:cart");
  return kb;
}

function photoSource(dish: DishWithVariants): string | InputFile | null {
  if (dish.photo_file_id) return dish.photo_file_id;
  if (dish.photo_path) {
    const path = join(config.dataDir, "media", dish.photo_path);
    if (existsSync(path)) return new InputFile(path);
  }
  return null;
}

function rememberFileId(dish: DishWithVariants, message: { photo?: { file_id: string }[] } | true | undefined) {
  if (dish.photo_file_id || !message || message === true || !message.photo?.length) return;
  cacheDishFileId(dish.id, message.photo[message.photo.length - 1].file_id);
}

export async function showDish(ctx: Context, categoryId: number, index: number) {
  const dishes = listVisibleDishes(categoryId);
  if (dishes.length === 0) {
    await showCategories(ctx);
    return;
  }
  const i = Math.min(Math.max(index, 0), dishes.length - 1);
  const dish = dishes[i];
  const kb = dishKeyboard(ctx.from!.id, dish, categoryId, i, dishes.length);
  const photo = photoSource(dish);
  const current = ctx.callbackQuery?.message;

  if (!photo) {
    await showText(ctx, caption(dish), kb);
    return;
  }

  if (current && "photo" in current && current.photo) {
    try {
      const edited = await ctx.editMessageMedia(
        InputMediaBuilder.photo(photo, { caption: caption(dish), parse_mode: "HTML" }),
        { reply_markup: kb },
      );
      rememberFileId(dish, edited);
      return;
    } catch (err) {
      if (err instanceof GrammyError && /not modified/.test(err.description)) return;
      console.error("editMessageMedia failed, resending:", err instanceof GrammyError ? err.description : err);
    }
  }
  if (current) await ctx.deleteMessage().catch(() => undefined);
  const sent = await ctx.replyWithPhoto(photo, { caption: caption(dish), parse_mode: "HTML", reply_markup: kb });
  rememberFileId(dish, sent);
}

menu.hears(BTN_MENU, (ctx) => showCategories(ctx));
menu.command("menu", (ctx) => showCategories(ctx));

// broadcast messages keep their content, so the menu opens below them
menu.callbackQuery("c:menu:new", async (ctx) => {
  await answer(ctx);
  await showCategories(ctx, true);
});

menu.callbackQuery("c:menu", async (ctx) => {
  await answer(ctx);
  await showCategories(ctx);
});

menu.callbackQuery(/^m:(\d+):(\d+)$/, async (ctx) => {
  await answer(ctx);
  await showDish(ctx, Number(ctx.match[1]), Number(ctx.match[2]));
});

menu.callbackQuery(/^v:([+-]):(\d+):(\d+):(\d+)$/, async (ctx) => {
  const [, sign, variantId, categoryId, index] = ctx.match;
  const userId = ctx.from.id;
  changeCartQty(userId, Number(variantId), sign === "+" ? 1 : -1);
  await answer(ctx, sign === "+" ? "Добавлено в корзину" : "Убрано из корзины");

  const dishes = listVisibleDishes(Number(categoryId));
  const found = dishes.findIndex((d) => d.variants.some((v) => v.id === Number(variantId)));
  const position = found >= 0 ? found : Number(index);
  const dish = dishes[position];
  if (!dish) return;
  await ctx
    .editMessageReplyMarkup({ reply_markup: dishKeyboard(userId, dish, Number(categoryId), position, dishes.length) })
    .catch(() => undefined);
});

menu.callbackQuery("noop", (ctx) => answer(ctx));
