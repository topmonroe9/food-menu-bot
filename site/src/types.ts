export interface Variant {
  id: number;
  title: string;
  weight: string;
  price: number;
}

export interface Dish {
  id: number;
  title: string;
  description: string;
  photo: string | null;
  variants: Variant[];
}

export interface Category {
  id: number;
  title: string;
  dishes: Dish[];
}

export interface SlotOption {
  id: number;
  day: string;
  date: string;
  start: string;
  end: string;
  times: string[];
}

export type OrderStatus = "new" | "awaiting_payment" | "payment_check" | "paid" | "ready" | "done" | "cancelled";

export interface OrderItem {
  title: string;
  variant: string;
  qty: number;
  price: number;
  variantId: number | null;
}

export interface Order {
  id: number;
  status: OrderStatus;
  statusLabel: string;
  items: OrderItem[];
  total: number;
  when: string | null;
  wish: string | null;
  comment: string | null;
  address: string | null;
  payment: string | null;
  canPay: boolean;
  canCancel: boolean;
}

export interface Profile {
  name: string;
  phone: string;
}

export interface Bootstrap {
  cook: string;
  welcome: string;
  categories: Category[];
  telegram: boolean;
  profile: Profile | null;
  orders: Order[];
  slots: SlotOption[];
}

export type Cart = Record<number, number>;
