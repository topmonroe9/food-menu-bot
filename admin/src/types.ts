export type OrderStatus = "new" | "awaiting_payment" | "payment_check" | "paid" | "ready" | "done" | "cancelled";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "🆕 Новый",
  awaiting_payment: "💳 Ждёт оплату",
  payment_check: "🔎 Проверить оплату",
  paid: "👩‍🍳 Готовится",
  ready: "📦 Готов к выдаче",
  done: "✔️ Выдан",
  cancelled: "✖️ Отменён",
};

export interface OrderItem {
  id: number;
  dish_title: string;
  variant_title: string;
  price: number;
  qty: number;
}

export interface Order {
  id: number;
  user_id: number;
  status: OrderStatus;
  slot_id: number | null;
  requested_at: string | null;
  requested_note: string | null;
  scheduled_at: string | null;
  comment: string | null;
  total: number;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  items: OrderItem[];
}

export interface Client {
  id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  last_activity_at: string;
  created_at: string;
  orders_count: number;
  last_order_at: string | null;
  total_spent: number;
}

export type ButtonStyle = "" | "primary" | "success" | "danger";

// telegram has exactly these button colors, "" is the client's default
export const BUTTON_STYLES: [ButtonStyle, string][] = [
  ["", "⚪️ Обычная"],
  ["primary", "🔵 Синяя"],
  ["success", "🟢 Зелёная"],
  ["danger", "🔴 Красная"],
];

export interface Category {
  id: number;
  title: string;
  position: number;
  is_visible: number;
  button_style: ButtonStyle;
}

export interface Variant {
  id?: number;
  title: string;
  weight: string;
  price: number;
  is_available: number | boolean;
}

export interface Dish {
  id: number;
  category_id: number;
  title: string;
  description: string;
  photo_path: string | null;
  position: number;
  is_visible: number;
  variants: Variant[];
}

export interface Slot {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked: number;
}

export interface Admin {
  user_id: number;
  role: "owner" | "helper";
  notify: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

export interface ClientStats {
  revenue: number;
  paid_orders: number;
  cancelled_orders: number;
  total_orders: number;
  avg_check: number;
  first_order_at: string | null;
  last_order_at: string | null;
  avg_days_between: number | null;
  favorites: { title: string; orders: number; qty: number; amount: number }[];
}

export interface Broadcast {
  id: number;
  status: "sending" | "done" | "cancelled" | "interrupted";
  preview_text: string;
  total: number;
  sent: number;
  failed: number;
  created_at: string;
  author: string | null;
}

export interface Me {
  id: number;
  name: string;
  owner: boolean;
  notify: boolean;
}

export type Settings = Record<
  "welcome_text" | "payment_details" | "pickup_address" | "payment_reminder_hours" | "digest_hour" | "cook_name" | "cook_name_dative",
  string
> &
  Record<"main_button_style" | "variant_button_style", ButtonStyle>;
