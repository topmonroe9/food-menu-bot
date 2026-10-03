import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { validateInitData, type WebAppUser } from "./auth.js";
import { addAdmin, getAdmin, isAdmin, isOwner, listAdmins, removeAdmin, setAdminNotify, type AdminRole } from "../db/admins.js";
import { getOrder, listOrders, listUserOrders, ordersCountByStatus, type OrderFilter } from "../db/orders.js";
import { clientStats, getUser, listClients, touchUser, type ClientSort } from "../db/users.js";
import { listBroadcasts } from "../db/broadcasts.js";
import { bot } from "../bot/instance.js";
import {
  createCategory,
  deleteCategory,
  deleteDish,
  getDish,
  listCategories,
  listDishes,
  reorder,
  saveDish,
  setDishPhoto,
  updateCategory,
  type DishInput,
} from "../db/menu.js";
import { createSlot, deleteSlot, listSlots, slotsBetween, updateSlot, type SlotInput } from "../db/slots.js";
import { defaultSettings, getAllSettings, setSetting, type SettingKey } from "../db/settings.js";
import {
  cancelByAdmin,
  confirmPayment,
  markDone,
  markReady,
  OrderFlowError,
  rejectPayment,
  scheduleOrder,
} from "../services/orders.js";
import { addDays, today } from "../lib/time.js";
import { toButtonStyle } from "../lib/buttons.js";
import { applyAdminUi } from "../bot/setup.js";

type Env = { Variables: { user: WebAppUser } };

const app = new Hono<Env>();
const mediaDir = join(config.dataDir, "media");
const publicDir = "./public";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

class BadRequest extends Error {}

function int(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest("bad id");
  return n;
}

app.onError((err, c) => {
  if (err instanceof OrderFlowError || err instanceof BadRequest) return c.json({ error: err.message }, 400);
  console.error("api error:", err);
  return c.json({ error: "Что-то пошло не так" }, 500);
});

app.get("/", (c) => c.text("ok"));
app.use("/admin/*", serveStatic({ root: publicDir }));
app.use("/media/*", serveStatic({ root: config.dataDir }));

app.use("/api/*", async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const user = header.startsWith("tma ") ? validateInitData(header.slice(4)) : null;
  if (!user) return c.json({ error: "Откройте админку из Telegram" }, 401);
  if (!isAdmin(user.id)) return c.json({ error: "Нет доступа" }, 403);
  touchUser(user);
  c.set("user", user);
  await next();
});

function requireOwner(c: Context<Env>) {
  if (!isOwner(c.get("user").id)) throw new BadRequest("Это может делать только владелец");
}

app.get("/api/bootstrap", (c) => {
  const user = c.get("user");
  const admin = getAdmin(user.id);
  return c.json({
    me: { id: user.id, name: user.first_name, owner: isOwner(user.id), notify: admin ? !!admin.notify : false },
    counts: ordersCountByStatus(),
    botUsername: bot.botInfo.username,
  });
});

app.get("/api/orders", (c) => {
  const filter = (c.req.query("filter") ?? "active") as OrderFilter;
  return c.json(listOrders(filter, 200));
});

app.post("/api/orders/:id/schedule", async (c) => {
  const { at } = await c.req.json<{ at: string }>();
  if (!DATETIME_RE.test(at ?? "")) throw new BadRequest("Неверная дата");
  return c.json(await scheduleOrder(int(c.req.param("id")), at));
});

function confirmRequestedTime(id: number) {
  const order = getOrder(id);
  if (!order?.requested_at) throw new OrderFlowError("Клиент не выбрал точное время");
  return scheduleOrder(id, order.requested_at);
}

const orderActions = {
  "schedule-requested": confirmRequestedTime,
  "confirm-payment": confirmPayment,
  "reject-payment": rejectPayment,
  ready: markReady,
  done: markDone,
  cancel: cancelByAdmin,
} as const;

app.post("/api/orders/:id/:action", async (c) => {
  const action = orderActions[c.req.param("action") as keyof typeof orderActions];
  if (!action) throw new BadRequest("unknown action");
  return c.json(await action(int(c.req.param("id"))));
});

app.get("/api/clients", (c) =>
  c.json(listClients(c.req.query("q") ?? "", 200, (c.req.query("sort") ?? "recent") as ClientSort)),
);

app.get("/api/clients/:id", (c) => {
  const id = int(c.req.param("id"));
  const user = getUser(id);
  if (!user) return c.json({ error: "not found" }, 404);
  return c.json({ user, orders: listUserOrders(id, 50), stats: clientStats(id) });
});

app.get("/api/menu", (c) => c.json({ categories: listCategories(), dishes: listDishes() }));

app.post("/api/categories", async (c) => {
  const { title, button_style } = await c.req.json<{ title: string; button_style?: string }>();
  if (!title?.trim()) throw new BadRequest("Название пустое");
  return c.json({ id: createCategory(title.trim(), toButtonStyle(button_style)) });
});

app.patch("/api/categories/:id", async (c) => {
  const body = await c.req.json<{ title?: string; is_visible?: boolean; button_style?: string }>();
  updateCategory(int(c.req.param("id")), {
    title: body.title?.trim() || undefined,
    is_visible: body.is_visible,
    button_style: body.button_style === undefined ? undefined : toButtonStyle(body.button_style),
  });
  return c.json({ ok: true });
});

app.delete("/api/categories/:id", (c) => {
  deleteCategory(int(c.req.param("id")));
  return c.json({ ok: true });
});

app.post("/api/categories/reorder", async (c) => {
  const { ids } = await c.req.json<{ ids: number[] }>();
  reorder("categories", ids.map(Number));
  return c.json({ ok: true });
});

function validateDish(body: DishInput): DishInput {
  if (!body.title?.trim()) throw new BadRequest("Укажите название блюда");
  if (!Number.isInteger(body.category_id)) throw new BadRequest("Выберите раздел");
  if (!Array.isArray(body.variants) || body.variants.length === 0) throw new BadRequest("Добавьте хотя бы одну цену");
  for (const v of body.variants) {
    if (!Number.isFinite(v.price) || v.price < 0) throw new BadRequest("Проверьте цены");
  }
  return {
    category_id: body.category_id,
    title: body.title.trim(),
    description: (body.description ?? "").trim(),
    is_visible: body.is_visible !== false,
    variants: body.variants.map((v) => ({
      id: v.id,
      title: (v.title ?? "").trim(),
      weight: (v.weight ?? "").trim(),
      price: Math.round(v.price),
      is_available: v.is_available !== false,
    })),
  };
}

app.post("/api/dishes", async (c) => {
  const id = saveDish(null, validateDish(await c.req.json<DishInput>()));
  return c.json(getDish(id));
});

app.put("/api/dishes/:id", async (c) => {
  const id = int(c.req.param("id"));
  if (!getDish(id)) return c.json({ error: "not found" }, 404);
  saveDish(id, validateDish(await c.req.json<DishInput>()));
  return c.json(getDish(id));
});

app.patch("/api/dishes/:id/visible", async (c) => {
  const id = int(c.req.param("id"));
  const dish = getDish(id);
  if (!dish) return c.json({ error: "not found" }, 404);
  const { is_visible } = await c.req.json<{ is_visible: boolean }>();
  saveDish(id, { ...dish, is_visible, variants: dish.variants.map((v) => ({ ...v, is_available: !!v.is_available })) });
  return c.json(getDish(id));
});

async function removePhotoFile(path: string | null) {
  if (path) await unlink(join(mediaDir, path)).catch(() => undefined);
}

app.post("/api/dishes/:id/photo", async (c) => {
  const id = int(c.req.param("id"));
  const dish = getDish(id);
  if (!dish) return c.json({ error: "not found" }, 404);
  const body = await c.req.parseBody();
  const file = body.photo;
  if (!(file instanceof File) || !file.type.startsWith("image/")) throw new BadRequest("Нужна картинка");
  if (file.size > 10 * 1024 * 1024) throw new BadRequest("Фото слишком большое (максимум 10 МБ)");
  const ext = file.type === "image/png" ? "png" : "jpg";
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(mediaDir, name), Buffer.from(await file.arrayBuffer()));
  await removePhotoFile(dish.photo_path);
  setDishPhoto(id, name);
  return c.json(getDish(id));
});

app.delete("/api/dishes/:id/photo", async (c) => {
  const id = int(c.req.param("id"));
  const dish = getDish(id);
  if (!dish) return c.json({ error: "not found" }, 404);
  await removePhotoFile(dish.photo_path);
  setDishPhoto(id, null);
  return c.json(getDish(id));
});

app.delete("/api/dishes/:id", async (c) => {
  const id = int(c.req.param("id"));
  const dish = getDish(id);
  if (dish) {
    await removePhotoFile(dish.photo_path);
    deleteDish(id);
  }
  return c.json({ ok: true });
});

app.post("/api/dishes/reorder", async (c) => {
  const { ids } = await c.req.json<{ ids: number[] }>();
  reorder("dishes", ids.map(Number));
  return c.json({ ok: true });
});

function validateSlot(body: SlotInput): SlotInput {
  if (!DATE_RE.test(body.date ?? "") || !TIME_RE.test(body.start_time ?? "") || !TIME_RE.test(body.end_time ?? "")) {
    throw new BadRequest("Проверьте дату и время");
  }
  if (body.end_time <= body.start_time) throw new BadRequest("Окончание должно быть позже начала");
  const capacity = Math.max(0, Math.round(Number(body.capacity) || 0));
  return { date: body.date, start_time: body.start_time, end_time: body.end_time, capacity };
}

app.get("/api/slots", (c) => c.json(listSlots(addDays(today(), -7))));

app.post("/api/slots", async (c) => c.json({ id: createSlot(validateSlot(await c.req.json<SlotInput>())) }));

app.put("/api/slots/:id", async (c) => {
  updateSlot(int(c.req.param("id")), validateSlot(await c.req.json<SlotInput>()));
  return c.json({ ok: true });
});

app.delete("/api/slots/:id", (c) => {
  deleteSlot(int(c.req.param("id")));
  return c.json({ ok: true });
});

app.post("/api/slots/copy-week", async (c) => {
  const { weekStart } = await c.req.json<{ weekStart: string }>();
  if (!DATE_RE.test(weekStart ?? "")) throw new BadRequest("bad date");
  const source = slotsBetween(weekStart, addDays(weekStart, 6));
  const target = slotsBetween(addDays(weekStart, 7), addDays(weekStart, 13));
  let created = 0;
  for (const s of source) {
    const date = addDays(s.date, 7);
    const exists = target.some((t) => t.date === date && t.start_time === s.start_time && t.end_time === s.end_time);
    if (exists) continue;
    createSlot({ date, start_time: s.start_time, end_time: s.end_time, capacity: s.capacity });
    created++;
  }
  return c.json({ created });
});

app.get("/api/settings", (c) => c.json(getAllSettings()));

app.put("/api/settings", async (c) => {
  const body = await c.req.json<Partial<Record<SettingKey, string>>>();
  for (const key of Object.keys(defaultSettings) as SettingKey[]) {
    if (typeof body[key] === "string") setSetting(key, body[key]!.slice(0, 4000));
  }
  return c.json(getAllSettings());
});

app.get("/api/admins", (c) => c.json({ admins: listAdmins(), envOwners: config.ownerIds }));

app.post("/api/admins", async (c) => {
  requireOwner(c);
  const { userId, role } = await c.req.json<{ userId: number; role: AdminRole }>();
  if (!getUser(Number(userId))) throw new BadRequest("Человек должен сначала написать боту /start");
  addAdmin(Number(userId), role === "owner" ? "owner" : "helper");
  await applyAdminUi(Number(userId));
  return c.json({ ok: true });
});

app.patch("/api/admins/:id", async (c) => {
  const id = int(c.req.param("id"));
  const me = c.get("user").id;
  const body = await c.req.json<{ notify?: boolean; role?: AdminRole }>();
  if (id !== me) requireOwner(c);
  if (typeof body.notify === "boolean") setAdminNotify(id, body.notify);
  if (body.role && id !== me && !config.ownerIds.includes(id)) addAdmin(id, body.role === "owner" ? "owner" : "helper");
  return c.json({ ok: true });
});

app.delete("/api/admins/:id", async (c) => {
  requireOwner(c);
  const id = int(c.req.param("id"));
  if (config.ownerIds.includes(id)) throw new BadRequest("Этого владельца можно убрать только из .env");
  if (id === c.get("user").id) throw new BadRequest("Нельзя удалить самого себя");
  removeAdmin(id);
  await applyAdminUi(id);
  return c.json({ ok: true });
});

app.get("/api/orders/:id", (c) => {
  const order = getOrder(int(c.req.param("id")));
  return order ? c.json(order) : c.json({ error: "not found" }, 404);
});

app.get("/api/broadcasts", (c) => c.json(listBroadcasts()));

export function startServer() {
  serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`web server on :${info.port}`));
}
