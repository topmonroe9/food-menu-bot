import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "./api";
import { tg } from "./tg";
import type { Me } from "./types";
import { OrdersPage } from "./pages/Orders";
import { ClientsPage } from "./pages/Clients";
import { MenuPage } from "./pages/Menu";
import { SlotsPage } from "./pages/Slots";
import { SettingsPage } from "./pages/Settings";

type Tab = "orders" | "clients" | "menu" | "slots" | "settings";

const TABS: [Tab, string, string][] = [
  ["orders", "📋", "Заказы"],
  ["clients", "👥", "Клиенты"],
  ["menu", "🍽", "Меню"],
  ["slots", "📅", "Окошки"],
  ["settings", "⚙️", "Ещё"],
];

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [botUsername, setBotUsername] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem("tab") as Tab) || "orders");
  const [clientId, setClientId] = useState<number | null>(null);

  const loadBootstrap = () =>
    api
      .get<{ me: Me; counts: Record<string, number>; botUsername: string }>("/bootstrap")
      .then((data) => {
        setMe(data.me);
        setBotUsername(data.botUsername);
        setCounts(data.counts);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    tg?.ready();
    tg?.expand();
    tg?.disableVerticalSwipes?.();
    void loadBootstrap();
  }, []);

  const switchTab = (next: Tab) => {
    setTab(next);
    try {
      sessionStorage.setItem("tab", next);
    } catch {
      // storage can be blocked, tab memory is just a nicety
    }
  };

  if (error) return <div class="empty">🔒 {error}</div>;
  if (!me) return <div class="empty">Загрузка…</div>;

  const attention = (counts.new ?? 0) + (counts.payment_check ?? 0);

  return (
    <>
      <main>
        {tab === "orders" && <OrdersPage onChanged={loadBootstrap} onOpenClient={setClientId} />}
        {tab === "clients" && <ClientsPage openId={clientId} onOpen={setClientId} />}
        {tab === "menu" && <MenuPage />}
        {tab === "slots" && <SlotsPage />}
        {tab === "settings" && <SettingsPage me={me} botUsername={botUsername} onMeChanged={loadBootstrap} />}
      </main>
      <nav class="tabbar">
        {TABS.map(([key, icon, label]) => (
          <button class={tab === key ? "active" : ""} onClick={() => switchTab(key)}>
            <span class="tab-icon">
              {icon}
              {key === "orders" && attention > 0 && <b class="badge">{attention}</b>}
            </span>
            {label}
          </button>
        ))}
      </nav>
      {clientId !== null && tab !== "clients" && <ClientsPage openId={clientId} onOpen={setClientId} sheetOnly />}
    </>
  );
}

render(<App />, document.getElementById("app")!);
