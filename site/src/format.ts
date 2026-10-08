import type { Variant } from "./types";

export function money(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export function variantLabel(v: Pick<Variant, "title" | "weight">): string {
  return [v.title, v.weight].filter(Boolean).join(", ");
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode or full storage, the page works without it
  }
}
