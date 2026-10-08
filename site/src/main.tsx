import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "./api";
import { alert, haptic, tg } from "./tg";
import { load, save } from "./format";
import type { Bootstrap, Cart, Order, Profile } from "./types";
import { MenuView } from "./Menu";
import { CheckoutView } from "./Checkout";
import { OrdersView } from "./Orders";

type View = "menu" | "cart" | "orders";

const POLL_MS = 20_000;
const FINISHED = ["done", "cancelled"];

function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [failed, setFailed] = useState(false);
  const [cart, setCart] = useState<Cart>(() => load("cart", {}));
  const [profile, setProfile] = useState<Profile>(() => load("profile", { name: "", phone: "" }));
  const [view, setView] = useState<View>("menu");
  const menuScroll = useRef(0);

  useEffect(() => {
    tg?.ready();
    tg?.expand();
    api
      .get<Bootstrap>("/bootstrap", true)
      .then((d) => {
        setData(d);
        if (d.profile && !profile.name && !profile.phone) setProfile(d.profile);
        const known = new Set(d.categories.flatMap((c) => c.dishes.flatMap((x) => x.variants.map((v) => v.id))));
        setCart((current) => Object.fromEntries(Object.entries(current).filter(([id]) => known.has(Number(id)))));
      })
      .catch(() => setFailed(true));
    const onPop = (e: PopStateEvent) => setView((e.state as { view?: View } | null)?.view ?? "menu");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => save("cart", cart), [cart]);
  useEffect(() => save("profile", profile), [profile]);

  useEffect(() => {
    if (view === "menu") requestAnimationFrame(() => window.scrollTo(0, menuScroll.current));
    else window.scrollTo(0, 0);
    if (!tg) return;
    const back = () => history.back();
    if (view === "menu") tg.BackButton.hide();
    else {
      tg.BackButton.show();
      tg.BackButton.onClick(back);
    }
    return () => tg?.BackButton.offClick(back);
  }, [view]);

  const hasActive = !!data?.orders.some((o) => !FINISHED.includes(o.status));

  useEffect(() => {
    if (!hasActive) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api
        .get<Order[]>("/orders", true)
        .then((orders) => setData((d) => (d ? { ...d, orders } : d)))
        .catch(() => undefined);
    };
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [hasActive]);

  if (failed) return <div class="empty">Не получилось загрузить меню 😔 Обновите страницу</div>;
  if (!data) return <div class="empty">Загрузка…</div>;

  const go = (next: View) => {
    if (view === "menu") menuScroll.current = window.scrollY;
    history.pushState({ view: next }, "");
    setView(next);
  };
  const back = () => (history.state?.view ? history.back() : setView("menu"));

  const changeCart = (variantId: number, delta: number) => {
    haptic("tap");
    setCart((current) => {
      const qty = Math.min(Math.max((current[variantId] ?? 0) + delta, 0), 99);
      const next = { ...current };
      if (qty === 0) delete next[variantId];
      else next[variantId] = qty;
      return next;
    });
  };

  const upsertOrder = (order: Order) =>
    setData({ ...data, orders: [order, ...data.orders.filter((o) => o.id !== order.id)].sort((a, b) => b.id - a.id) });

  const placed = (order: Order) => {
    setCart({});
    upsertOrder(order);
    history.replaceState({ view: "orders" }, "");
    setView("orders");
  };

  const repeat = (order: Order) => {
    const known = new Set(data.categories.flatMap((c) => c.dishes.flatMap((d) => d.variants.map((v) => v.id))));
    const next = { ...cart };
    let missing = 0;
    for (const item of order.items) {
      if (item.variantId && known.has(item.variantId)) next[item.variantId] = Math.min((next[item.variantId] ?? 0) + item.qty, 99);
      else missing++;
    }
    setCart(next);
    if (missing > 0) alert("Некоторых блюд из того заказа сейчас нет в меню");
    history.replaceState({ view: "cart" }, "");
    setView("cart");
  };

  if (view === "cart") {
    return (
      <CheckoutView
        data={data}
        cart={cart}
        profile={profile}
        onCart={changeCart}
        onProfile={setProfile}
        onPlaced={placed}
        onBack={back}
      />
    );
  }
  if (view === "orders") {
    return <OrdersView orders={data.orders} cook={data.cook} onChanged={upsertOrder} onRepeat={repeat} onBack={back} />;
  }
  return <MenuView data={data} cart={cart} onCart={changeCart} onOpenCart={() => go("cart")} onOpenOrders={() => go("orders")} />;
}

render(<App />, document.getElementById("app")!);
