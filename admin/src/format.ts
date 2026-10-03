const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const pad = (n: number) => String(n).padStart(2, "0");

export function money(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toDate(new Date());
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return toDate(d);
}

export function weekStart(date: string): string {
  const d = parseDate(date);
  const shift = (d.getDay() + 6) % 7;
  return addDays(date, -shift);
}

export function shortDay(date: string): string {
  const d = parseDate(date);
  return `${WEEKDAYS[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function shortDateTime(value: string): string {
  const [date, time] = value.split(" ");
  const t = today();
  const day = date === t ? "Сегодня" : date === addDays(t, 1) ? "Завтра" : date === addDays(t, -1) ? "Вчера" : shortDay(date);
  return time ? `${day} ${time}` : day;
}

export function personName(p: { first_name: string | null; last_name: string | null; username: string | null }): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || (p.username ? `@${p.username}` : "Без имени");
}

export function itemLabel(i: { dish_title: string; variant_title: string }): string {
  return i.variant_title ? `${i.dish_title} (${i.variant_title})` : i.dish_title;
}
