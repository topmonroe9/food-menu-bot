import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import { InlineKeyboard } from "grammy";
import { config } from "../config.js";
import { bot } from "../bot/instance.js";
import { validateInitData } from "./auth.js";
import { listVisibleCategories, listVisibleDishes, orderableVariant } from "../db/menu.js";
import { getOrder, listSessionOrders, listUserOrders, STATUS_LABEL, type OrderFull } from "../db/orders.js";
import { getSlot, isSlotFree, listBookableSlots } from "../db/slots.js";
import { cookName, getSetting } from "../db/settings.js";
import { saveWebUser, touchUser } from "../db/users.js";
import { bindSession, sessionUser } from "../db/webSessions.js";
import type { CartLine } from "../db/cart.js";
import { cancelByClient, clientMarkedPaid, OrderFlowError, placeOrder } from "../services/orders.js";
import { formatPhone, normalizePhone } from "../lib/phone.js";
import { humanDateTime, nowLocal, shortDay, timeSteps } from "../lib/time.js";

type Visitor = { kind: "tg"; userId: number } | { kind: "web"; token: string };
type ShopEnv = { Variables: { visitor: Visitor } };

const COOKIE = "sid";
// browsers keep a cookie 400 days at most, every visit pushes that date forward so the session never ends for a regular
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
const TG_MAX_AGE = 7 * 24 * 60 * 60;
const TIME_RE = /^\d{2}:\d{2}$/;

export const shop = new Hono<ShopEnv>();

shop.onError((err, c) => {
  if (err instanceof OrderFlowError) return c.json({ error: err.message }, 400);
  console.error("shop error:", err);
  return c.json({ error: "Что-то пошло не так, попробуйте ещё раз" }, 500);
});

shop.use("*", async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const tgUser = header.startsWith("tma ") ? validateInitData(header.slice(4), TG_MAX_AGE) : null;
  if (tgUser) {
    touchUser(tgUser);
    c.set("visitor", { kind: "tg", userId: tgUser.id });
  } else {
    let token = getCookie(c, COOKIE);
    if (!token || !/^[\w-]{24,64}$/.test(token)) token = randomBytes(24).toString("base64url");
    setCookie(c, COOKIE, token, {
      path: "/",
      httpOnly: true,
      secure: config.webAppUrl.startsWith("https://"),
      sameSite: "Lax",
      maxAge: COOKIE_MAX_AGE,
    });
    c.set("visitor", { kind: "web", token });
  }
  await next();
});

function menuData() {
  const categories = listVisibleCategories()
    .map((c) => ({
      id: c.id,
      title: c.title,
      dishes: listVisibleDishes(c.id).map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        photo: d.photo_path ? `/media/${d.photo_path}` : null,
        variants: d.variants.map((v) => ({ id: v.id, title: v.title, weight: v.weight, price: v.price })),
      })),
    }))
    .filter((c) => c.dishes.length > 0);
  return { cook: cookName().name, welcome: getSetting("welcome_text"), categories };
}

function slotOptions() {
  const now = nowLocal();
  return listBookableSlots()
    .map((s) => ({
      id: s.id,
      day: shortDay(s.date),
      date: humanDateTime(s.date),
      start: s.start_time,
      end: s.end_time,
      times: timeSteps(s.start_time, s.end_time).filter((t) => `${s.date} ${t}` > now),
    }))
    .filter((s) => s.times.length > 0);
}

const CONFIRMED = ["awaiting_payment", "payment_check", "paid", "ready"];

function publicOrder(o: OrderFull) {
  const address = getSetting("pickup_address").trim();
  const details = getSetting("payment_details").trim();
  return {
    id: o.id,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    items: o.items.map((i) => ({ title: i.dish_title, variant: i.variant_title, qty: i.qty, price: i.price, variantId: i.variant_id })),
    total: o.total,
    when: o.scheduled_at ? humanDateTime(o.scheduled_at) : null,
    wish: o.requested_at ? humanDateTime(o.requested_at) : o.requested_note,
    comment: o.comment,
    address: CONFIRMED.includes(o.status) && address ? address : null,
    payment: o.status === "awaiting_payment" ? details : null,
    canPay: o.status === "awaiting_payment",
    canCancel: o.status === "new" || o.status === "awaiting_payment",
  };
}

function visitorData(visitor: Visitor) {
  if (visitor.kind === "tg") {
    return { telegram: true, profile: null, orders: listUserOrders(visitor.userId, 10).map(publicOrder) };
  }
  const user = sessionUser(visitor.token);
  return {
    telegram: false,
    profile: user ? { name: user.first_name, phone: user.phone ? formatPhone(user.phone) : "" } : null,
    orders: listSessionOrders(visitor.token, 10).map(publicOrder),
  };
}

shop.get("/bootstrap", (c) => c.json({ ...menuData(), ...visitorData(c.get("visitor")), slots: slotOptions() }));

shop.get("/orders", (c) => c.json(visitorData(c.get("visitor")).orders));

const ORDERS_PER_HOUR = 5;
const recentOrders = new Map<string, number[]>();

// a stranger with the link can't flood the cook with orders, real people never hit this
function tooManyOrders(ip: string): boolean {
  const now = Date.now();
  if (recentOrders.size > 1000) recentOrders.clear();
  const list = (recentOrders.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const blocked = list.length >= ORDERS_PER_HOUR;
  if (!blocked) list.push(now);
  recentOrders.set(ip, list);
  return blocked;
}

interface OrderBody {
  items?: { variantId: number; qty: number }[];
  slotId?: number;
  time?: string;
  note?: string;
  comment?: string;
  name?: string;
  phone?: string;
}

function linesFrom(items: OrderBody["items"]): CartLine[] {
  if (!Array.isArray(items) || items.length === 0) throw new OrderFlowError("Корзина пуста");
  const qty = new Map<number, number>();
  for (const item of items.slice(0, 50)) {
    const id = Number(item?.variantId);
    const n = Math.round(Number(item?.qty));
    if (!Number.isInteger(id) || !(n > 0)) continue;
    qty.set(id, Math.min((qty.get(id) ?? 0) + n, 99));
  }
  const lines: CartLine[] = [];
  for (const [id, n] of qty) {
    const v = orderableVariant(id);
    if (!v) throw new OrderFlowError("Какого-то блюда из корзины уже нет в меню. Обновите страницу и проверьте заказ");
    lines.push({ variant_id: v.id, qty: n, price: v.price, dish_id: v.dish_id, dish_title: v.dish_title, variant_title: v.title, weight: v.weight });
  }
  if (lines.length === 0) throw new OrderFlowError("Корзина пуста");
  return lines;
}

function whenFrom(body: OrderBody): { slotId: number | null; requestedAt: string | null; requestedNote: string | null } {
  if (body.slotId) {
    const slot = getSlot(Number(body.slotId));
    if (!slot || !isSlotFree(slot)) throw new OrderFlowError("Это окошко уже занято, выберите другое");
    const time = String(body.time ?? "");
    const at = `${slot.date} ${time}`;
    if (!TIME_RE.test(time) || !timeSteps(slot.start_time, slot.end_time).includes(time) || at <= nowLocal()) {
      throw new OrderFlowError("Выберите время внутри окошка");
    }
    return { slotId: slot.id, requestedAt: at, requestedNote: null };
  }
  const note = String(body.note ?? "").trim().slice(0, 500);
  if (!note) throw new OrderFlowError("Напишите, когда вам удобно забрать заказ");
  return { slotId: null, requestedAt: null, requestedNote: note };
}

async function tellTelegramClient(userId: number, orderId: number) {
  const cook = cookName();
  await bot.api
    .sendMessage(
      userId,
      `🎉 <b>Заказ #${orderId} отправлен ${cook.dative}!</b>\n\nКак только время будет подтверждено, я пришлю реквизиты для оплаты.`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("📦 Мои заказы", "c:orders") },
    )
    .catch(() => undefined);
}

shop.post("/orders", async (c) => {
  const visitor = c.get("visitor");
  const body = await c.req.json<OrderBody>().catch(() => ({}) as OrderBody);
  const lines = linesFrom(body.items);
  const when = whenFrom(body);
  const comment = String(body.comment ?? "").trim().slice(0, 500) || null;

  let userId: number;
  if (visitor.kind === "tg") {
    userId = visitor.userId;
  } else {
    const name = String(body.name ?? "").replace(/[<>]/g, "").trim().slice(0, 60);
    const phone = normalizePhone(String(body.phone ?? ""));
    if (!name) throw new OrderFlowError("Как к вам обращаться? Напишите имя");
    if (!phone) throw new OrderFlowError("Проверьте номер телефона");
    const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() || "local";
    if (tooManyOrders(ip)) throw new OrderFlowError("Слишком много заказов подряд, попробуйте через час");
    userId = saveWebUser(name, phone);
    bindSession(visitor.token, userId);
  }

  const order = await placeOrder({
    userId,
    lines,
    ...when,
    comment,
    webSession: visitor.kind === "web" ? visitor.token : undefined,
  });
  if (visitor.kind === "tg") await tellTelegramClient(userId, order.id);
  return c.json(publicOrder(order));
});

function ownOrder(c: Context<ShopEnv>): OrderFull {
  const visitor = c.get("visitor");
  const order = getOrder(Number(c.req.param("id")));
  const mine =
    order && (visitor.kind === "tg" ? order.user_id === visitor.userId : order.web_session === visitor.token);
  if (!mine) throw new OrderFlowError("Заказ не найден");
  return order;
}

shop.post("/orders/:id/paid", async (c) => {
  const order = ownOrder(c);
  return c.json(publicOrder(await clientMarkedPaid(order.id, order.user_id)));
});

shop.post("/orders/:id/cancel", async (c) => {
  const order = ownOrder(c);
  return c.json(publicOrder(await cancelByClient(order.id, order.user_id)));
});

const attr = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const assetVersion = Date.now().toString(36);

// the shell carries open graph tags, so a link pasted into whatsapp shows up as a card with a dish photo
export function renderSitePage(): string {
  const { categories } = menuData();
  const cook = cookName().name;
  const title = `${cook} · домашняя кухня`;
  const sections = categories.map((c) => c.title).slice(0, 5).join(", ");
  const description = sections ? `${sections}. Смотрите меню и заказывайте онлайн` : "Смотрите меню и заказывайте онлайн";
  const photo = categories.flatMap((c) => c.dishes).find((d) => d.photo)?.photo;
  const base = config.webAppUrl;
  const meta = [
    `<meta name="description" content="${attr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    base && `<meta property="og:url" content="${attr(`${base}/`)}" />`,
    base && photo && `<meta property="og:image" content="${attr(`${base}${photo}`)}" />`,
    `<meta name="twitter:card" content="${photo ? "summary_large_image" : "summary"}" />`,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${attr(title)}</title>
    ${meta.join("\n    ")}
    <script>
      (function () {
        var inTelegram = location.hash.indexOf("tgWebAppData") >= 0;
        try {
          if (inTelegram) sessionStorage.setItem("tg", "1");
          else inTelegram = sessionStorage.getItem("tg") === "1";
        } catch (e) {}
        if (inTelegram) document.write('<script src="https://telegram.org/js/telegram-web-app.js"><\\/script>');
      })();
    </script>
    <link rel="stylesheet" href="/site/styles.css?v=${assetVersion}" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/site/app.js?v=${assetVersion}"></script>
  </body>
</html>`;
}
