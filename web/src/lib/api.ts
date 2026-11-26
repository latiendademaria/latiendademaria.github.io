import type { CartLine, Category, Order, OrderStatus, Product, Settings } from './types';

export interface Api {
  mode: 'demo' | 'live';

  // Público
  getSettings(): Promise<Settings>;
  listCategories(): Promise<Category[]>;
  listProducts(): Promise<Product[]>; // con sesión admin incluye no publicados
  imageUrl(path: string): string;
  /** Devuelve la URL de Stripe Checkout a la que redirigir */
  checkout(lines: CartLine[]): Promise<string>;

  // Sesión
  currentEmail(): Promise<string | null>;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  isAdmin(): Promise<boolean>;
  onAuthChange(fn: () => void): void;

  // Admin
  saveProduct(p: Partial<Product> & { title: string }): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  setStock(id: string, stock: number): Promise<void>;
  uploadImage(blob: Blob): Promise<string>;
  deleteImage(path: string): Promise<void>;
  saveCategory(c: Partial<Category> & { name: string }): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  saveSettings(s: Partial<Settings>): Promise<void>;
  listOrders(): Promise<Order[]>;
  updateOrder(id: string, patch: { status?: OrderStatus; tracking?: string | null; notes?: string | null; shipped_at?: string | null }): Promise<void>;
  cancelOrder(id: string, restock: boolean): Promise<void>;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let instance: Promise<Api> | null = null;

/** Sin credenciales de Supabase la web funciona en modo demo (localStorage) */
export function getApi(): Promise<Api> {
  instance ??= url && key
    ? import('./supabase-api').then((m) => m.createSupabaseApi(url, key))
    : import('./demo-api').then((m) => m.createDemoApi());
  return instance;
}
