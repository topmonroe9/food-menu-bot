import { GrammyError } from "grammy";
import { bot } from "./instance.js";
import { allAdminIds, isAdmin } from "../db/admins.js";
import { adminUrl } from "./ui.js";

const clientCommands = [
  { command: "start", description: "Начать" },
  { command: "menu", description: "Меню" },
  { command: "cart", description: "Корзина" },
  { command: "orders", description: "Мои заказы" },
];

const adminCommands = [
  ...clientCommands,
  { command: "admin", description: "Панель шефа" },
  { command: "broadcast", description: "Рассылка всем клиентам" },
];

export async function applyAdminUi(userId: number) {
  const url = adminUrl();
  try {
    if (isAdmin(userId)) {
      await bot.api.setMyCommands(adminCommands, { scope: { type: "chat", chat_id: userId } });
      if (url) {
        await bot.api.setChatMenuButton({
          chat_id: userId,
          menu_button: { type: "web_app", text: "Админка", web_app: { url } },
        });
      }
    } else {
      await bot.api.deleteMyCommands({ scope: { type: "chat", chat_id: userId } });
      await bot.api.setChatMenuButton({ chat_id: userId, menu_button: { type: "commands" } });
    }
  } catch (err) {
    // chat may not exist yet if the person never opened the bot
    if (!(err instanceof GrammyError)) throw err;
  }
}

export async function setupBotUi() {
  await bot.api.setMyCommands(clientCommands);
  await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
  for (const id of allAdminIds()) await applyAdminUi(id);
}
