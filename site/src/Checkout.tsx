import { useState } from "preact/hooks";
import type { Bootstrap, Cart, Order, Profile } from "./types";
import { money, variantLabel } from "./format";
import { api } from "./api";
import { haptic } from "./tg";
import { Screen, Stepper } from "./ui";

export function CheckoutView(props: {
  data: Bootstrap;
  cart: Cart;
  profile: Profile;
  onCart: (variantId: number, delta: number) => void;
  onProfile: (profile: Profile) => void;
  onPlaced: (order: Order) => void;
  onBack: () => void;
}) {
  const { data, cart, profile } = props;
  const lines = data.categories
    .flatMap((c) => c.dishes)
    .flatMap((d) => d.variants.filter((v) => cart[v.id]).map((v) => ({ dish: d, variant: v, qty: cart[v.id] })));
  const total = lines.reduce((s, l) => s + l.variant.price * l.qty, 0);

  const [slotId, setSlotId] = useState<number | null>(data.slots[0]?.id ?? null);
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const slot = data.slots.find((s) => s.id === slotId);
  const whenReady = slot ? !!time : note.trim().length > 0;
  const contactsReady = data.telegram || (profile.name.trim() && profile.phone.replace(/\D/g, "").length >= 10);
  const canSend = lines.length > 0 && whenReady && contactsReady && !sending;

  const send = async () => {
    setSending(true);
    try {
      const order = await api.post<Order>("/orders", {
        items: lines.map((l) => ({ variantId: l.variant.id, qty: l.qty })),
        slotId: slot?.id,
        time: slot ? time : undefined,
        note: slot ? undefined : note,
        comment,
        name: profile.name,
        phone: profile.phone,
      });
      haptic();
      props.onPlaced(order);
    } catch {
      haptic("error");
    } finally {
      setSending(false);
    }
  };

  if (lines.length === 0) {
    return (
      <Screen title="Корзина" onBack={props.onBack}>
        <div class="empty">
          Корзина пуста
          <button class="primary wide" onClick={props.onBack}>
            Открыть меню
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      title="Оформление"
      onBack={props.onBack}
      footer={
        <button class="primary wide" disabled={!canSend} onClick={send}>
          <span>{sending ? "Отправляем…" : "Отправить заказ"}</span>
          <span>{money(total)}</span>
        </button>
      }
    >
      <h2>Корзина</h2>
      <div class="card">
        {lines.map((l) => {
          const label = variantLabel(l.variant);
          return (
            <div class="line">
              <div>
                <div>{l.dish.title}</div>
                <div class="muted small">
                  {label && `${label} · `}
                  {money(l.variant.price * l.qty)}
                </div>
              </div>
              <Stepper qty={l.qty} onChange={(d) => props.onCart(l.variant.id, d)} />
            </div>
          );
        })}
        <div class="line total">
          <span>Итого</span>
          <b>{money(total)}</b>
        </div>
      </div>

      <h2>Когда забрать</h2>
      {data.slots.length > 0 && (
        <div class="chips">
          {data.slots.map((s) => (
            <button
              class={s.id === slotId ? "chip active" : "chip"}
              onClick={() => {
                setSlotId(s.id);
                setTime("");
              }}
            >
              {s.day} · {s.start}–{s.end}
            </button>
          ))}
          <button class={slotId === null ? "chip active" : "chip"} onClick={() => setSlotId(null)}>
            📅 Другая дата
          </button>
        </div>
      )}
      {slot && (
        <>
          <p class="muted small">{slot.date}, во сколько удобно?</p>
          <div class="chips times">
            {slot.times.map((t) => (
              <button class={t === time ? "chip active" : "chip"} onClick={() => setTime(t)}>
                {t}
              </button>
            ))}
          </div>
        </>
      )}
      {!slot && (
        <label class="field">
          <span>
            {data.slots.length === 0 ? "Свободных окошек пока нет. " : ""}Напишите, когда вам удобно — {data.cook} согласует время
          </span>
          <input value={note} maxLength={500} placeholder="Например: в субботу после 18:00" onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
      )}

      <label class="field">
        <span>Комментарий</span>
        <textarea rows={2} value={comment} maxLength={500} placeholder="Без лука, торт на 8 человек…" onInput={(e) => setComment(e.currentTarget.value)} />
      </label>

      {data.telegram ? (
        <p class="note">Заказ оформится на ваш Telegram, все уведомления придут в чат с ботом.</p>
      ) : (
        <>
          <h2>Контакты</h2>
          <label class="field">
            <span>Имя</span>
            <input value={profile.name} maxLength={60} autocomplete="name" placeholder="Как к вам обращаться" onInput={(e) => props.onProfile({ ...profile, name: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span>Телефон (WhatsApp)</span>
            <input type="tel" value={profile.phone} autocomplete="tel" placeholder="+7 900 000-00-00" onInput={(e) => props.onProfile({ ...profile, phone: e.currentTarget.value })} />
          </label>
        </>
      )}
      <p class="muted small">
        После отправки {data.cook} подтвердит время. Статус заказа, адрес и реквизиты для оплаты появятся на этой странице.
      </p>
    </Screen>
  );
}
