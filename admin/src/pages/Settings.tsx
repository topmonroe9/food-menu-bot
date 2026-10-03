import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { confirm, haptic, tg } from "../tg";
import { BUTTON_STYLES, type Admin, type Broadcast, type Client, type Me, type Settings } from "../types";
import { personName, shortDateTime } from "../format";
import { Chips, Empty, Field, Sheet, Toggle } from "../ui";

export function SettingsPage(props: { me: Me; botUsername: string; onMeChanged: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    void api.get<Settings>("/settings").then(setSettings);
  }, []);

  if (!settings) return <Empty>Загрузка…</Empty>;

  const set = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch });
    setSaved(false);
  };

  const save = async () => {
    setSettings(await api.put<Settings>("/settings", settings));
    setSaved(true);
    haptic();
  };

  return (
    <section>
      <h1>Настройки</h1>
      <Field label="Реквизиты для оплаты" hint="Клиент увидит их, когда вы подтвердите время заказа">
        <textarea rows={3} value={settings.payment_details} placeholder="Сбер, +7 900 000-00-00, Анна К." onInput={(e) => set({ payment_details: e.currentTarget.value })} />
      </Field>
      <Field label="Адрес самовывоза">
        <textarea rows={2} value={settings.pickup_address} placeholder="ул. Ленина 1, подъезд 2. Позвоните, когда подъедете" onInput={(e) => set({ pickup_address: e.currentTarget.value })} />
      </Field>
      <div class="row gap">
        <Field label="Имя в сообщениях клиентам" hint={`«${settings.cook_name || "…"} подтвердит время»`}>
          <input value={settings.cook_name} placeholder="Виктория" onInput={(e) => set({ cook_name: e.currentTarget.value, cook_name_dative: "" })} />
        </Field>
        <Field label="Кому (дательный падеж)" hint={`«Заказ отправлен ${settings.cook_name_dative || "…"}»`}>
          <input value={settings.cook_name_dative} placeholder="заполнится при сохранении" onInput={(e) => set({ cook_name_dative: e.currentTarget.value })} />
        </Field>
      </div>
      <p class="muted small">Склонение бот подбирает сам, когда вы меняете имя. Если после сохранения оно вышло неверным — поправьте второе поле.</p>
      <Field label="Приветствие в боте">
        <textarea rows={4} value={settings.welcome_text} onInput={(e) => set({ welcome_text: e.currentTarget.value })} />
      </Field>
      <div class="row gap">
        <Field label="Напомнить об оплате через, ч" hint="0 — не напоминать">
          <input type="number" min={0} value={settings.payment_reminder_hours} onInput={(e) => set({ payment_reminder_hours: e.currentTarget.value })} />
        </Field>
        <Field label="Утренняя сводка в, ч" hint="заказы на сегодня">
          <input type="number" min={0} max={23} value={settings.digest_hour} onInput={(e) => set({ digest_hour: e.currentTarget.value })} />
        </Field>
      </div>
      <h2>Цвета кнопок в боте</h2>
      <p class="muted small">
        Зелёным бот всегда отмечает то, что уже в корзине, красным — «убрать». Цвет кнопки раздела меняется в «Меню»: нажмите на
        название раздела. В старых версиях Telegram кнопки останутся обычными.
      </p>
      <div class="field">
        <span>Главная кнопка: «Корзина», «Оформить заказ», «Подтвердить заказ»</span>
        <Chips value={settings.main_button_style} options={BUTTON_STYLES} onChange={(v) => set({ main_button_style: v })} />
      </div>
      <div class="field">
        <span>Кнопки «➕ добавить» в карточке блюда</span>
        <Chips value={settings.variant_button_style} options={BUTTON_STYLES} onChange={(v) => set({ variant_button_style: v })} />
      </div>
      <button class="primary wide" disabled={saved} onClick={save}>
        {saved ? "Сохранено" : "Сохранить"}
      </button>

      <Broadcasts botUsername={props.botUsername} />
      <Admins me={props.me} onMeChanged={props.onMeChanged} />
    </section>
  );
}

function Admins(props: { me: Me; onMeChanged: () => void }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [envOwners, setEnvOwners] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);

  const load = () =>
    api.get<{ admins: Admin[]; envOwners: number[] }>("/admins").then((data) => {
      setAdmins(data.admins);
      setEnvOwners(data.envOwners);
    });
  useEffect(() => void load(), []);

  const toggleNotify = async (a: Admin, value: boolean) => {
    await api.patch(`/admins/${a.user_id}`, { notify: value });
    await load();
    if (a.user_id === props.me.id) props.onMeChanged();
  };

  const remove = async (a: Admin) => {
    if (!(await confirm(`Убрать ${personName(a)} из админов?`))) return;
    await api.del(`/admins/${a.user_id}`);
    await load();
  };

  return (
    <>
      <h2>Администраторы</h2>
      <p class="muted small">Все админы видят эту панель. Уведомления о заказах приходят тем, у кого они включены.</p>
      {admins.map((a) => {
        const isMe = a.user_id === props.me.id;
        const canEdit = isMe || props.me.owner;
        return (
          <div class="card">
            <div class="row between">
              <b>
                {personName(a)} {isMe && <span class="muted">(вы)</span>}
              </b>
              <span class="status">{a.role === "owner" ? "владелец" : "помощник"}</span>
            </div>
            {canEdit && <Toggle label="Уведомления о заказах" checked={!!a.notify} onChange={(v) => toggleNotify(a, v)} />}
            {props.me.owner && !isMe && !envOwners.includes(a.user_id) && (
              <button class="link danger-text small" onClick={() => remove(a)}>
                Убрать из админов
              </button>
            )}
          </div>
        );
      })}
      {props.me.owner && (
        <button class="wide" onClick={() => setAdding(true)}>
          + Добавить администратора
        </button>
      )}
      {adding && (
        <AddAdminSheet
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
    </>
  );
}

function AddAdminSheet(props: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [role, setRole] = useState<"helper" | "owner">("helper");

  useEffect(() => {
    const timer = setTimeout(() => {
      void api.get<Client[]>(`/clients?q=${encodeURIComponent(query)}`).then(setClients);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const add = async (c: Client) => {
    if (!(await confirm(`Сделать ${personName(c)} ${role === "owner" ? "владельцем" : "помощником"}?`))) return;
    await api.post("/admins", { userId: c.id, role });
    haptic();
    props.onAdded();
  };

  return (
    <Sheet title="Новый администратор" onClose={props.onClose}>
      <p class="muted small">Человек должен хотя бы раз нажать /start в боте — тогда он появится в этом списке.</p>
      <Toggle label="Владелец (может управлять админами)" checked={role === "owner"} onChange={(v) => setRole(v ? "owner" : "helper")} />
      <input class="search" type="search" placeholder="Имя или @username" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      {clients.slice(0, 30).map((c) => (
        <button class="card list-row" onClick={() => add(c)}>
          <span>
            <b>{personName(c)}</b> {c.username && <span class="muted">@{c.username}</span>}
          </span>
          <span>＋</span>
        </button>
      ))}
    </Sheet>
  );
}

const BROADCAST_STATUS: Record<Broadcast["status"], string> = {
  sending: "📤 отправляется",
  done: "✅ отправлена",
  cancelled: "✖️ отменена",
  interrupted: "⚠️ прервана",
};

function Broadcasts(props: { botUsername: string }) {
  const [list, setList] = useState<Broadcast[]>([]);

  useEffect(() => {
    void api.get<Broadcast[]>("/broadcasts").then(setList);
  }, []);

  const create = () => {
    const url = `https://t.me/${props.botUsername}?start=broadcast`;
    if (tg?.initData) {
      tg.openTelegramLink(url);
      tg.close();
    } else window.open(url, "_blank");
  };

  return (
    <>
      <h2>Рассылки</h2>
      <p class="muted small">
        Сообщение пишется прямо в чате с ботом — с фото, эмодзи и форматированием. Бот покажет превью и отправит всем после
        подтверждения.
      </p>
      <button class="primary wide" onClick={create}>
        📣 Новая рассылка
      </button>
      {list.map((b) => (
        <div class="card compact">
          <div class="row between small">
            <span>{shortDateTime(b.created_at)}{b.author ? ` · ${b.author}` : ""}</span>
            <span class="muted">{BROADCAST_STATUS[b.status]}</span>
          </div>
          <div class="small clamp">{b.preview_text}</div>
          {b.status !== "cancelled" && (
            <div class="muted small">
              доставлено {b.sent} из {b.total}
              {b.failed > 0 && ` · не доставлено ${b.failed}`}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
