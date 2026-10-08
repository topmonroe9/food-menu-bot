import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { openChat, openWhatsApp } from "../tg";
import { STATUS_LABEL, type Client, type ClientStats, type Order } from "../types";
import { formatPhone, itemLabel, money, personName, shortDateTime } from "../format";
import { Chips, Empty, Sheet } from "../ui";

type Sort = "recent" | "revenue" | "orders";

const SORTS: [Sort, string][] = [
  ["recent", "Недавние"],
  ["revenue", "Больше всего потратили"],
  ["orders", "Чаще заказывают"],
];

export function ClientsPage(props: { openId: number | null; onOpen: (id: number | null) => void; sheetOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [clients, setClients] = useState<Client[] | null>(null);

  useEffect(() => {
    if (props.sheetOnly) return;
    const timer = setTimeout(() => {
      void api.get<Client[]>(`/clients?q=${encodeURIComponent(query)}&sort=${sort}`).then(setClients);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, sort]);

  const sheet = props.openId !== null && <ClientSheet id={props.openId} onClose={() => props.onOpen(null)} />;
  if (props.sheetOnly) return <>{sheet}</>;

  return (
    <section>
      <h1>Клиенты</h1>
      <input class="search" type="search" placeholder="Имя, @username или телефон" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      <Chips value={sort} options={SORTS} onChange={setSort} />
      {clients === null && <Empty>Загрузка…</Empty>}
      {clients?.length === 0 && <Empty>Никого не нашли</Empty>}
      {clients?.map((c) => (
        <button class="card list-row" onClick={() => props.onOpen(c.id)}>
          <div>
            <b>{personName(c)}</b> {c.username && <span class="muted">@{c.username}</span>}
            {c.phone && <span class="muted"> {formatPhone(c.phone)} 🌐</span>}
            <div class="muted small">
              {c.orders_count > 0 ? `${c.orders_count} заказ(ов) · ${money(c.total_spent)}` : "ещё не заказывал(а)"}
            </div>
          </div>
          <span class="muted small">{shortDateTime(c.last_activity_at)}</span>
        </button>
      ))}
      {sheet}
    </section>
  );
}

function frequency(days: number | null): string {
  if (days === null) return "—";
  if (days < 1.5) return "почти каждый день";
  if (days < 10) return `раз в ${Math.round(days)} дн.`;
  if (days < 45) return `раз в ${Math.round(days / 7)} нед.`;
  return `раз в ${Math.round(days / 30)} мес.`;
}

function Stats(props: { stats: ClientStats }) {
  const s = props.stats;
  if (s.total_orders === 0) return <p class="muted">Заказов пока не было</p>;
  return (
    <>
      <div class="stats">
        <div>
          <b>{money(s.revenue)}</b>
          <span>заработано</span>
        </div>
        <div>
          <b>{s.paid_orders}</b>
          <span>оплачено заказов</span>
        </div>
        <div>
          <b>{s.avg_check ? money(s.avg_check) : "—"}</b>
          <span>средний чек</span>
        </div>
        <div>
          <b>{frequency(s.avg_days_between)}</b>
          <span>как часто</span>
        </div>
      </div>
      <p class="muted small">
        Первый заказ: {s.first_order_at ? shortDateTime(s.first_order_at.slice(0, 10)) : "—"} · последний:{" "}
        {s.last_order_at ? shortDateTime(s.last_order_at.slice(0, 10)) : "—"}
        {s.cancelled_orders > 0 && ` · отмен: ${s.cancelled_orders}`}
      </p>
      {s.favorites.length > 0 && (
        <>
          <h3>Любимые блюда</h3>
          <ol class="favorites">
            {s.favorites.map((f) => (
              <li>
                <span>{f.title}</span>
                <span class="muted small">
                  {f.orders} раз · {f.qty} шт · {money(f.amount)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function ClientSheet(props: { id: number; onClose: () => void }) {
  const [data, setData] = useState<{ user: Client; orders: Order[]; stats: ClientStats } | null>(null);

  useEffect(() => {
    void api.get<{ user: Client; orders: Order[]; stats: ClientStats }>(`/clients/${props.id}`).then(setData);
  }, [props.id]);

  return (
    <Sheet title={data ? personName(data.user) : "Клиент"} onClose={props.onClose}>
      {!data && <Empty>Загрузка…</Empty>}
      {data && (
        <>
          <p class="muted">
            {data.user.username ? `@${data.user.username} · ` : ""}
            {data.user.phone ? `${formatPhone(data.user.phone)} · заказывает с сайта · ` : ""}с нами с {shortDateTime(data.user.created_at.slice(0, 10))}
            <br />
            последняя активность: {shortDateTime(data.user.last_activity_at)}
          </p>
          {data.user.phone ? (
            <button class="wide" onClick={() => openWhatsApp(data.user.phone!)}>
              💬 Написать в WhatsApp
            </button>
          ) : data.user.username ? (
            <button class="wide" onClick={() => openChat(data.user.username)}>
              💬 Написать в личку
            </button>
          ) : (
            <p class="note">У клиента нет @username — написать можно по ссылке из карточки заказа в боте.</p>
          )}
          <Stats stats={data.stats} />
          <h3>Заказы</h3>
          {data.orders.length === 0 && <Empty>Заказов пока нет</Empty>}
          {data.orders.map((o) => (
            <div class="card compact">
              <div class="row between">
                <b>#{o.id}</b>
                <span class="status">{STATUS_LABEL[o.status]}</span>
              </div>
              <div class="small">{o.items.map((i) => `${itemLabel(i)} × ${i.qty}`).join(", ")}</div>
              <div class="row between small">
                <span>{money(o.total)}</span>
                <span class="muted">{shortDateTime(o.scheduled_at ?? o.created_at)}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}
