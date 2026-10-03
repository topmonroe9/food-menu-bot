import { Composer, InlineKeyboard, type Context } from "grammy";
import { cartLineLabel, cartTotal, changeCartQty, clearCart, getCart } from "../../db/cart.js";
import { escapeHtml, money } from "../../lib/format.js";
import { addButton, answer, BTN_CART, mainStyle, newRow, showText } from "../ui.js";

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
    ...lines.map((l, i) => `<b>${i + 1}.</b> ${escapeHtml(cartLineLabel(l))} × ${l.qty} — ${money(l.price * l.qty)}`),
    "",
    `<b>Итого: ${money(cartTotal(lines))}</b>`,
    "",
    "Кнопки ➖ и ➕ меняют количество в строке с тем же номером 👇",
  ].join("\n");

  // dish names don't fit a third of a row, so a button only carries the line number from the text above
  const kb = new InlineKeyboard();
  lines.forEach((l, i) => {
    newRow(kb).text("➖", `k:-:${l.variant_id}`).text(`№ ${i + 1} · ${l.qty} шт`, "noop").text("➕", `k:+:${l.variant_id}`);
  });
  addButton(newRow(kb), { text: `✅ Оформить заказ · ${money(cartTotal(lines))}`, data: "co:start", style: mainStyle() });
  newRow(kb).text("« Меню", "c:menu");
  addButton(kb, { text: "🗑 Очистить", data: "k:clear", style: "danger" });
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
