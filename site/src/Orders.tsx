import { useState } from "preact/hooks";
import type { Order, OrderStatus } from "./types";
import { money } from "./format";
import { api } from "./api";
import { confirm, haptic } from "./tg";
import { Screen } from "./ui";

function statusHint(order: Order, cook: string): string {
  const hints: Record<OrderStatus, string> = {
    new: `${cook} посмотрит заказ и подтвердит время. Страница обновится сама.`,
    awaiting_payment: "Время подтверждено! Оплатите заказ и нажмите «Я оплатил».",
    payment_check: `${cook} проверяет оплату.`,
    paid: `Оплата получена, ${cook} готовит.`,
    ready: "Заказ готов, можно забирать!",
    done: "Спасибо за заказ! Приятного аппетита 🤍",
    cancelled: "Заказ отменён.",
  };
  return hints[order.status];
}

export function OrdersView(props: {
  orders: Order[];
  cook: string;
  onChanged: (order: Order) => void;
  onRepeat: (order: Order) => void;
  onBack: () => void;
}) {
  return (
    <Screen title="Мои заказы" onBack={props.onBack}>
      {props.orders.length === 0 && <div class="empty">Заказов пока нет</div>}
      {props.orders.map((o) => (
        <OrderCard order={o} cook={props.cook} onChanged={props.onChanged} onRepeat={props.onRepeat} />
      ))}
    </Screen>
  );
}

function OrderCard(props: { order: Order; cook: string; onChanged: (order: Order) => void; onRepeat: (order: Order) => void }) {
  const o = props.order;
  const [busy, setBusy] = useState(false);
  const finished = o.status === "done" || o.status === "cancelled";

  const act = async (action: "paid" | "cancel", question?: string) => {
    if (question && !(await confirm(question))) return;
    setBusy(true);
    try {
      props.onChanged(await api.post<Order>(`/orders/${o.id}/${action}`));
      haptic();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article class={`card order status-${o.status}`}>
      <div class="row between">
        <b>Заказ #{o.id}</b>
        <span class="status">{o.statusLabel}</span>
      </div>
      <p class="hint">{statusHint(o, props.cook)}</p>
      <ul class="items">
        {o.items.map((i) => (
          <li>
            <span>
              {i.title}
              {i.variant && <span class="muted"> ({i.variant})</span>} × {i.qty}
            </span>
            <span class="muted">{money(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>
      <div class="row between">
        <span>Итого</span>
        <b>{money(o.total)}</b>
      </div>
      <div class="meta">
        {o.when ? (
          <div>
            ⏰ <b>{o.when}</b>
          </div>
        ) : (
          o.wish && <div>🗓 Ваше пожелание: {o.wish}</div>
        )}
        {o.address && !finished && <div>📍 {o.address}</div>}
        {o.comment && <div>💬 {o.comment}</div>}
      </div>
      {o.canPay && (
        <div class="pay">
          <div>
            Сумма к оплате: <b>{money(o.total)}</b>
          </div>
          <div class="pre">{o.payment || `Реквизиты ${props.cook} пришлёт лично.`}</div>
          <button class="primary wide" disabled={busy} onClick={() => act("paid")}>
            💳 Я оплатил
          </button>
        </div>
      )}
      <div class="actions">
        {o.canCancel && (
          <button class="danger" disabled={busy} onClick={() => act("cancel", `Отменить заказ #${o.id}?`)}>
            Отменить заказ
          </button>
        )}
        {finished && <button onClick={() => props.onRepeat(o)}>🔁 Повторить заказ</button>}
      </div>
    </article>
  );
}
