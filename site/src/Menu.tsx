import { useState } from "preact/hooks";
import type { Bootstrap, Cart, Dish, Order } from "./types";
import { money, variantLabel } from "./format";
import { Stepper } from "./ui";

const ACTIVE = ["new", "awaiting_payment", "payment_check", "paid", "ready"];

export function MenuView(props: {
  data: Bootstrap;
  cart: Cart;
  onCart: (variantId: number, delta: number) => void;
  onOpenCart: () => void;
  onOpenOrders: () => void;
}) {
  const { data, cart } = props;
  const lines = data.categories.flatMap((c) => c.dishes.flatMap((d) => d.variants)).filter((v) => cart[v.id]);
  const count = lines.reduce((s, v) => s + cart[v.id], 0);
  const total = lines.reduce((s, v) => s + v.price * cart[v.id], 0);
  const active = data.orders.filter((o) => ACTIVE.includes(o.status));

  return (
    <>
      <main class={count > 0 ? "with-bar" : ""}>
        <header class="hero">
          <h1>{data.cook} · домашняя кухня</h1>
          {data.welcome && <p class="muted pre">{data.welcome}</p>}
        </header>
        {active.length > 0 && <OrdersBanner orders={active} onOpen={props.onOpenOrders} />}
        {active.length === 0 && data.orders.length > 0 && (
          <button class="link" onClick={props.onOpenOrders}>
            📦 Мои заказы
          </button>
        )}
        {data.categories.length === 0 && <div class="empty">Меню пока пустое — скоро оно появится 🙌</div>}
        {data.categories.length > 1 && (
          <nav class="sections">
            {data.categories.map((c) => (
              <a href={`#section-${c.id}`} onClick={(e) => scrollToSection(e, c.id)}>
                {c.title}
              </a>
            ))}
          </nav>
        )}
        {data.categories.map((c) => (
          <section id={`section-${c.id}`} class="category">
            <h2>{c.title}</h2>
            <div class="dishes">
              {c.dishes.map((d) => (
                <DishCard dish={d} cart={cart} onCart={props.onCart} />
              ))}
            </div>
          </section>
        ))}
      </main>
      {count > 0 && (
        <footer class="bottom-bar">
          <button class="primary wide" onClick={props.onOpenCart}>
            <span>🛒 Корзина · {count} шт</span>
            <span>{money(total)} →</span>
          </button>
        </footer>
      )}
    </>
  );
}

function scrollToSection(e: Event, id: number) {
  e.preventDefault();
  document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function OrdersBanner(props: { orders: Order[]; onOpen: () => void }) {
  const first = props.orders[0];
  const more = props.orders.length - 1;
  return (
    <button class={`banner status-${first.status}`} onClick={props.onOpen}>
      <span>
        Заказ #{first.id} · <b>{first.statusLabel}</b>
        {more > 0 && <span class="muted"> и ещё {more}</span>}
      </span>
      <span>›</span>
    </button>
  );
}

function DishCard(props: { dish: Dish; cart: Cart; onCart: (variantId: number, delta: number) => void }) {
  const { dish, cart } = props;
  const [open, setOpen] = useState(false);
  const single = dish.variants.length === 1;

  return (
    <article class="dish">
      {dish.photo && <img src={dish.photo} alt={dish.title} loading="lazy" decoding="async" />}
      <div class="dish-body">
        <h3>{dish.title}</h3>
        {dish.description && (
          <p class={open ? "muted small pre" : "muted small pre clamp"} onClick={() => setOpen(!open)}>
            {dish.description}
          </p>
        )}
        <div class="variants">
          {dish.variants.map((v) => {
            const label = variantLabel(v);
            return (
              <div class="variant">
                <div>
                  {label && <span>{label}</span>}
                  <b>{money(v.price)}</b>
                </div>
                <Stepper qty={cart[v.id] ?? 0} label={single ? "В корзину" : "＋"} onChange={(d) => props.onCart(v.id, d)} />
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
