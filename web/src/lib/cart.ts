import type { CartLine } from './types';

const KEY = 'ltdm.cart.v1';
type Listener = (lines: CartLine[]) => void;
const listeners = new Set<Listener>();

function read(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((l) => l && typeof l.product_id === 'string' && l.qty > 0) : [];
  } catch { return []; }
}
function write(lines: CartLine[]) {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* modo privado */ }
  listeners.forEach((fn) => fn(lines));
}

export const cart = {
  lines: read,
  count: () => read().reduce((n, l) => n + l.qty, 0),
  qtyOf: (id: string) => read().find((l) => l.product_id === id)?.qty ?? 0,
  add(id: string, qty = 1, max = Infinity) {
    const lines = read();
    const l = lines.find((x) => x.product_id === id);
    if (l) l.qty = Math.min(max, l.qty + qty); else lines.push({ product_id: id, qty: Math.min(max, qty) });
    write(lines.filter((x) => x.qty > 0));
  },
  set(id: string, qty: number) {
    write(read().map((l) => (l.product_id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0));
  },
  remove(id: string) { write(read().filter((l) => l.product_id !== id)); },
  clear() { write([]); },
  onChange(fn: Listener) { listeners.add(fn); },
};

// Sincroniza entre pestañas
window.addEventListener('storage', (e) => { if (e.key === KEY) listeners.forEach((fn) => fn(read())); });
