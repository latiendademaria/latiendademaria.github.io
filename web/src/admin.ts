import './styles/base.css';
import './styles/shop.css';
import './styles/admin.css';
import { getApi, type Api } from './lib/api';
import { $, esc, icons, toast } from './lib/dom';
import { centsToInput, dateTime, money, parseEuros } from './lib/format';
import { resizeImage } from './lib/images';
import { brand } from './lib/layout';
import { available, type Address, type Category, type Order, type Product, type Settings } from './lib/types';

let api: Api;
let email: string | null = null;
let products: Product[] = [];
let categories: Category[] = [];
let orders: Order[] = [];
let settings: Settings;

type Tab = 'pedidos' | 'productos' | 'categorias' | 'ajustes';
const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: 'pedidos', label: 'Pedidos', ico: '📦' },
  { id: 'productos', label: 'Productos', ico: '🧶' },
  { id: 'categorias', label: 'Categorías', ico: '🏷️' },
  { id: 'ajustes', label: 'Ajustes', ico: '⚙️' },
];
const ui = { orderFilter: 'toship' as 'toship' | 'shipped' | 'all', productFilter: 'all' as 'all' | 'on' | 'off' | 'out', q: '' };

const app = () => $('#app');
const tab = (): Tab => (location.hash.slice(1) as Tab) || 'pedidos';
const toShip = () => orders.filter((o) => o.status === 'paid');
const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Sin categoría';
const thumb = (p: Product) => (p.images[0] ? api.imageUrl(p.images[0]) : '/favicon.svg');
const shortId = (id: string) => id.slice(0, 6).toUpperCase();

// ── Diálogo de confirmación / pregunta ────────────
function ask(opts: { title: string; text?: string; ok: string; cancel?: string; danger?: boolean; input?: { label: string; value?: string; placeholder?: string }; extra?: string }): Promise<{ ok: boolean; value: string; extra: boolean }> {
  const d = $<HTMLDialogElement>('#ask');
  d.innerHTML = `<form method="dialog" class="ask__body">
    <h3>${esc(opts.title)}</h3>
    ${opts.text ? `<p>${esc(opts.text)}</p>` : ''}
    ${opts.input ? `<div class="field"><label for="ask-in">${esc(opts.input.label)}</label><input class="input" id="ask-in" value="${esc(opts.input.value ?? '')}" placeholder="${esc(opts.input.placeholder ?? '')}"></div>` : ''}
    ${opts.extra ? `<label class="switch"><input type="checkbox" id="ask-extra" checked><span>${esc(opts.extra)}</span></label>` : ''}
    <div class="ask__actions">
      <button class="btn ${opts.danger ? 'btn--danger' : 'btn--accent'}" value="ok">${esc(opts.ok)}</button>
      <button class="btn btn--ghost" value="cancel">${esc(opts.cancel ?? 'Cancelar')}</button>
    </div></form>`;
  d.showModal();
  if (opts.danger) d.querySelector<HTMLButtonElement>('[value=cancel]')!.focus();
  return new Promise((res) => {
    d.onclose = () => res({
      ok: d.returnValue === 'ok',
      value: (d.querySelector<HTMLInputElement>('#ask-in')?.value ?? '').trim(),
      extra: d.querySelector<HTMLInputElement>('#ask-extra')?.checked ?? false,
    });
  });
}

async function run<T>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    console.error(e);
    toast(`Algo ha fallado: ${(e as Error).message}`, 'error');
    return undefined;
  }
}

// ── Arranque y sesión ─────────────────────────────
async function init() {
  api = await getApi();
  if (api.mode === 'demo') {
    $('#demo-banner').innerHTML = '<div class="demo-banner">Modo demo · los cambios solo se guardan en este navegador</div>';
  }
  api.onAuthChange(() => boot());
  window.addEventListener('hashchange', render);
  await boot();
}

async function boot() {
  email = await api.currentEmail();
  if (!email) return renderLogin();
  if (!(await api.isAdmin())) return renderNoAccess();
  await reload();
  render();
}

async function reload() {
  [settings, categories, products, orders] = await Promise.all([
    api.getSettings(), api.listCategories(), api.listProducts(), api.listOrders(),
  ]);
}

function renderLogin(sent = false) {
  app().innerHTML = `<div class="login"><div class="login__card">
    ${brand('/')}
    ${sent ? `
      <h1>Revisa tu correo ✉️</h1>
      <p>Te he enviado un enlace para entrar. Ábrelo desde este mismo dispositivo.</p>
      <button class="btn btn--ghost btn--sm" id="again">Usar otro email</button>`
    : `
      <h1>Panel de la tienda</h1>
      <p>Escribe tu email y te enviaremos un enlace para entrar, sin contraseña.</p>
      <form id="login">
        <div class="field"><label for="em">Tu email</label><input class="input" id="em" type="email" autocomplete="email" required></div>
        <button class="btn btn--accent btn--block">${api.mode === 'demo' ? 'Entrar (demo)' : 'Enviarme el enlace'}</button>
      </form>`}
  </div></div>`;
  $('#again')?.addEventListener('click', () => renderLogin());
  $('#login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $<HTMLButtonElement>('#login button');
    btn.disabled = true;
    const ok = await run(() => api.sendMagicLink($<HTMLInputElement>('#em').value.trim().toLowerCase()));
    btn.disabled = false;
    if (ok !== undefined && api.mode === 'live') renderLogin(true);
  });
}

function renderNoAccess() {
  app().innerHTML = `<div class="login"><div class="login__card">
    ${brand('/')}
    <h1>Sin acceso</h1>
    <p>La cuenta <strong>${esc(email)}</strong> no tiene permiso para gestionar la tienda.</p>
    <button class="btn btn--ghost" id="out">Salir</button>
  </div></div>`;
  $('#out').addEventListener('click', () => api.signOut());
}

// ── Estructura ────────────────────────────────────
function tabsHtml(kind: 'top' | 'bottom') {
  const n = toShip().length;
  return `<nav class="tabs tabs--${kind}">${TABS.map((t) => `
    <a href="#${t.id}" class="${tab() === t.id ? 'is-on' : ''}">
      ${kind === 'bottom' ? `<span class="ico" aria-hidden="true">${t.ico}</span>` : ''}${t.label}
      ${t.id === 'pedidos' && n ? `<span class="badge">${n}</span>` : ''}
    </a>`).join('')}</nav>`;
}

function render() {
  if (!email || !settings) return;
  const views: Record<Tab, () => string> = { pedidos: ordersView, productos: productsView, categorias: categoriesView, ajustes: settingsView };
  const view = views[tab()] ?? ordersView;
  app().innerHTML = `
    <header class="a-header"><div class="wrap">
      ${brand('/')}
      ${tabsHtml('top')}
      <div class="a-header__right">
        <span class="a-header__email">${esc(email)}</span>
        <a class="btn btn--ghost btn--sm" href="/" target="_blank">Ver tienda</a>
        <button class="btn btn--ghost btn--sm" id="logout">Salir</button>
      </div>
    </div></header>
    <main class="wrap a-main">${view()}</main>
    ${tabsHtml('bottom')}`;
  $('#logout').addEventListener('click', () => api.signOut());
  bindView();
}

// ── Pedidos ───────────────────────────────────────
const STATUS: Record<Order['status'], string> = {
  pending: 'Pago en curso', paid: 'Por enviar', shipped: 'Enviado', cancelled: 'Cancelado', expired: 'Caducado',
};

function addressText(a: Address | null) {
  if (!a) return '';
  return [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state].filter(Boolean).join('\n');
}

function ordersView() {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthSales = orders
    .filter((o) => (o.status === 'paid' || o.status === 'shipped') && o.paid_at && new Date(o.paid_at) >= monthStart)
    .reduce((n, o) => n + o.total_cents, 0);
  const soldOut = products.filter((p) => p.published && available(p) === 0).length;

  const list = orders.filter((o) =>
    ui.orderFilter === 'toship' ? o.status === 'paid' : ui.orderFilter === 'shipped' ? o.status === 'shipped' : true);

  return `
    <div class="a-title"><h1>Pedidos</h1></div>
    <div class="stats">
      <div class="stat${toShip().length ? ' stat--alert' : ''}"><b>${toShip().length}</b><span>por enviar</span></div>
      <div class="stat"><b>${money(monthSales)}</b><span>vendido este mes</span></div>
      <div class="stat${soldOut ? ' stat--alert' : ''}"><b>${soldOut}</b><span>productos agotados</span></div>
    </div>
    <div class="toolbar">
      <div class="segmented" id="o-filter">
        <button data-f="toship" class="${ui.orderFilter === 'toship' ? 'is-on' : ''}">Por enviar</button>
        <button data-f="shipped" class="${ui.orderFilter === 'shipped' ? 'is-on' : ''}">Enviados</button>
        <button data-f="all" class="${ui.orderFilter === 'all' ? 'is-on' : ''}">Todos</button>
      </div>
    </div>
    <div class="list">
      ${list.length ? list.map(orderCard).join('') : `<div class="empty">${ui.orderFilter === 'toship' ? '¡Todo enviado! No hay pedidos pendientes. 🎉' : 'No hay pedidos.'}</div>`}
    </div>`;
}

function orderCard(o: Order) {
  const addr = addressText(o.shipping_address);
  return `<article class="o-card">
    <div class="o-card__head">
      <div><div class="o-card__id">Pedido #${shortId(o.id)}</div><div class="o-card__date">${dateTime(o.paid_at ?? o.created_at)}</div></div>
      <span class="pill pill--${o.status}">${STATUS[o.status]}</span>
    </div>
    <div class="o-card__grid">
      <div>
        <h4>Enviar a</h4>
        <address>
          <strong>${esc(o.customer_name ?? '—')}</strong><br>
          ${esc(addr).replace(/\n/g, '<br>')}
          ${o.phone ? `<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : ''}
          ${o.email ? `<br><a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ''}
        </address>
      </div>
      <div>
        <h4>Artículos</h4>
        <ul class="o-items">
          ${o.items.map((i) => `<li><span>${i.qty} × ${esc(i.title)}</span><span>${money(i.unit_price_cents * i.qty)}</span></li>`).join('')}
          <li><span>Envío</span><span>${o.shipping_cents ? money(o.shipping_cents) : 'Gratis'}</span></li>
          <li class="o-total"><span>Total</span><span>${money(o.total_cents)}</span></li>
        </ul>
      </div>
    </div>
    ${o.tracking ? `<div class="o-card__note">Seguimiento: <strong>${esc(o.tracking)}</strong>${o.shipped_at ? ` · enviado el ${dateTime(o.shipped_at)}` : ''}</div>` : ''}
    ${o.notes ? `<div class="o-card__note">${esc(o.notes)}</div>` : ''}
    <div class="o-card__actions">
      ${o.status === 'paid' ? `<button class="btn btn--accent btn--sm" data-ship="${o.id}">Marcar como enviado</button>` : ''}
      ${addr ? `<button class="btn btn--ghost btn--sm" data-copy="${o.id}">Copiar dirección</button>` : ''}
      <button class="btn btn--ghost btn--sm" data-note="${o.id}">${o.notes ? 'Editar nota' : 'Añadir nota'}</button>
      ${o.status === 'paid' || o.status === 'shipped' || o.status === 'pending' ? `<button class="btn btn--ghost btn--sm" data-cancel="${o.id}">Cancelar</button>` : ''}
    </div>
  </article>`;
}

// ── Productos ─────────────────────────────────────
function productsView() {
  const q = ui.q.toLowerCase();
  const list = products.filter((p) =>
    (!q || p.title.toLowerCase().includes(q)) &&
    (ui.productFilter === 'all' || (ui.productFilter === 'on' ? p.published : ui.productFilter === 'off' ? !p.published : available(p) === 0)));
  return `
    <div class="a-title"><h1>Productos</h1><button class="btn btn--accent" data-edit="new">${icons.plus.replace('<svg', '<svg width="18" height="18"')} Nuevo producto</button></div>
    <div class="toolbar">
      <input class="input" id="p-search" type="search" placeholder="Buscar…" value="${esc(ui.q)}">
      <div class="segmented" id="p-filter">
        ${([['all', 'Todos'], ['on', 'Visibles'], ['off', 'Ocultos'], ['out', 'Agotados']] as const)
          .map(([k, l]) => `<button data-f="${k}" class="${ui.productFilter === k ? 'is-on' : ''}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="list" id="p-list">
      ${list.length ? list.map(productRow).join('') : '<div class="empty">No hay productos. Pulsa «Nuevo producto» para subir el primero.</div>'}
    </div>`;
}

function productRow(p: Product) {
  const a = available(p);
  const pill = !p.published ? '<span class="pill pill--off">Oculto</span>'
    : p.stock === 0 ? '<span class="pill pill--out">Agotado</span>'
    : a === 0 ? '<span class="pill pill--paid" title="Todas las unidades están apartadas por pagos en curso">En pago</span>'
    : '<span class="pill pill--ok">Visible</span>';
  return `<div class="p-row" data-id="${p.id}">
    <img src="${esc(thumb(p))}" alt="">
    <div>
      <div class="p-row__top"><div class="p-row__title">${esc(p.title)}</div>${pill}</div>
      <div class="p-row__meta">${money(p.price_cents)} · ${esc(catName(p.category_id))}</div>
      ${p.reserved ? `<div class="p-row__reserved">${p.reserved} ${p.reserved === 1 ? 'unidad apartada' : 'unidades apartadas'} por pagos en curso · ${a} a la venta</div>` : ''}
      <div class="p-row__actions">
        <div><span class="stock-lbl">Stock</span>
          <span class="stepper"><button data-stock="-1" aria-label="Quitar una unidad" ${p.stock <= 0 ? 'disabled' : ''}>${icons.minus}</button><span>${p.stock}</span><button data-stock="1" aria-label="Añadir una unidad">${icons.plus}</button></span>
        </div>
        <button class="btn btn--ghost btn--sm" data-edit="${p.id}">Editar</button>
      </div>
    </div>
  </div>`;
}

// Hoja de edición
function openEditor(p?: Product) {
  const draft = {
    images: [...(p?.images ?? [])],
    uploaded: [] as string[], // subidas en esta sesión de edición
    removed: [] as string[],
  };
  const d = $<HTMLDialogElement>('#sheet');
  const isNew = !p;
  let uploading = 0;

  const photosHtml = () => `
    ${draft.images.map((path, i) => `
      <div class="photo">
        ${i === 0 ? '<span class="photo__main">Principal</span>' : ''}
        <img src="${esc(api.imageUrl(path))}" alt="">
        <div class="photo__bar">
          <button type="button" data-mv="${i}" data-d="-1" aria-label="Mover a la izquierda" ${i === 0 ? 'hidden' : ''}>${icons.left}</button>
          <button type="button" data-rm="${i}" aria-label="Quitar foto">${icons.trash}</button>
          <button type="button" data-mv="${i}" data-d="1" aria-label="Mover a la derecha" ${i === draft.images.length - 1 ? 'hidden' : ''}>${icons.right}</button>
        </div>
      </div>`).join('')}
    ${Array.from({ length: uploading }, () => '<div class="photo photo--loading">Subiendo…</div>').join('')}
    <label class="photo photo--add">
      <span>${icons.camera}Añadir fotos</span>
      <input type="file" accept="image/*" multiple hidden id="f-files">
    </label>`;

  d.innerHTML = `<form id="p-form" class="sheet__form" novalidate>
    <div class="sheet__head">
      <h2>${isNew ? 'Nuevo producto' : 'Editar producto'}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icons.close}</button>
    </div>
    <div class="sheet__body">
      <div class="photos" id="photos">${photosHtml()}</div>
      <div class="field"><label for="f-title">Nombre</label><input class="input" id="f-title" required maxlength="120" value="${esc(p?.title ?? '')}" placeholder="Ej.: Bufanda roja de lana"></div>
      <div class="row2">
        <div class="field"><label for="f-price">Precio (€)</label><input class="input" id="f-price" inputmode="decimal" required value="${p ? centsToInput(p.price_cents) : ''}" placeholder="25,00"></div>
        <div class="field"><label for="f-stock">Unidades en stock</label><input class="input" id="f-stock" type="number" inputmode="numeric" min="0" step="1" value="${p?.stock ?? 1}"></div>
      </div>
      ${p?.reserved ? `<p class="hint">Ahora mismo hay ${p.reserved} ${p.reserved === 1 ? 'unidad apartada' : 'unidades apartadas'} por clientes que están pagando. Se descuentan del stock solo cuando Stripe confirma el pago; si no pagan, vuelven a estar a la venta en 30 minutos como mucho.</p>` : ''}
      <div class="field"><label for="f-cat">Categoría</label>
        <select class="select" id="f-cat"><option value="">Sin categoría</option>
          ${categories.map((c) => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label for="f-desc">Descripción</label><textarea class="textarea" id="f-desc" placeholder="Materiales, medidas, cuidados…">${esc(p?.description ?? '')}</textarea></div>
      <label class="switch"><input type="checkbox" id="f-pub" ${p?.published ?? true ? 'checked' : ''}><span>Visible en la tienda<small>Si lo desmarcas, el producto queda guardado pero oculto.</small></span></label>
    </div>
    <div class="sheet__foot">
      ${isNew ? '<span></span>' : '<button type="button" class="btn btn--ghost" id="p-del">Eliminar</button>'}
      <button class="btn btn--accent" id="p-save">Guardar</button>
    </div>
  </form>`;

  const refreshPhotos = () => { $('#photos', d).innerHTML = photosHtml(); };

  const discard = async () => {
    // Limpia fotos subidas que no se llegaron a guardar
    for (const path of draft.uploaded) await api.deleteImage(path).catch(() => {});
    d.close();
  };

  d.oncancel = (e) => { e.preventDefault(); discard(); };
  d.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return discard();
    const mv = t.closest<HTMLElement>('[data-mv]');
    if (mv) {
      const i = Number(mv.dataset.mv), j = i + Number(mv.dataset.d);
      [draft.images[i], draft.images[j]] = [draft.images[j], draft.images[i]];
      return refreshPhotos();
    }
    const rm = t.closest<HTMLElement>('[data-rm]');
    if (rm) {
      const [path] = draft.images.splice(Number(rm.dataset.rm), 1);
      draft.removed.push(path);
      return refreshPhotos();
    }
    if (t.closest('#p-del') && p) {
      const r = await ask({ title: '¿Eliminar este producto?', text: `«${p.title}» desaparecerá de la tienda. Los pedidos antiguos se conservan. Si solo quieres ocultarlo, desmarca «Visible en la tienda».`, ok: 'Eliminar', danger: true });
      if (!r.ok) return;
      await run(() => api.deleteProduct(p.id), 'Producto eliminado');
      d.close();
      await reload(); render();
    }
  };

  d.onchange = async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.id !== 'f-files' || !input.files?.length) return;
    const files = Array.from(input.files);
    uploading += files.length; refreshPhotos();
    for (const f of files) {
      const path = await run(async () => api.uploadImage(await resizeImage(f)));
      uploading--;
      if (path) { draft.images.push(path); draft.uploaded.push(path); }
      refreshPhotos();
    }
  };

  $('#p-form', d).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (uploading) return toast('Espera a que terminen de subir las fotos.');
    const title = $<HTMLInputElement>('#f-title', d).value.trim();
    const price = parseEuros($<HTMLInputElement>('#f-price', d).value);
    const stock = Math.max(0, Math.floor(Number($<HTMLInputElement>('#f-stock', d).value) || 0));
    if (!title) return toast('Ponle un nombre al producto.', 'error');
    if (price === null) return toast('El precio no es válido. Escríbelo así: 25,00', 'error');
    const published = $<HTMLInputElement>('#f-pub', d).checked;
    if (published && !draft.images.length) {
      const r = await ask({ title: 'Sin fotos', text: 'El producto no tiene ninguna foto. ¿Quieres publicarlo igualmente?', ok: 'Publicar sin fotos', cancel: 'Añadir fotos' });
      if (!r.ok) return;
    }
    const btn = $<HTMLButtonElement>('#p-save', d);
    btn.disabled = true; btn.textContent = 'Guardando…';
    const saved = await run(() => api.saveProduct({
      id: p?.id, slug: p?.slug, sort: p?.sort ?? 0, title, price_cents: price, stock, published,
      description: $<HTMLTextAreaElement>('#f-desc', d).value.trim(),
      category_id: $<HTMLSelectElement>('#f-cat', d).value || null,
      images: draft.images,
    }), isNew ? 'Producto creado' : 'Cambios guardados');
    btn.disabled = false; btn.textContent = 'Guardar';
    if (!saved) return;
    for (const path of draft.removed) await api.deleteImage(path).catch(() => {});
    d.close();
    await reload(); render();
  });

  d.showModal();
  if (isNew) $<HTMLInputElement>('#f-title', d).focus();
}

// ── Categorías ────────────────────────────────────
function categoriesView() {
  const count = (id: string) => products.filter((p) => p.category_id === id).length;
  return `
    <div class="a-title"><h1>Categorías</h1></div>
    <div class="list" id="c-list">
      ${categories.map((c, i) => `
        <div class="c-row" data-id="${c.id}">
          <button class="icon-btn" data-cm="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${icons.left.replace('M15 6l-6 6 6 6', 'M6 15l6-6 6 6')}</button>
          <input class="input" value="${esc(c.name)}" data-cname aria-label="Nombre de la categoría">
          <span class="c-row__count">${count(c.id)} prod.</span>
          <button class="icon-btn" data-cdel aria-label="Eliminar categoría">${icons.trash}</button>
        </div>`).join('')}
    </div>
    <form class="toolbar" id="c-add" style="margin-top:16px">
      <input class="input" id="c-new" placeholder="Nueva categoría, p. ej. «Gorros»" required>
      <button class="btn btn--accent">Añadir</button>
    </form>
    <p class="hint" style="margin-top:4px">El orden de aquí es el orden de los filtros en la tienda. Los cambios de nombre se guardan al salir del campo.</p>`;
}

// ── Ajustes ───────────────────────────────────────
function settingsView() {
  const s = settings;
  return `
    <div class="a-title"><h1>Ajustes</h1></div>
    <form class="panel" id="s-form">
      <h2>Envío</h2>
      <div class="row2">
        <div class="field"><label for="s-ship">Precio del envío (€)</label><input class="input" id="s-ship" inputmode="decimal" value="${centsToInput(s.shipping_flat_cents)}"></div>
        <div class="field"><label for="s-free">Envío gratis desde (€)</label><input class="input" id="s-free" inputmode="decimal" value="${s.free_shipping_from_cents != null ? centsToInput(s.free_shipping_from_cents) : ''}" placeholder="Vacío = nunca"></div>
      </div>
      <h2>Textos de la tienda</h2>
      <div class="field"><label for="s-about">Sobre mí</label><textarea class="textarea" id="s-about" rows="6">${esc(s.about_text)}</textarea></div>
      <p class="hint">Deja una línea en blanco para separar párrafos.</p>
      <h2>Contacto</h2>
      <div class="row2">
        <div class="field"><label for="s-email">Email de contacto</label><input class="input" id="s-email" type="email" value="${esc(s.contact_email)}"></div>
        <div class="field"><label for="s-ig">Instagram</label><input class="input" id="s-ig" value="${esc(s.instagram)}" placeholder="@usuario"></div>
      </div>
      <button class="btn btn--accent">Guardar ajustes</button>
    </form>`;
}

// ── Eventos de cada vista ─────────────────────────
function bindView() {
  const main = $('.a-main');

  // Pedidos
  $('#o-filter')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]');
    if (b) { ui.orderFilter = b.dataset.f as typeof ui.orderFilter; render(); }
  });

  // Productos
  $('#p-filter')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]');
    if (b) { ui.productFilter = b.dataset.f as typeof ui.productFilter; render(); }
  });
  const search = $<HTMLInputElement>('#p-search');
  search?.addEventListener('input', () => {
    ui.q = search.value;
    const pos = search.selectionStart;
    render();
    const s2 = $<HTMLInputElement>('#p-search'); s2.focus(); s2.setSelectionRange(pos, pos);
  });

  // Categorías
  $('#c-add')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>('#c-new').value.trim();
    if (!name) return;
    await run(() => api.saveCategory({ name, sort: (categories.at(-1)?.sort ?? 0) + 1 }), 'Categoría añadida');
    await reload(); render();
  });
  main.addEventListener('change', async (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-cname]');
    if (!input) return;
    const c = categories.find((x) => x.id === input.closest<HTMLElement>('[data-id]')!.dataset.id)!;
    const name = input.value.trim();
    if (!name || name === c.name) { input.value = c.name; return; }
    await run(() => api.saveCategory({ ...c, name, slug: '' }), 'Nombre guardado');
    await reload();
  });

  // Ajustes
  $('#s-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ship = parseEuros($<HTMLInputElement>('#s-ship').value);
    const freeRaw = $<HTMLInputElement>('#s-free').value.trim();
    const free = freeRaw ? parseEuros(freeRaw) : null;
    if (ship === null || (freeRaw && free === null)) return toast('Revisa los precios: escríbelos así 5,00', 'error');
    await run(() => api.saveSettings({
      shipping_flat_cents: ship,
      free_shipping_from_cents: free,
      about_text: $<HTMLTextAreaElement>('#s-about').value.trim(),
      contact_email: $<HTMLInputElement>('#s-email').value.trim(),
      instagram: $<HTMLInputElement>('#s-ig').value.trim(),
    }), 'Ajustes guardados');
    await reload();
  });

  // Clicks comunes
  main.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;

    const edit = t.closest<HTMLElement>('[data-edit]');
    if (edit) return openEditor(edit.dataset.edit === 'new' ? undefined : products.find((p) => p.id === edit.dataset.edit));

    const st = t.closest<HTMLElement>('[data-stock]');
    if (st) {
      const p = products.find((x) => x.id === st.closest<HTMLElement>('[data-id]')!.dataset.id)!;
      p.stock = Math.max(0, p.stock + Number(st.dataset.stock));
      render(); // respuesta inmediata
      await run(() => api.setStock(p.id, p.stock));
      return;
    }

    const cm = t.closest<HTMLElement>('[data-cm]');
    if (cm) {
      const i = categories.findIndex((c) => c.id === cm.closest<HTMLElement>('[data-id]')!.dataset.id);
      const j = i - 1;
      if (j < 0) return;
      [categories[i], categories[j]] = [categories[j], categories[i]];
      await run(() => Promise.all(categories.map((c, k) => api.saveCategory({ ...c, sort: k + 1 }))));
      await reload(); render();
      return;
    }

    const cdel = t.closest<HTMLElement>('[data-cdel]');
    if (cdel) {
      const c = categories.find((x) => x.id === cdel.closest<HTMLElement>('[data-id]')!.dataset.id)!;
      const n = products.filter((p) => p.category_id === c.id).length;
      const r = await ask({ title: `¿Eliminar «${c.name}»?`, text: n ? `Sus ${n} productos se quedarán sin categoría (no se borran).` : undefined, ok: 'Eliminar', danger: true });
      if (!r.ok) return;
      await run(() => api.deleteCategory(c.id), 'Categoría eliminada');
      await reload(); render();
      return;
    }

    const find = (attr: string) => orders.find((o) => o.id === t.closest<HTMLElement>(`[${attr}]`)?.getAttribute(attr));

    if (t.closest('[data-ship]')) {
      const o = find('data-ship')!;
      const r = await ask({ title: `Enviar pedido #${shortId(o.id)}`, text: 'Si tienes número de seguimiento, añádelo para tenerlo a mano.', ok: 'Marcar como enviado', input: { label: 'Nº de seguimiento (opcional)', placeholder: 'Ej.: PQ4F2A0712345' } });
      if (!r.ok) return;
      await run(() => api.updateOrder(o.id, { status: 'shipped', tracking: r.value || null, shipped_at: new Date().toISOString() }), 'Pedido marcado como enviado');
      await reload(); render();
      return;
    }
    if (t.closest('[data-copy]')) {
      const o = find('data-copy')!;
      const text = [o.customer_name, addressText(o.shipping_address), o.phone].filter(Boolean).join('\n');
      await run(() => navigator.clipboard.writeText(text), 'Dirección copiada');
      return;
    }
    if (t.closest('[data-note]')) {
      const o = find('data-note')!;
      const r = await ask({ title: 'Nota del pedido', ok: 'Guardar', input: { label: 'Nota interna (no la ve el cliente)', value: o.notes ?? '' } });
      if (!r.ok) return;
      await run(() => api.updateOrder(o.id, { notes: r.value || null }), 'Nota guardada');
      await reload(); render();
      return;
    }
    if (t.closest('[data-cancel]')) {
      const o = find('data-cancel')!;
      const r = await ask({
        title: `¿Cancelar el pedido #${shortId(o.id)}?`,
        text: o.status === 'pending' ? 'El cliente aún no ha pagado; se liberarán las unidades.' : 'Recuerda devolver el dinero desde el panel de Stripe (Pagos → Reembolsar).',
        extra: o.status === 'pending' ? undefined : 'Devolver las unidades al stock',
        ok: 'Cancelar pedido', cancel: 'Volver', danger: true,
      });
      if (!r.ok) return;
      await run(() => api.cancelOrder(o.id, o.status === 'pending' ? true : r.extra), 'Pedido cancelado');
      await reload(); render();
    }
  });
}

init();
