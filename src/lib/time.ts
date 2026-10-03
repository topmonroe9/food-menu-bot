const pad = (n: number) => String(n).padStart(2, "0");

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEKDAYS_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function toDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toDateTime(d: Date): string {
  return `${toDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowLocal(): string {
  return toDateTime(new Date());
}

export function today(): string {
  return toDate(new Date());
}

export function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function parseDateTime(value: string): Date {
  const [date, time = "00:00"] = value.split(" ");
  const d = parseDate(date);
  const [h, min] = time.split(":").map(Number);
  d.setHours(h, min, 0, 0);
  return d;
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return toDate(d);
}

export function hoursBetween(from: string, to: string): number {
  return (parseDateTime(to).getTime() - parseDateTime(from).getTime()) / 3_600_000;
}

export function shortDay(date: string): string {
  const d = parseDate(date);
  return `${WEEKDAYS[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function longDay(date: string): string {
  const d = parseDate(date);
  return `${WEEKDAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function humanDateTime(value: string): string {
  const [date, time] = value.split(" ");
  const t = today();
  let day = longDay(date);
  if (date === t) day = `сегодня, ${day}`;
  else if (date === addDays(t, 1)) day = `завтра, ${day}`;
  return time ? `${day}, ${time}` : day;
}

export function shortDateTime(value: string): string {
  const [date, time] = value.split(" ");
  return time ? `${shortDay(date)} ${time}` : shortDay(date);
}

export function timeSteps(start: string, end: string, stepMinutes = 30): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const result: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += stepMinutes) {
    result.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return result;
}

export function parseUserDateTime(input: string): string | null {
  const match = input.trim().match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s+(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yy, hh, min] = match;
  const now = new Date();
  let year = yy ? Number(yy.length === 2 ? `20${yy}` : yy) : now.getFullYear();
  const d = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(min));
  if (!yy && d.getTime() < now.getTime() - 86_400_000) {
    year += 1;
    d.setFullYear(year);
  }
  if (d.getDate() !== Number(dd) || d.getMonth() !== Number(mm) - 1 || Number(hh) > 23) return null;
  return toDateTime(d);
}
