// Modo demo: todo vive en localStorage. Sirve para ver y probar la web
// sin Supabase ni Stripe configurados.
import type { Api } from './api';
import type { Category, Order, Product, Settings } from './types';
import { slugify } from './format';

const KEY = 'ltdm.demo.v1';

interface Store {
  categories: Category[];
  products: Product[];
  orders: Order[];
  settings: Settings;
  images: Record<string, string>; // path → dataURL
  session: string | null;
}

// ── Ilustraciones de ejemplo (SVG) ──────────────────────────
const svg = (body: string, bg: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="${bg}"/>${body}</svg>`);

const scarf = (a: string, b: string, bg: string) => svg(`
  <g transform="rotate(-12 200 250)">
    <rect x="150" y="40" width="100" height="420" rx="14" fill="${a}"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="150" y="${70 + i * 56}" width="100" height="22" fill="${b}"/>`).join('')}
    ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${158 + i * 17}" y1="460" x2="${158 + i * 17}" y2="492" stroke="${a}" stroke-width="5" stroke-linecap="round"/>`).join('')}
  </g>`, bg);

const bag = (a: string, b: string, bg: string) => svg(`
  <path d="M140 200 C140 110 260 110 260 200" fill="none" stroke="${b}" stroke-width="14" stroke-linecap="round"/>
  <path d="M90 190 h220 l-24 220 a20 20 0 0 1 -20 18 h-132 a20 20 0 0 1 -20 -18 z" fill="${a}"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M${104 + i * 0} ${215 + i * 26} h${192 - i * 6}" stroke="${b}" stroke-width="3" stroke-dasharray="10 8" opacity=".55"/>`).join('')}`, bg);

const tree = (a: string, bg: string) => svg(`
  <path d="M200 70 L320 410 H80 Z" fill="${a}"/>
  ${[0, 1, 2, 3, 4].map((i) => `<path d="M${165 - i * 22} ${150 + i * 55} q35 22 ${70 + i * 44} 0" fill="none" stroke="#F6DCCB" stroke-width="8" stroke-linecap="round"/>`).join('')}
  ${[[180, 190], [230, 260], [150, 300], [260, 350], [130, 380], [205, 340]].map(([x, y], i) =>
    `<circle cx="${x}" cy="${y}" r="11" fill="${['#D9A441', '#C2553F', '#FFFDF8'][i % 3]}"/>`).join('')}
  <path d="M200 40 l10 22 24 2 -18 16 6 24 -22 -13 -22 13 6 -24 -18 -16 24 -2z" fill="#D9A441"/>
  <rect x="180" y="410" width="40" height="40" fill="#7A5A44"/>`, bg);

const star = (a: string, bg: string) => svg(`
  <line x1="200" y1="40" x2="200" y2="140" stroke="#7A6B62" stroke-width="3"/>
  <path d="M200 140 l40 82 90 10 -66 62 18 90 -82 -46 -82 46 18 -90 -66 -62 90 -10z" fill="none" stroke="${a}" stroke-width="16" stroke-linejoin="round"/>
  <path d="M200 140 l40 82 90 10 -66 62 18 90 -82 -46 -82 46 18 -90 -66 -62 90 -10z" fill="none" stroke="#FFFDF8" stroke-width="3" stroke-dasharray="4 10" stroke-linejoin="round"/>`, bg);

const candy = (bg: string) => svg(`
  <path d="M150 440 V200 a50 50 0 0 1 100 0 v20" fill="none" stroke="#FFFDF8" stroke-width="30" stroke-linecap="round"/>
  <path d="M150 440 V200 a50 50 0 0 1 100 0 v20" fill="none" stroke="#C2553F" stroke-width="30" stroke-dasharray="18 18" stroke-linecap="round"/>`, bg);

function seed(): Store {
  const cats: Category[] = [
    { id: 'c1', name: 'Bufandas', slug: 'bufandas', sort: 1 },
    { id: 'c2', name: 'Bolsos', slug: 'bolsos', sort: 2 },
    { id: 'c3', name: 'Árboles de Navidad', slug: 'arboles', sort: 3 },
    { id: 'c4', name: 'Adornos', slug: 'adornos', sort: 4 },
  ];
  const now = Date.now();
  const p = (i: number, title: string, cat: string, price: number, stock: number, images: string[], description: string): Product => ({
    id: `p${i}`, slug: slugify(title), title, description, category_id: cat, price_cents: price,
    stock, reserved: 0, images, published: true, sort: i, created_at: new Date(now - i * 864e5).toISOString(),
  });
  const products = [
    p(1, 'Bufanda Otoño a rayas', 'c1', 3800, 3, [scarf('#C2553F', '#F6DCCB', '#EFE3D3'), scarf('#9E3F2D', '#F6DCCB', '#E4E9DC')],
      'Bufanda larga tejida a crochet en lana merino suave, con rayas terracota y crema. Unos 170 cm de largo con flecos.\n\nLavar a mano en agua fría.'),
    p(2, 'Bolso Mercado mostaza', 'c2', 4500, 1, [bag('#D9A441', '#7A5A44', '#F3EADB')],
      'Bolso de algodón reciclado con asas largas, perfecto para el día a día. Pieza única.'),
    p(3, 'Árbol de Navidad de limpiapipas', 'c3', 2200, 6, [tree('#7D8F72', '#F3EADB'), tree('#5F7356', '#EDE3D2')],
      'Árbol de unos 25 cm hecho con limpiapipas verdes y bolitas de colores. Ideal para una mesa o estantería.'),
    p(4, 'Estrella dorada (adorno)', 'c4', 650, 12, [star('#D9A441', '#F6E9E2')],
      'Adorno con forma de estrella para colgar del árbol. Unos 9 cm.'),
    p(5, 'Bastón de caramelo (set de 3)', 'c4', 900, 0, [candy('#E4E9DC')],
      'Tres bastones de caramelo de limpiapipas rojos y blancos.'),
    p(6, 'Bufanda Bosque', 'c1', 4200, 2, [scarf('#7D8F72', '#E4E9DC', '#F3EADB')],
      'Bufanda en tonos verde salvia con punto de canasta. Muy calentita.'),
    p(7, 'Bolso Rosa Palo', 'c2', 3900, 2, [bag('#EBC9BC', '#C2553F', '#FAF4EA')],
      'Bolso pequeño de hombro con cierre de botón de madera.'),
  ];
  return {
    categories: cats,
    products,
    orders: [{
      id: 'o1', status: 'paid',
      items: [{ product_id: 'p3', title: 'Árbol de Navidad de limpiapipas', qty: 2, unit_price_cents: 2200 }],
      subtotal_cents: 4400, shipping_cents: 500, total_cents: 4900,
      customer_name: 'Lucía Pérez', email: 'lucia@example.com', phone: '+34 600 000 000',
      shipping_address: { line1: 'Calle Mayor 12, 2ºB', postal_code: '28013', city: 'Madrid', state: 'Madrid', country: 'ES' },
      tracking: null, notes: null, created_at: new Date(now - 36e5).toISOString(), paid_at: new Date(now - 36e5).toISOString(), shipped_at: null,
    }],
    settings: {
      shop_name: 'La tienda de María',
      tagline: 'Hecho a mano, punto a punto.',
      about_text: 'Soy María y tejo cada pieza a mano, con calma y con lana que me gusta tocar. Bufandas para el frío, bolsos para el día a día y, cuando llega diciembre, árboles y adornos de limpiapipas que llenan la casa de color.',
      contact_email: 'hola@latiendademaria.es',
      instagram: '@latiendademaria',
      shipping_flat_cents: 500,
      free_shipping_from_cents: 6000,
    },
    images: {},
    session: null,
  };
}

export function createDemoApi(): Api {
  let s: Store;
  try { s = JSON.parse(localStorage.getItem(KEY) ?? '') as Store; } catch { s = seed(); }
  if (!s?.products) s = seed();
  const authListeners = new Set<() => void>();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* lleno o privado */ } };
  const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 120));
  const uid = () => Math.random().toString(36).slice(2, 10);

  return {
    mode: 'demo',
    getSettings: () => delay(s.settings),
    listCategories: () => delay([...s.categories].sort((a, b) => a.sort - b.sort)),
    listProducts: () => delay([...s.products]
      .filter((p) => p.published || s.session)
      .sort((a, b) => a.sort - b.sort)),
    imageUrl: (path) => s.images[path] ?? path,

    async checkout(lines) {
      // Simula el pago completo: descuenta stock y crea el pedido
      const items = lines.map((l) => {
        const p = s.products.find((x) => x.id === l.product_id);
        if (!p || !p.published) throw new Error('Uno de los productos ya no está disponible.');
        if (p.stock - p.reserved < l.qty) throw new Error(`Lo sentimos, ya no quedan suficientes unidades de "${p.title}".`);
        return { p, qty: l.qty };
      });
      const subtotal = items.reduce((n, { p, qty }) => n + p.price_cents * qty, 0);
      const st = s.settings;
      const shipping = st.free_shipping_from_cents != null && subtotal >= st.free_shipping_from_cents ? 0 : st.shipping_flat_cents;
      if (subtotal + shipping < 50) throw new Error('El pedido mínimo es de 0,50 €. Añade algo más a la cesta.');
      items.forEach(({ p, qty }) => { p.stock -= qty; });
      s.orders.unshift({
        id: uid(), status: 'paid',
        items: items.map(({ p, qty }) => ({ product_id: p.id, title: p.title, qty, unit_price_cents: p.price_cents, image: p.images[0] })),
        subtotal_cents: subtotal, shipping_cents: shipping, total_cents: subtotal + shipping,
        customer_name: 'Cliente de prueba', email: 'cliente@example.com', phone: '+34 611 111 111',
        shipping_address: { line1: 'Calle de Ejemplo 1', postal_code: '41001', city: 'Sevilla', state: 'Sevilla', country: 'ES' },
        tracking: null, notes: 'Pedido simulado (modo demo)', created_at: new Date().toISOString(), paid_at: new Date().toISOString(), shipped_at: null,
      });
      save();
      return '/gracias.html?demo=1';
    },

    currentEmail: () => delay(s.session),
    async sendMagicLink(email) {
      // En demo se entra directamente
      s.session = email; save();
      authListeners.forEach((fn) => fn());
    },
    async signOut() { s.session = null; save(); authListeners.forEach((fn) => fn()); },
    isAdmin: () => delay(!!s.session),
    onAuthChange(fn) { authListeners.add(fn); },

    async saveProduct(p) {
      let row = p.id ? s.products.find((x) => x.id === p.id) : undefined;
      if (!row) {
        row = { id: uid(), slug: '', title: p.title, description: '', category_id: null, price_cents: 0, stock: 0, reserved: 0,
          images: [], published: false, sort: 0, created_at: new Date().toISOString() };
        s.products.push(row);
      }
      Object.assign(row, p);
      if (!row.slug) {
        let slug = slugify(row.title), n = 2;
        const base = slug;
        while (s.products.some((x) => x !== row && x.slug === slug)) slug = `${base}-${n++}`;
        row.slug = slug;
      }
      save();
      return delay(row);
    },
    async deleteProduct(id) {
      const p = s.products.find((x) => x.id === id);
      p?.images.forEach((i) => delete s.images[i]);
      s.products = s.products.filter((x) => x.id !== id); save();
    },
    async setStock(id, stock) {
      const p = s.products.find((x) => x.id === id); if (p) p.stock = Math.max(0, stock); save();
    },
    async uploadImage(blob) {
      const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
      const path = `demo/${uid()}`;
      s.images[path] = dataUrl; save();
      return path;
    },
    async deleteImage(path) { delete s.images[path]; save(); },
    async saveCategory(c) {
      const row = c.id ? s.categories.find((x) => x.id === c.id) : undefined;
      if (row) Object.assign(row, c, { slug: slugify(c.name) });
      else s.categories.push({ id: uid(), name: c.name, slug: slugify(c.name), sort: c.sort ?? s.categories.length + 1 });
      save();
    },
    async deleteCategory(id) {
      s.categories = s.categories.filter((x) => x.id !== id);
      s.products.forEach((p) => { if (p.category_id === id) p.category_id = null; });
      save();
    },
    async saveSettings(patch) { Object.assign(s.settings, patch); save(); },
    listOrders: () => delay(s.orders),
    async updateOrder(id, patch) { const o = s.orders.find((x) => x.id === id); if (o) Object.assign(o, patch); save(); },
    async cancelOrder(id, restock) {
      const o = s.orders.find((x) => x.id === id); if (!o) return;
      if (restock && (o.status === 'paid' || o.status === 'shipped')) {
        o.items.forEach((it) => { const p = s.products.find((x) => x.id === it.product_id); if (p) p.stock += it.qty; });
      }
      o.status = 'cancelled'; save();
    },
  };
}
