import { Composer, GrammyError, InlineKeyboard, InputFile, type Context } from "grammy";
import { InputMediaBuilder } from "grammy";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../config.js";
import {
  cacheDishFileId,
  getCategory,
  getDish,
  getVariant,
  listVisibleCategories,
  listVisibleDishes,
  variantLabel,
  type Category,
  type DishWithVariants,
} from "../../db/menu.js";
import { cartQty, cartTotal, getCart, changeCartQty } from "../../db/cart.js";
import { getSetting } from "../../db/settings.js";
import { toButtonStyle } from "../../lib/buttons.js";
import { escapeHtml, money } from "../../lib/format.js";
import { addButton, addGrid, addNumbers, answer, BTN_MENU, mainStyle, newRow, showText, type StyledButton } from "../ui.js";

export const menu = new Composer();

const PAGE_SIZE = 8;
const DISHES_PER_ROW = 4;
const VARIANTS_PER_ROW = 6;
// more variants than this don't fit as named buttons, they get numbers like dishes in a section
const NAMED_VARIANTS_MAX = 4;
const CAPTION_LIMIT = 1024;

// an empty cart has nothing to show, so the button only appears once there is something to check out
function addCartRow(kb: InlineKeyboard, userId: number) {
  const lines = getCart(userId);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  if (count === 0) return;
  addButton(newRow(kb), { text: `🛒 Корзина (${count}) · ${money(cartTotal(lines))}`, data: "c:cart", style: mainStyle() });
}

export async function showCategories(ctx: Context, fresh = false) {
  const categories = listVisibleCategories();
  if (categories.length === 0) {
    await showText(ctx, "Меню пока пустое — скоро оно появится 🙌", undefined, fresh);
    return;
  }
  const kb = new InlineKeyboard();
  addGrid(
    kb,
    categories.map((c) => ({ text: `${c.title} · ${c.dishes_count}`, data: `m:${c.id}:0`, style: toButtonStyle(c.button_style) })),
  );
  addCartRow(kb, ctx.from!.id);
  await showText(ctx, "<b>Меню</b>\nВыберите раздел 👇", kb, fresh);
}

function priceLabel(dish: DishWithVariants): string {
  const prices = dish.variants.map((v) => v.price);
  const min = Math.min(...prices);
  return prices.every((p) => p === min) ? money(min) : `от ${money(min)}`;
}

// dish names are too long for buttons, so the text is the menu and the buttons only carry its numbers
export async function showCategory(ctx: Context, categoryId: number, page: number) {
  const category = getCategory(categoryId);
  const dishes = listVisibleDishes(categoryId);
  if (!category || dishes.length === 0) {
    await showCategories(ctx);
    return;
  }
  const userId = ctx.from!.id;
  const pages = Math.ceil(dishes.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pages - 1);
  const first = current * PAGE_SIZE;
  const inCart = new Map<number, number>();
  for (const l of getCart(userId)) inCart.set(l.dish_id, (inCart.get(l.dish_id) ?? 0) + l.qty);

  const lines = [`<b>${escapeHtml(category.title)}</b>`, ""];
  const numbers: StyledButton[] = [];
  dishes.slice(first, first + PAGE_SIZE).forEach((dish, i) => {
    const number = first + i + 1;
    const qty = inCart.get(dish.id) ?? 0;
    lines.push(`<b>${number}.</b> ${escapeHtml(dish.title)} — ${priceLabel(dish)}${qty > 0 ? ` · ✅ × ${qty}` : ""}`);
    numbers.push(qty > 0 ? { text: `✅ ${number}`, data: `d:${dish.id}`, style: "success" } : { text: `${number}`, data: `d:${dish.id}` });
  });
  lines.push("", "Нажмите на номер блюда 👇");

  const kb = new InlineKeyboard();
  addNumbers(kb, numbers, DISHES_PER_ROW);
  if (pages > 1) {
    newRow(kb);
    if (current > 0) kb.text("‹ Назад", `m:${categoryId}:${current - 1}`);
    kb.text(`стр. ${current + 1} из ${pages}`, "noop");
    if (current < pages - 1) kb.text("Дальше ›", `m:${categoryId}:${current + 1}`);
  }
  addCartRow(kb, userId);
  newRow(kb).text("« Все разделы", "c:menu");
  await showText(ctx, lines.join("\n"), kb);
}

function variantsView(dish: DishWithVariants) {
  const { variants } = dish;
  const named = variants.length > 1 && variants.every((v) => v.title);
  const sameWeight = named && variants.every((v) => v.weight === variants[0].weight);
  const samePrice = named && variants.every((v) => v.price === variants[0].price);
  return { numbered: variants.length > NAMED_VARIANTS_MAX, sameWeight, samePrice };
}

function caption(dish: DishWithVariants): string {
  const { numbered, sameWeight, samePrice } = variantsView(dish);
  // weight and price shared by every variant are said once instead of on every line
  const shared = sameWeight && samePrice;
  const lines = [`<b>${escapeHtml(dish.title)}</b>`];
  if (dish.description) lines.push("", escapeHtml(dish.description));
  lines.push("");
  if (shared) lines.push(`<b>${[escapeHtml(dish.variants[0].weight), money(dish.variants[0].price)].filter(Boolean).join(" — ")}</b>`, "");
  dish.variants.forEach((v, i) => {
    const label = escapeHtml(shared ? v.title : variantLabel(v));
    const mark = numbered ? `<b>${i + 1}.</b>` : "•";
    if (shared) lines.push(`${mark} ${label}`);
    else lines.push(label ? `${mark} ${label} — <b>${money(v.price)}</b>` : `<b>${money(v.price)}</b>`);
  });
  const target = numbered ? "на номер варианта" : dish.variants.length > 1 ? "на вариант" : "кнопку";
  lines.push("", `Нажмите ${target}, чтобы добавить в корзину 👇`);
  return lines.join("\n");
}

function dishKeyboard(userId: number, dish: DishWithVariants, category: Category, page: number) {
  const kb = new InlineKeyboard();
  const style = toButtonStyle(getSetting("variant_button_style"));
  const { numbered, sameWeight, samePrice } = variantsView(dish);
  const qty = new Map(dish.variants.map((v) => [v.id, cartQty(userId, v.id)]));

  // green means "already in the cart" and tapping it adds one more, red takes one away
  if (numbered) {
    addNumbers(
      kb,
      dish.variants.map((v, i) =>
        qty.get(v.id) ? { text: `✅ ${i + 1}`, data: `v:+:${v.id}`, style: "success" } : { text: `${i + 1}`, data: `v:+:${v.id}`, style },
      ),
      VARIANTS_PER_ROW,
    );
    const removals: StyledButton[] = [];
    dish.variants.forEach((v, i) => {
      if (qty.get(v.id)) removals.push({ text: `➖ № ${i + 1} · ${qty.get(v.id)} шт`, data: `v:-:${v.id}`, style: "danger" });
    });
    addGrid(kb, removals);
  } else {
    let pending: StyledButton[] = [];
    const flush = () => {
      addGrid(kb, pending);
      pending = [];
    };
    for (const v of dish.variants) {
      const label = sameWeight ? v.title : variantLabel(v);
      if (qty.get(v.id)) {
        flush();
        addButton(newRow(kb), { text: "➖ Убрать", data: `v:-:${v.id}`, style: "danger" });
        addButton(kb, { text: `✅ ${label || "В корзине"} × ${qty.get(v.id)}`, data: `v:+:${v.id}`, style: "success" });
      } else {
        const name = label || "В корзину";
        pending.push({ text: samePrice ? `➕ ${name}` : `➕ ${name} · ${money(v.price)}`, data: `v:+:${v.id}`, style });
      }
    }
    flush();
  }
  addCartRow(kb, userId);
  newRow(kb).text(`« ${category.title}`, `m:${category.id}:${page}`);
  return kb;
}

// telegram refuses a photo with a longer caption, such a dish goes out as plain text
function fitsCaption(text: string): boolean {
  return text.replace(/<[^>]+>/g, "").length <= CAPTION_LIMIT;
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

// dish with only the variants a client can order, plus where to go back to
function findDish(dishId: number) {
  const stored = getDish(dishId);
  const category = stored && getCategory(stored.category_id);
  if (!stored || !category) return undefined;
  const dishes = listVisibleDishes(category.id);
  const index = dishes.findIndex((d) => d.id === dishId);
  return { category, dish: index >= 0 ? dishes[index] : undefined, page: Math.max(Math.floor(index / PAGE_SIZE), 0) };
}

export async function showDish(ctx: Context, dishId: number) {
  const found = findDish(dishId);
  if (!found) {
    await showCategories(ctx);
    return;
  }
  const { category, dish, page } = found;
  if (!dish) {
    await showCategory(ctx, category.id, 0);
    return;
  }
  const kb = dishKeyboard(ctx.from!.id, dish, category, page);
  const text = caption(dish);
  const photo = fitsCaption(text) ? photoSource(dish) : null;
  const current = ctx.callbackQuery?.message;

  if (!photo) {
    await showText(ctx, text, kb);
    return;
  }

  if (current && "photo" in current && current.photo) {
    try {
      const edited = await ctx.editMessageMedia(InputMediaBuilder.photo(photo, { caption: text, parse_mode: "HTML" }), {
        reply_markup: kb,
      });
      rememberFileId(dish, edited);
      return;
    } catch (err) {
      if (err instanceof GrammyError && /not modified/.test(err.description)) return;
      console.error("editMessageMedia failed, resending:", err instanceof GrammyError ? err.description : err);
    }
  }
  if (current) await ctx.deleteMessage().catch(() => undefined);
  const sent = await ctx.replyWithPhoto(photo, { caption: text, parse_mode: "HTML", reply_markup: kb });
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
  await showCategory(ctx, Number(ctx.match[1]), Number(ctx.match[2]));
});

menu.callbackQuery(/^d:(\d+)$/, async (ctx) => {
  await answer(ctx);
  await showDish(ctx, Number(ctx.match[1]));
});

// buttons sent before the dish list existed carry extra parts after the variant id
menu.callbackQuery(/^v:([+-]):(\d+)(?::\d+:\d+)?$/, async (ctx) => {
  const userId = ctx.from.id;
  const variant = getVariant(Number(ctx.match[2]));
  const found = variant && findDish(variant.dish_id);
  if (!variant || !found?.dish || variant.is_deleted || !variant.is_available) {
    await answer(ctx, "Этого варианта сейчас нет в меню", true);
    await showCategories(ctx);
    return;
  }
  changeCartQty(userId, variant.id, ctx.match[1] === "+" ? 1 : -1);
  const qty = cartQty(userId, variant.id);
  await answer(ctx, qty > 0 ? `В корзине: ${variantLabel(variant) || variant.dish_title} × ${qty}` : "Убрано из корзины");
  await ctx
    .editMessageReplyMarkup({ reply_markup: dishKeyboard(userId, found.dish, found.category, found.page) })
    .catch(() => undefined);
});

menu.callbackQuery("noop", (ctx) => answer(ctx));
