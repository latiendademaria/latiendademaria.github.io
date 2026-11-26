// Pedido con pago en curso en ESTA pestaña. Se usa sessionStorage (por pestaña)
// para no liberar el pago de un cliente que tiene la tienda abierta en otra pestaña.
const KEY = 'ltdm.pendingCheckout';

export const pendingCheckout = {
  get(): string | null {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
  },
  set(orderId: string) {
    try { sessionStorage.setItem(KEY, orderId); } catch { /* modo privado */ }
  },
  clear() {
    try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
  },
};
