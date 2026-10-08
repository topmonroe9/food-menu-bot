import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { confirm, haptic, openChat, openWhatsApp } from "../tg";
import { STATUS_LABEL, type Order, type Slot } from "../types";
import { formatPhone, itemLabel, money, personName, shortDateTime, shortDay, today } from "../format";
import { Chips, Empty, Field, Sheet } from "../ui";

type Filter = "active" | "attention" | "done" | "cancelled" | "all";

const FILTERS: [Filter, string][] = [
  ["active", "Активные"],
  ["attention", "Ждут ответа"],
  ["done", "Выданы"],
  ["cancelled", "Отменены"],
  ["all", "Все"],
];

export function OrdersPage(props: { onChanged: () => void; onOpenClient: (id: number) => void }) {
  const [filter, setFilter] = useState<Filter>("active");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [scheduling, setScheduling] = useState<Order | null>(null);

  const load = () => api.get<Order[]>(`/orders?filter=${filter}`).then(setOrders);

  useEffect(() => {
    setOrders(null);
    void load();
  }, [filter]);

  const act = async (order: Order, action: string, question?: string) => {
    if (question && !(await confirm(question))) return;
    await api.post(`/orders/${order.id}/${action}`);
    haptic();
    await load();
    props.onChanged();
  };

  return (
    <section>
      <h1>Заказы</h1>
      <Chips value={filter} options={FILTERS} onChange={setFilter} />
      {orders === null && <Empty>Загрузка…</Empty>}
      {orders?.length === 0 && <Empty>Здесь пока пусто</Empty>}
      {orders?.map((o) => (
        <OrderCard
          key={o.id}
          order={o}
          onAction={(action, question) => act(o, action, question)}
          onSchedule={() => setScheduling(o)}
          onOpenClient={() => props.onOpenClient(o.user_id)}
        />
      ))}
      {scheduling && (
        <ScheduleSheet
          order={scheduling}
          onClose={() => setScheduling(null)}
          onDone={async () => {
            setScheduling(null);
            await load();
            props.onChanged();
          }}
        />
      )}
    </section>
  );
}

function OrderCard(props: {
  order: Order;
  onAction: (action: string, question?: string) => void;
  onSchedule: () => void;
  onOpenClient: () => void;
}) {
  const o = props.order;
  const wish = o.requested_at ? shortDateTime(o.requested_at) : o.requested_note ? `«${o.requested_note}»` : "—";

  return (
    <article class={`card status-${o.status}`}>
      <header class="row between">
        <b>#{o.id}</b>
        <span class="status">{STATUS_LABEL[o.status]}</span>
      </header>
      <button class="link" onClick={props.onOpenClient}>
        👤 {personName(o)} {o.username && <span class="muted">@{o.username}</span>}
        {o.phone && <span class="muted"> · {formatPhone(o.phone)} · 🌐 с сайта</span>}
      </button>
      <ul class="items">
        {o.items.map((i) => (
          <li>
            {itemLabel(i)} × {i.qty} <span class="muted">{money(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>
      <div class="row between">
        <b>{money(o.total)}</b>
        <span class="muted">создан {shortDateTime(o.created_at)}</span>
      </div>
      <div class="meta">
        <div>🗓 Хочет: {wish}</div>
        {o.scheduled_at && (
          <div>
            ⏰ Назначено: <b>{shortDateTime(o.scheduled_at)}</b>
          </div>
        )}
        {o.comment && <div>💬 {o.comment}</div>}
      </div>
      <div class="actions">
        {o.status === "new" && o.requested_at && (
          <button class="primary" onClick={() => props.onAction("schedule-requested")}>
            ✅ Подтвердить {o.requested_at.slice(11)}
          </button>
        )}
        {o.status === "new" && <button onClick={props.onSchedule}>🕐 Назначить время</button>}
        {(o.status === "awaiting_payment" || o.status === "payment_check") && (
          <button class="primary" onClick={() => props.onAction("confirm-payment")}>
            ✅ Оплата пришла
          </button>
        )}
        {o.status === "payment_check" && (
          <button onClick={() => props.onAction("reject-payment")}>❌ Не вижу оплату</button>
        )}
        {o.status === "paid" && (
          <button class="primary" onClick={() => props.onAction("ready")}>
            📦 Готов к выдаче
          </button>
        )}
        {o.status === "ready" && (
          <button class="primary" onClick={() => props.onAction("done")}>
            ✔️ Выдан
          </button>
        )}
        {(o.status === "awaiting_payment" || o.status === "paid") && (
          <button onClick={props.onSchedule}>🕐 Перенести</button>
        )}
        {o.username && <button onClick={() => openChat(o.username)}>💬 Написать</button>}
        {o.phone && <button onClick={() => openWhatsApp(o.phone!)}>💬 WhatsApp</button>}
        {o.status !== "done" && o.status !== "cancelled" && (
          <button class="danger" onClick={() => props.onAction("cancel", `Отменить заказ #${o.id}? Клиент получит уведомление.`)}>
            Отменить
          </button>
        )}
      </div>
    </article>
  );
}

function ScheduleSheet(props: { order: Order; onClose: () => void; onDone: () => void }) {
  const initial = props.order.scheduled_at ?? props.order.requested_at ?? `${today()} 12:00`;
  const [date, setDate] = useState(initial.slice(0, 10));
  const [time, setTime] = useState(initial.slice(11, 16));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<Slot[]>("/slots").then((list) => setSlots(list.filter((s) => s.date >= today())));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/orders/${props.order.id}/schedule`, { at: `${date} ${time}` });
      haptic();
      props.onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={`Время для заказа #${props.order.id}`} onClose={props.onClose}>
      {props.order.requested_note && <p class="note">Клиент написал: «{props.order.requested_note}»</p>}
      {slots.length > 0 && (
        <>
          <p class="muted">Ваши окошки:</p>
          <div class="chips wrap">
            {slots.map((s) => (
              <button
                class={s.date === date ? "chip active" : "chip"}
                onClick={() => {
                  setDate(s.date);
                  if (time < s.start_time || time > s.end_time) setTime(s.start_time);
                }}
              >
                {shortDay(s.date)} {s.start_time}–{s.end_time}
              </button>
            ))}
          </div>
        </>
      )}
      <div class="row gap">
        <Field label="Дата">
          <input type="date" value={date} min={today()} onInput={(e) => setDate(e.currentTarget.value)} />
        </Field>
        <Field label="Время">
          <input type="time" value={time} step={900} onInput={(e) => setTime(e.currentTarget.value)} />
        </Field>
      </div>
      <button class="primary wide" disabled={saving || !date || !time} onClick={save}>
        {props.order.status === "new" ? "Назначить и отправить реквизиты" : "Перенести"}
      </button>
    </Sheet>
  );
}
