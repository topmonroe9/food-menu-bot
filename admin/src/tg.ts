interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  openTelegramLink(url: string): void;
  close(): void;
  HapticFeedback?: { notificationOccurred(type: "error" | "success" | "warning"): void };
  disableVerticalSwipes?: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg = window.Telegram?.WebApp;

export function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg?.initData) tg.showConfirm(message, resolve);
    else resolve(window.confirm(message));
  });
}

export function alert(message: string) {
  if (tg?.initData) tg.showAlert(message);
  else window.alert(message);
}

export function haptic(type: "error" | "success" | "warning" = "success") {
  tg?.HapticFeedback?.notificationOccurred(type);
}

export function openChat(username: string | null) {
  if (!username) return;
  const url = `https://t.me/${username}`;
  if (tg?.initData) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}
