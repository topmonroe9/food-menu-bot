import { db } from "./index.js";

export const defaultSettings = {
  welcome_text:
    "Привет! 👋 Это домашняя кухня.\nЛистайте меню, собирайте корзину и выбирайте удобное время — я передам заказ шефу.",
  payment_details: "",
  pickup_address: "",
  payment_reminder_hours: "3",
  digest_hour: "9",
};

export type SettingKey = keyof typeof defaultSettings;

export function getSetting(key: SettingKey): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? defaultSettings[key];
}

export function getAllSettings(): Record<SettingKey, string> {
  const result = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings) as SettingKey[]) result[key] = getSetting(key);
  return result;
}

export function setSetting(key: SettingKey, value: string) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
