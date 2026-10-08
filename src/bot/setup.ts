import { GrammyError } from "grammy";
import { bot } from "./instance.js";
import { allAdminIds, isAdmin } from "../db/admins.js";
import { adminUrl, siteUrl } from "./ui.js";

const clientCommands = [
  { command: "start", description: "Начать" },
  { command: "menu", description: "Меню" },
  { command: "cart", description: "Корзина" },
  { command: "orders", description: "Мои заказы" },
];

const adminCommands = [
  ...clientCommands,
  { command: "admin", description: "Панель заказов" },
  { command: "link", description: "Ссылка на меню для WhatsApp" },
  { command: "broadcast", description: "Рассылка всем клиентам" },
];

// opening the site from this button passes telegram's signed user data, so the site knows it's the same person as in the bot
function clientMenuButton() {
  const url = siteUrl();
  return url?.startsWith("https://")
    ? ({ type: "web_app", text: "Меню", web_app: { url } } as const)
    : ({ type: "commands" } as const);
}

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
      await bot.api.setChatMenuButton({ chat_id: userId, menu_button: clientMenuButton() });
    }
  } catch (err) {
    // chat may not exist yet if the person never opened the bot
    if (!(err instanceof GrammyError)) throw err;
  }
}

export async function setupBotUi() {
  await bot.api.setMyCommands(clientCommands);
  await bot.api.setChatMenuButton({ menu_button: clientMenuButton() });
  for (const id of allAdminIds()) await applyAdminUi(id);
}
