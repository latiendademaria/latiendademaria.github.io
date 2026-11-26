import './styles/base.css';
import './styles/shop.css';
import { getApi, type Api } from './lib/api';
import { cart } from './lib/cart';
import { $, $$, esc, icons, lockScroll, toast } from './lib/dom';
import { money } from './lib/format';
import { brand, footer, yarnMark } from './lib/layout';
import { available, type Category, type Product, type Settings } from './lib/types';

let api: Api;
let products: Product[] = [];
let categories: Category[] = [];
let settings: Settings;
const state = { cat: 'all', avail: 'all' as 'all' | 'in' | 'out' };

const byId = (id: string) => products.find((p) => p.id === id);
const img = (p: Product, i = 0) => (p.images[i] ? api.imageUrl(p.images[i]) : '/favicon.svg');
const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '';

// ── Arranque ───────────────────────────────────────
async function init() {
  $('#brand').outerHTML = brand('#');
  $('.cart-btn__icon').innerHTML = icons.bag;
  $('#cart-close').innerHTML = icons.close;

  renderRibbon();
  api = await getApi();
  if (api.mode === 'demo') {
    $('#demo-banner').innerHTML = '<div class="demo-banner">Modo demo · datos de ejemplo guardados en este navegador · <a href="/admin/">abrir panel</a></div>';
  }

  try {
    // Si este cliente volvió de Stripe sin pagar, devuelve sus unidades antes de mostrar el stock
    await api.releaseAbandonedCheckout().catch(() => false);
    [settings, categories, products] = await Promise.all([api.getSettings(), api.listCategories(), api.listProducts()]);
  } catch (e) {
    console.error(e);
    $('#grid').innerHTML = '<div class="grid__empty">No se ha podido cargar la tienda. Prueba a recargar la página.</div>';
    return;
  }
  products = products.filter((p) => p.published);

  renderStatic();
  renderFilters();
  renderGrid();
  reconcileCart();
  renderCart();
  bindEvents();
  openFromHash();

  const params = new URLSearchParams(location.search);
  if (params.get('pago') === 'cancelado') {
    toast('Has cancelado el pago. Tu cesta sigue aquí.');
    history.replaceState(null, '', location.pathname + location.hash);
  }
}

/** mailto con asunto y una pequeña plantilla para encargos */
function mailto(to: string) {
  const subject = 'Encargo especial · La tienda de María';
  const body = 'Hola María,\n\nMe gustaría encargarte:\n\n- Qué pieza:\n- Colores:\n- Medidas (si aplica):\n- Para cuándo lo necesito:\n\n¡Gracias!';
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── Cinta superior ────────────────────────────────
let ribbonTimer: number | undefined;
let ribbonMsgs: string[] = [];

function renderRibbon() {
  const free = settings?.free_shipping_from_cents;
  const ship = !settings ? 'Envíos a toda la península'
    : free != null ? `Envío gratis desde ${money(free)}`
    : settings.shipping_flat_cents === 0 ? 'Envío gratis' : `Envío a península por ${money(settings.shipping_flat_cents)}`;
  ribbonMsgs = [ship, 'Hecho a mano en España', 'Piezas en pequeña tirada', 'Pago seguro con tarjeta, Apple Pay o Google Pay', 'Devoluciones en 14 días'];
  layoutRibbon();
}

/** Construye la cinta a la medida de la pantalla */
function layoutRibbon() {
  const track = $('#ribbon');
  clearInterval(ribbonTimer);
  const span = (m: string) => `<span>${esc(m)}</span>`;

  // "Reducir movimiento": sin desplazamiento, los mensajes se van alternando con un fundido
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let i = 0;
    track.className = 'ribbon__track ribbon__track--fade';
    track.innerHTML = span(ribbonMsgs[0]);
    ribbonTimer = window.setInterval(() => {
      const el = track.firstElementChild as HTMLElement;
      el.classList.add('is-out');
      setTimeout(() => { i = (i + 1) % ribbonMsgs.length; el.textContent = ribbonMsgs[i]; el.classList.remove('is-out'); }, 400);
    }, 4000);
    return;
  }

  // Desplazamiento: un grupo que cubra la pantalla y su copia (la animación mueve -50%).
  // Sin copias de más: en móvil la capa animada queda pequeña (Safari no anima capas enormes).
  track.className = 'ribbon__track';
  track.innerHTML = `<div class="ribbon__group">${ribbonMsgs.map(span).join('')}</div>`;
  const group = track.firstElementChild as HTMLElement;
  const one = group.innerHTML;
  while (group.scrollWidth < window.innerWidth && group.childElementCount < 40) group.insertAdjacentHTML('beforeend', one);
  track.insertAdjacentHTML('beforeend', `<div class="ribbon__group" aria-hidden="true">${group.innerHTML}</div>`);
  // Velocidad constante (~40 px/s) sea cual sea el ancho
  track.style.setProperty('--ribbon-duration', `${Math.round(group.scrollWidth / 40)}s`);
}

// ── Contenido que depende de ajustes ──────────────
function renderStatic() {
  renderRibbon();

  $('#about-mark').innerHTML = yarnMark;
  $('#about-text').innerHTML = esc(settings.about_text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  const free = settings.free_shipping_from_cents;
  $('#ship-text').textContent =
    `Envío a España peninsular por ${money(settings.shipping_flat_cents)}` +
    (free != null ? `, y gratis en pedidos desde ${money(free)}.` : '.');

  const ig = settings.instagram.replace(/^@/, '');
  $('#contact-links').innerHTML = [
    settings.contact_email && `<a class="btn btn--accent btn--lg" href="${esc(mailto(settings.contact_email))}">${icons.mail} Enviar un correo</a>`,
    ig && `<a class="btn btn--ghost" href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">Instagram @${esc(ig)}</a>`,
  ].filter(Boolean).join('');

  $('#footer').outerHTML = footer(settings.contact_email, settings.instagram);
}

// ── Filtros y rejilla ─────────────────────────────
function renderFilters() {
  const used = new Set(products.map((p) => p.category_id));
  const cats = categories.filter((c) => used.has(c.id));
  $('#cat-filter').innerHTML = [{ id: 'all', name: 'Todo' }, ...cats]
    .map((c) => `<button class="chip${state.cat === c.id ? ' is-on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`)
    .join('');
}

function tagFor(p: Product) {
  const a = available(p);
  if (a === 0) return '<span class="tag tag--out">Agotado</span>';
  if (p.stock === 1) return '<span class="tag tag--unique">Pieza única</span>';
  if (a <= 2) return `<span class="tag tag--low">Quedan ${a}</span>`;
  return '';
}

function renderGrid() {
  const list = products.filter((p) =>
    (state.cat === 'all' || p.category_id === state.cat) &&
    (state.avail === 'all' || (state.avail === 'in' ? available(p) > 0 : available(p) === 0)));

  // Disponibles primero
  list.sort((a, b) => Number(available(b) > 0) - Number(available(a) > 0));

  const n = list.length;
  $('#shop-count').textContent = n === 1 ? '1 pieza' : `${n} piezas`;
  $('#grid').setAttribute('aria-busy', 'false');
  $('#grid').innerHTML = list.length
    ? list.map((p) => {
      const out = available(p) === 0;
      return `<article class="card${out ? ' is-out' : ''}" data-open="${esc(p.slug)}" tabindex="0" role="button" aria-label="${esc(p.title)}, ${money(p.price_cents)}">
        <div class="card__media">
          ${tagFor(p)}
          <img src="${esc(img(p))}" alt="" loading="lazy">
          ${p.images[1] ? `<img src="${esc(img(p, 1))}" alt="" loading="lazy">` : ''}
          ${out ? '' : `<button class="card__add" data-add="${esc(p.id)}" aria-label="Añadir ${esc(p.title)} a la cesta">${icons.plus}</button>`}
        </div>
        <div class="card__body"><h3 class="card__title">${esc(p.title)}</h3><span class="card__price">${money(p.price_cents)}</span></div>
        <div class="card__cat">${esc(catName(p.category_id))}</div>
      </article>`;
    }).join('')
    : '<div class="grid__empty">No hay nada por aquí… todavía.</div>';
}

// ── Detalle de producto ───────────────────────────
const modal = () => $<HTMLDialogElement>('#product-modal');

function openProduct(slug: string) {
  const p = products.find((x) => x.slug === slug);
  if (!p) return;
  const a = available(p);
  const inCart = cart.qtyOf(p.id);
  const maxAdd = Math.max(0, a - inCart);
  let qty = Math.min(1, maxAdd);

  const m = modal();
  m.innerHTML = `
    <button class="icon-btn pm__close" data-close aria-label="Cerrar">${icons.close}</button>
    <div class="pm">
      <div class="pm__gallery">
        <img class="pm__main" src="${esc(img(p))}" alt="${esc(p.title)}">
        ${p.images.length > 1 ? `<div class="pm__thumbs">${p.images.map((_, i) =>
          `<button data-thumb="${i}" class="${i === 0 ? 'is-on' : ''}" aria-label="Foto ${i + 1}"><img src="${esc(img(p, i))}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="pm__info">
        <span class="pm__cat">${esc(catName(p.category_id))}</span>
        <h2 class="pm__title" id="pm-title">${esc(p.title)}</h2>
        <div class="pm__price">${money(p.price_cents)}</div>
        <div class="pm__avail${a ? '' : ' is-out'}">${
          a === 0 ? 'Agotado' : p.stock === 1 ? 'Pieza única' : a <= 2 ? `Solo quedan ${a}` : 'Disponible'}${
          inCart ? ` · tienes ${inCart} en la cesta` : ''}</div>
        <div class="pm__desc">${esc(p.description)}</div>
        <div class="pm__buy">
          ${a > 0 ? `
            <div class="stepper"><button data-q="-1" aria-label="Menos">${icons.minus}</button><span id="pm-qty">${qty}</span><button data-q="1" aria-label="Más">${icons.plus}</button></div>
            <button class="btn btn--accent" id="pm-add" ${maxAdd ? '' : 'disabled'}>${maxAdd ? 'Añadir a la cesta' : 'Ya tienes todas en la cesta'}</button>`
          : '<button class="btn btn--block" disabled>Agotado</button>'}
        </div>
      </div>
    </div>`;

  const syncQty = () => {
    $('#pm-qty', m).textContent = String(qty);
    $$<HTMLButtonElement>('[data-q]', m).forEach((b) => {
      b.disabled = b.dataset.q === '-1' ? qty <= 1 : qty >= maxAdd;
    });
  };
  if (a > 0) syncQty();

  m.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t === m || t.closest('[data-close]')) return m.close();
    const thumb = t.closest<HTMLElement>('[data-thumb]');
    if (thumb) {
      const i = Number(thumb.dataset.thumb);
      $<HTMLImageElement>('.pm__main', m).src = img(p, i);
      $$('[data-thumb]', m).forEach((b) => b.classList.toggle('is-on', b === thumb));
    }
    const q = t.closest<HTMLElement>('[data-q]');
    if (q) { qty = Math.max(1, Math.min(maxAdd, qty + Number(q.dataset.q))); syncQty(); }
    if (t.closest('#pm-add')) {
      cart.add(p.id, qty, a);
      m.close();
      openCart();
    }
  };
  m.onclose = () => {
    if (location.hash.startsWith('#p/')) history.replaceState(null, '', location.pathname + location.search);
  };
  if (!m.open) m.showModal();
  if (location.hash !== `#p/${p.slug}`) history.replaceState(null, '', `#p/${p.slug}`);
}

function openFromHash() {
  const m = location.hash.match(/^#p\/(.+)$/);
  if (m) openProduct(decodeURIComponent(m[1]));
}

// ── Cesta ─────────────────────────────────────────
/** Ajusta la cesta al stock real (productos agotados o retirados) */
function reconcileCart() {
  let changed = false;
  for (const l of cart.lines()) {
    const p = byId(l.product_id);
    const a = p ? available(p) : 0;
    if (l.qty > a) { a ? cart.set(l.product_id, a) : cart.remove(l.product_id); changed = true; }
  }
  if (changed) toast('Hemos ajustado tu cesta: algún producto se ha agotado.');
}

function totals() {
  const lines = cart.lines().map((l) => ({ l, p: byId(l.product_id)! })).filter((x) => x.p);
  const subtotal = lines.reduce((n, { l, p }) => n + p.price_cents * l.qty, 0);
  const free = settings.free_shipping_from_cents;
  const shipping = !lines.length ? 0 : free != null && subtotal >= free ? 0 : settings.shipping_flat_cents;
  return { lines, subtotal, shipping, total: subtotal + shipping, free };
}

function renderCart() {
  const count = cart.count();
  const badge = $('#cart-count');
  if (badge.textContent !== String(count)) {
    badge.textContent = String(count);
    badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
  }

  const { lines, subtotal, shipping, total, free } = totals();
  if (!lines.length) {
    $('#cart-body').innerHTML = `<div class="drawer__empty"><p>Tu cesta está vacía.</p><button class="btn btn--ghost btn--sm" data-close-cart>Seguir mirando</button></div>`;
    $('#cart-foot').innerHTML = '';
    return;
  }

  $('#cart-body').innerHTML = lines.map(({ l, p }) => `
    <div class="line">
      <img src="${esc(img(p))}" alt="">
      <div>
        <div class="line__title">${esc(p.title)}</div>
        <div class="line__meta">${money(p.price_cents)}</div>
        <button class="line__remove" data-remove="${esc(p.id)}">Quitar</button>
      </div>
      <div class="line__right">
        <div class="stepper">
          <button data-line="${esc(p.id)}" data-d="-1" aria-label="Menos" ${l.qty <= 1 ? 'disabled' : ''}>${icons.minus}</button>
          <span>${l.qty}</span>
          <button data-line="${esc(p.id)}" data-d="1" aria-label="Más" ${l.qty >= available(p) ? 'disabled' : ''}>${icons.plus}</button>
        </div>
        <strong>${money(p.price_cents * l.qty)}</strong>
      </div>
    </div>`).join('');

  const missing = free != null ? free - subtotal : 0;
  $('#cart-foot').innerHTML = `
    ${free != null ? `<div class="free-ship">${missing > 0
      ? `Te faltan <strong>${money(missing)}</strong> para el envío gratis`
      : '¡Tienes envío gratis! 🎉'}<div class="free-ship__bar"><i style="width:${Math.min(100, (subtotal / free) * 100)}%"></i></div></div>` : ''}
    <div class="sum">
      <div><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div><span>Envío</span><span>${shipping ? money(shipping) : 'Gratis'}</span></div>
      <div class="sum__total"><span>Total</span><span>${money(total)}</span></div>
    </div>
    <button class="btn btn--accent btn--block" id="checkout">Pagar de forma segura</button>
    <p class="secure">Tarjeta, Apple Pay o Google Pay a través de Stripe.<br>Al pagar aceptas las <a href="/legal/condiciones.html">condiciones de venta</a>.</p>`;
}

function openCart() {
  const d = $('#cart-drawer');
  $('#drawer-backdrop').hidden = false;
  d.removeAttribute('inert'); d.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => d.classList.add('is-open'));
  lockScroll(true);
  $<HTMLButtonElement>('#cart-close').focus();
}
function closeCart() {
  const d = $('#cart-drawer');
  d.classList.remove('is-open');
  d.setAttribute('inert', ''); d.setAttribute('aria-hidden', 'true');
  $('#drawer-backdrop').hidden = true;
  lockScroll(false);
}

async function checkout(btn: HTMLButtonElement) {
  btn.disabled = true;
  btn.textContent = 'Preparando el pago…';
  try {
    // Un pago anterior sin terminar de esta misma pestaña no debe seguir apartando unidades
    await api.releaseAbandonedCheckout().catch(() => false);
    const url = await api.checkout(cart.lines());
    location.href = url;
  } catch (e) {
    toast((e as Error).message, 'error');
    // refresca stock por si algo se agotó
    products = (await api.listProducts()).filter((p) => p.published);
    reconcileCart(); renderGrid(); renderCart();
  }
}

// ── Eventos ───────────────────────────────────────
function bindEvents() {
  cart.onChange(() => renderCart());

  $('#cat-filter').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cat]');
    if (!b) return;
    state.cat = b.dataset.cat!;
    renderFilters(); renderGrid();
  });
  $('#avail-filter').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-avail]');
    if (!b) return;
    state.avail = b.dataset.avail as typeof state.avail;
    $$('#avail-filter button').forEach((x) => x.classList.toggle('is-on', x === b));
    renderGrid();
  });

  $('#grid').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const add = t.closest<HTMLElement>('[data-add]');
    if (add) {
      e.stopPropagation();
      const p = byId(add.dataset.add!)!;
      if (cart.qtyOf(p.id) >= available(p)) return toast('Ya tienes todas las unidades disponibles en la cesta.');
      cart.add(p.id, 1, available(p));
      toast(`«${p.title}» añadido a la cesta`);
      return;
    }
    const card = t.closest<HTMLElement>('[data-open]');
    if (card) openProduct(card.dataset.open!);
  });
  $('#grid').addEventListener('keydown', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
    if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); openProduct(card.dataset.open!); }
  });

  $('#cart-open').addEventListener('click', openCart);
  $('#cart-close').addEventListener('click', closeCart);
  $('#drawer-backdrop').addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#cart-drawer').classList.contains('is-open')) closeCart(); });

  $('#cart-drawer').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close-cart]')) return closeCart();
    const rm = t.closest<HTMLElement>('[data-remove]');
    if (rm) return cart.remove(rm.dataset.remove!);
    const st = t.closest<HTMLElement>('[data-line]');
    if (st) {
      const p = byId(st.dataset.line!)!;
      const q = cart.qtyOf(p.id) + Number(st.dataset.d);
      return cart.set(p.id, Math.max(1, Math.min(available(p), q)));
    }
    const co = t.closest<HTMLButtonElement>('#checkout');
    if (co) checkout(co);
  });

  window.addEventListener('hashchange', openFromHash);
  let rz: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(layoutRibbon, 200); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', layoutRibbon);
  // Al volver con "atrás" desde Stripe (página restaurada de caché): libera la reserva y refresca
  window.addEventListener('pageshow', async (e) => {
    if (!e.persisted) return;
    renderCart();
    if (await api.releaseAbandonedCheckout().catch(() => false)) {
      products = (await api.listProducts()).filter((p) => p.published);
      renderGrid(); renderCart();
    }
  });
}

init();
