import { GrammyError, InlineKeyboard } from "grammy";
import { bot } from "../bot/instance.js";
import { createBroadcast, getBroadcast, updateBroadcast, type Broadcast } from "../db/broadcasts.js";
import { reachableUserIds, setBlocked } from "../db/users.js";
import { nowLocal } from "../lib/time.js";

const DELAY_MS = 45;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const menuButton = () => new InlineKeyboard().text("📖 Открыть меню", "c:menu:new");

function recipients(b: Broadcast): number[] {
  return reachableUserIds().filter((id) => id !== b.created_by);
}

export function controlKeyboard(b: Broadcast): InlineKeyboard {
  const count = recipients(b).length;
  return new InlineKeyboard()
    .text(b.with_menu_button ? "🔘 Кнопка «Открыть меню»: есть" : "⚪️ Кнопка «Открыть меню»: нет", `b:btn:${b.id}`)
    .row()
    .text(`🚀 Отправить всем (${count})`, `b:ask:${b.id}`)
    .row()
    .text("✖️ Отмена", `b:cx:${b.id}`);
}

export function confirmKeyboard(b: Broadcast): InlineKeyboard {
  return new InlineKeyboard()
    .text(`Да, отправить ${recipients(b).length} людям`, `b:go:${b.id}`)
    .row()
    .text("« Назад", `b:back:${b.id}`);
}

export async function startDraft(adminId: number, chatId: number, messageId: number, previewText: string) {
  const id = createBroadcast(adminId, chatId, messageId, previewText);
  const b = getBroadcast(id)!;
  await bot.api.sendMessage(chatId, "👇 Так сообщение увидят клиенты:");
  await bot.api.copyMessage(chatId, chatId, messageId, { reply_markup: b.with_menu_button ? menuButton() : undefined });
  const control = await bot.api.sendMessage(chatId, "Всё верно? Можно добавить кнопку меню и отправить.", {
    reply_markup: controlKeyboard(b),
  });
  updateBroadcast(id, { control_message_id: control.message_id });
}

async function report(b: Broadcast, text: string, keyboard?: InlineKeyboard) {
  if (!b.control_message_id) return;
  await bot.api
    .editMessageText(b.source_chat_id, b.control_message_id, text, { reply_markup: keyboard })
    .catch(() => undefined);
}

async function deliver(b: Broadcast, userId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await bot.api.copyMessage(userId, b.source_chat_id, b.source_message_id, {
        reply_markup: b.with_menu_button ? menuButton() : undefined,
      });
      return true;
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 429) {
        await sleep(((err.parameters.retry_after ?? 3) + 1) * 1000);
        continue;
      }
      if (err instanceof GrammyError && err.error_code === 403) setBlocked(userId);
      return false;
    }
  }
  return false;
}

export async function runBroadcast(id: number) {
  const b = getBroadcast(id);
  if (!b || b.status !== "draft") return;
  const ids = recipients(b);
  updateBroadcast(id, { status: "sending", total: ids.length });
  await report(b, `📤 Рассылка пошла… 0 / ${ids.length}`);

  let sent = 0;
  let failed = 0;
  for (const [i, userId] of ids.entries()) {
    if (await deliver(b, userId)) sent++;
    else failed++;
    if ((i + 1) % 25 === 0) {
      updateBroadcast(id, { sent, failed });
      await report(b, `📤 Рассылка идёт… ${i + 1} / ${ids.length}`);
    }
    await sleep(DELAY_MS);
  }

  updateBroadcast(id, { status: "done", sent, failed, finished_at: nowLocal() });
  const tail = failed > 0 ? `\nНе доставлено: ${failed} (скорее всего, остановили бота)` : "";
  await report(b, `✅ Рассылка завершена.\nДоставлено: ${sent}${tail}`);
}
