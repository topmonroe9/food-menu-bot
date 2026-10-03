import { Composer, InlineKeyboard } from "grammy";
import { cookName, getSetting } from "../../db/settings.js";
import { listUserOrders } from "../../db/orders.js";
import { escapeHtml } from "../../lib/format.js";
import { mainKeyboard } from "../ui.js";
import { showCategories } from "./menu.js";
import { isAdmin } from "../../db/admins.js";
import { askBroadcast } from "../admin/broadcast.js";
import { applyAdminUi } from "../setup.js";

export const start = new Composer();

start.command("start", async (ctx) => {
  if (ctx.match === "broadcast" && isAdmin(ctx.from!.id)) return askBroadcast(ctx);
  await ctx.reply(escapeHtml(getSetting("welcome_text")), {
    parse_mode: "HTML",
    reply_markup: mainKeyboard(ctx.from!.id),
  });

  // the menu button can't be set before the chat exists, so an admin's first /start is the earliest chance
  if (isAdmin(ctx.from!.id)) await applyAdminUi(ctx.from!.id);

  const last = listUserOrders(ctx.from!.id, 5).find((o) => o.status === "done");
  if (last) {
    await ctx.reply("С возвращением! Можно повторить прошлый заказ одним нажатием 👇", {
      reply_markup: new InlineKeyboard().text("🔁 Повторить прошлый заказ", `c:repeat:${last.id}`),
    });
  }
  await showCategories(ctx);
});

start.command("help", (ctx) =>
  ctx.reply(
    `📖 Меню — листайте блюда и добавляйте в корзину\n🛒 Корзина — проверить и оформить заказ\n📦 Мои заказы — статусы и оплата\n\nЕсли что-то пошло не так — напишите ${cookName().dative} в личку.`,
    { reply_markup: mainKeyboard(ctx.from!.id) },
  ),
);
