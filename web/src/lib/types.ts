export interface Category {
  id: string;
  name: string;
  slug: string;
  sort: number;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  category_id: string | null;
  price_cents: number;
  stock: number;
  reserved: number;
  images: string[]; // rutas en Storage (o URLs absolutas / data: en demo)
  published: boolean;
  sort: number;
  created_at: string;
}

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled' | 'expired';

export interface OrderItem {
  product_id: string;
  title: string;
  qty: number;
  unit_price_cents: number;
  image?: string | null;
}

export interface Address {
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface Order {
  id: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  shipping_address: Address | null;
  tracking: string | null;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
}

export interface Settings {
  shop_name: string;
  tagline: string;
  about_text: string;
  contact_email: string;
  instagram: string;
  shipping_flat_cents: number;
  free_shipping_from_cents: number | null;
}

export interface CartLine {
  product_id: string;
  qty: number;
}

export const available = (p: Product) => Math.max(0, p.stock - p.reserved);
