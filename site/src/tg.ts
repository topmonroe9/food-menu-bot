interface TelegramWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  showAlert(message: string): void;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { notificationOccurred(type: "error" | "success" | "warning"): void; selectionChanged(): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

const webApp = window.Telegram?.WebApp;
export const tg = webApp?.initData ? webApp : undefined;

export function alert(message: string) {
  if (tg) tg.showAlert(message);
  else window.alert(message);
}

export function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg) tg.showConfirm(message, resolve);
    else resolve(window.confirm(message));
  });
}

export function haptic(type: "error" | "success" | "warning" | "tap" = "success") {
  if (type === "tap") tg?.HapticFeedback?.selectionChanged();
  else tg?.HapticFeedback?.notificationOccurred(type);
}
