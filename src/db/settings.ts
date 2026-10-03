import { db } from "./index.js";
import { toDative } from "../lib/names.js";

export const defaultSettings = {
  welcome_text:
    "Привет! 👋 Это домашняя кухня.\nЛистайте меню, собирайте корзину и выбирайте удобное время — я передам ваш заказ.",
  cook_name: "Виктория",
  cook_name_dative: "",
  payment_details: "",
  pickup_address: "",
  payment_reminder_hours: "3",
  digest_hour: "9",
  main_button_style: "primary",
  variant_button_style: "",
};

export type SettingKey = keyof typeof defaultSettings;

export function getSetting(key: SettingKey): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? defaultSettings[key];
}

export function getAllSettings(): Record<SettingKey, string> {
  const result = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings) as SettingKey[]) result[key] = getSetting(key);
  // the admin sees the forms the bot really uses, including a dative it worked out itself
  const cook = cookName();
  result.cook_name = cook.name;
  result.cook_name_dative = cook.dative;
  return result;
}

// how the bot calls the cook in messages to clients: "Виктория подтвердит время", "заказ отправлен Виктории"
export function cookName(): { name: string; dative: string } {
  const clean = (value: string) => value.replace(/[<>&]/g, "").trim().slice(0, 40);
  const name = clean(getSetting("cook_name")) || defaultSettings.cook_name;
  return { name, dative: clean(getSetting("cook_name_dative")) || toDative(name) };
}

export function setSetting(key: SettingKey, value: string) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
