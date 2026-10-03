import { Composer, InlineKeyboard, type Context } from "grammy";
import { cartLineLabel, cartTotal, changeCartQty, clearCart, getCart } from "../../db/cart.js";
import { escapeHtml, money } from "../../lib/format.js";
import { answer, BTN_CART, showText } from "../ui.js";

export const cart = new Composer();

export async function showCart(ctx: Context, prefix = "") {
  const lines = getCart(ctx.from!.id);
  if (lines.length === 0) {
    await showText(
      ctx,
      `${prefix}Корзина пока пустая. Загляните в меню 👇`,
      new InlineKeyboard().text("📖 Открыть меню", "c:menu"),
    );
    return;
  }
  const text = [
    `${prefix}<b>Ваша корзина</b>`,
    "",
    ...lines.map((l) => `• ${escapeHtml(cartLineLabel(l))} × ${l.qty} — ${money(l.price * l.qty)}`),
    "",
    `<b>Итого: ${money(cartTotal(lines))}</b>`,
  ].join("\n");

  const kb = new InlineKeyboard();
  for (const l of lines) {
    kb.text("➖", `k:-:${l.variant_id}`).text(`${cartLineLabel(l)} × ${l.qty}`, "noop").text("➕", `k:+:${l.variant_id}`).row();
  }
  kb.text("✅ Оформить заказ", "co:start").row();
  kb.text("« Меню", "c:menu").text("🗑 Очистить", "k:clear");
  await showText(ctx, text, kb);
}

cart.hears(BTN_CART, (ctx) => showCart(ctx));
cart.command("cart", (ctx) => showCart(ctx));

cart.callbackQuery("c:cart", async (ctx) => {
  await answer(ctx);
  await showCart(ctx);
});

cart.callbackQuery(/^k:([+-]):(\d+)$/, async (ctx) => {
  changeCartQty(ctx.from.id, Number(ctx.match[2]), ctx.match[1] === "+" ? 1 : -1);
  await answer(ctx);
  await showCart(ctx);
});

cart.callbackQuery("k:clear", async (ctx) => {
  clearCart(ctx.from.id);
  await answer(ctx, "Корзина очищена");
  await showCart(ctx);
});
