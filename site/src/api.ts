import { alert, tg } from "./tg";

async function request<T>(method: string, path: string, body?: unknown, quiet = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (tg) headers.Authorization = `tma ${tg.initData}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/shop${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    if (!quiet) alert("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз");
    throw new Error("network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `Ошибка ${res.status}`;
    if (!quiet) alert(message);
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, quiet = false) => request<T>("GET", path, undefined, quiet),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
};
