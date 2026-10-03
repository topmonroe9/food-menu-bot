import { GrammyError, HttpError } from "grammy";
import { bot } from "./instance.js";
import { touchUser } from "../db/users.js";
import { start } from "./client/start.js";
import { menu } from "./client/menu.js";
import { cart } from "./client/cart.js";
import { checkout } from "./client/checkout.js";
import { orders } from "./client/orders.js";
import { adminComposer } from "./admin/index.js";
import { broadcastComposer } from "./admin/broadcast.js";
import { mainKeyboard } from "./ui.js";

bot.drop((ctx) => ctx.chat?.type !== "private" && !ctx.callbackQuery);

bot.use(async (ctx, next) => {
  if (ctx.from && !ctx.from.is_bot) touchUser(ctx.from);
  await next();
});

bot.use(start, broadcastComposer, adminComposer, checkout, menu, cart, orders);

bot.on("message", (ctx) =>
  ctx.reply("Пользуйтесь кнопками внизу 👇 Если есть вопрос по заказу — напишите шефу в личку.", {
    reply_markup: mainKeyboard(ctx.from.id),
  }),
);

bot.on("callback_query", (ctx) => ctx.answerCallbackQuery({ text: "Кнопка устарела, откройте меню заново" }));

bot.catch(({ error, ctx }) => {
  const where = `update ${ctx.update.update_id}`;
  if (error instanceof GrammyError) console.error(`${where}: telegram error`, error.description);
  else if (error instanceof HttpError) console.error(`${where}: network error`, error);
  else console.error(`${where}:`, error);
});

export { bot };
