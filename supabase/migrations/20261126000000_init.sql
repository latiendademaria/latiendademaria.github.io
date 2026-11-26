-- La tienda de María — esquema inicial
-- Tablas, RLS, almacenamiento de imágenes y funciones de reserva de stock.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────────────────────

create table public.admins (
  email text primary key check (email = lower(email))
);

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  description  text not null default '',
  category_id  uuid references public.categories(id) on delete set null,
  price_cents  int  not null check (price_cents >= 0),
  stock        int  not null default 0 check (stock >= 0),
  reserved     int  not null default 0 check (reserved >= 0),
  images       text[] not null default '{}',
  published    boolean not null default false,
  sort         int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index products_published_idx on public.products (published, sort);

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  status            text not null default 'pending'
                    check (status in ('pending','paid','shipped','cancelled','expired')),
  items             jsonb not null,           -- [{product_id,title,qty,unit_price_cents}]
  subtotal_cents    int not null,
  shipping_cents    int not null,
  total_cents       int not null,
  customer_name     text,
  email             text,
  phone             text,
  shipping_address  jsonb,
  tracking          text,
  notes             text,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  shipped_at        timestamptz
);
create index orders_status_idx on public.orders (status, created_at desc);

create table public.settings (
  id                        int primary key default 1 check (id = 1),
  shop_name                 text not null default 'La tienda de María',
  tagline                   text not null default 'Hecho a mano, punto a punto.',
  about_text                text not null default '',
  contact_email             text not null default '',
  instagram                 text not null default '',
  shipping_flat_cents       int  not null default 500 check (shipping_flat_cents >= 0),
  free_shipping_from_cents  int  check (free_shipping_from_cents is null or free_shipping_from_cents >= 0),
  updated_at                timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- updated_at automático
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Admin check
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

alter table public.admins     enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.orders     enable row level security;
alter table public.settings   enable row level security;

-- admins: cada admin puede verse a sí mismo (para que el panel sepa si tiene acceso)
create policy admins_self_read on public.admins for select
  using (public.is_admin());

-- categories / settings: lectura pública, escritura admin
create policy categories_read  on public.categories for select using (true);
create policy categories_write on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

create policy settings_read  on public.settings for select using (true);
create policy settings_write on public.settings for update
  using (public.is_admin()) with check (public.is_admin());

-- products: el público solo ve los publicados; el admin lo ve y edita todo
create policy products_public_read on public.products for select
  using (published or public.is_admin());
create policy products_admin_write on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- orders: solo admin (las Edge Functions usan service_role y saltan RLS)
create policy orders_admin on public.orders for all
  using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Storage: imágenes de producto
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy product_images_admin_insert on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_update on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_delete on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- Flujo de pedidos (solo service_role, llamadas desde Edge Functions)
-- ─────────────────────────────────────────────────────────────

-- Libera reservas de pedidos pendientes abandonados (red de seguridad
-- por si se pierde un webhook de "expired").
create or replace function public.release_stale_orders(p_older_than interval default '90 minutes')
returns int language plpgsql security definer set search_path = public as $$
declare
  o record; n int := 0;
begin
  for o in
    select id from public.orders
    where status = 'pending' and created_at < now() - p_older_than
    for update skip locked
  loop
    perform public.expire_order(o.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Crea un pedido pendiente y reserva stock de forma atómica.
-- p_items: [{"product_id": "...", "qty": 2}, ...]
-- Devuelve el pedido con los precios calculados en servidor.
create or replace function public.create_pending_order(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it        jsonb;
  p         public.products%rowtype;
  qty       int;
  lines     jsonb := '[]'::jsonb;
  subtotal  int := 0;
  shipping  int;
  s         public.settings%rowtype;
  oid       uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'TOO_MANY_ITEMS';
  end if;

  -- Bloquea filas en orden estable para evitar interbloqueos
  for it in
    select value from jsonb_array_elements(p_items)
    order by value ->> 'product_id'
  loop
    qty := (it ->> 'qty')::int;
    if qty is null or qty < 1 or qty > 50 then
      raise exception 'BAD_QTY';
    end if;

    select * into p from public.products
      where id = (it ->> 'product_id')::uuid and published
      for update;
    if not found then
      raise exception 'PRODUCT_NOT_FOUND:%', it ->> 'product_id';
    end if;
    if p.stock - p.reserved < qty then
      raise exception 'OUT_OF_STOCK:%', p.title;
    end if;

    update public.products set reserved = reserved + qty where id = p.id;

    lines := lines || jsonb_build_object(
      'product_id', p.id,
      'title', p.title,
      'qty', qty,
      'unit_price_cents', p.price_cents,
      'image', p.images[1]
    );
    subtotal := subtotal + p.price_cents * qty;
  end loop;

  select * into s from public.settings where id = 1;
  shipping := case
    when s.free_shipping_from_cents is not null and subtotal >= s.free_shipping_from_cents then 0
    else s.shipping_flat_cents
  end;

  insert into public.orders (items, subtotal_cents, shipping_cents, total_cents)
  values (lines, subtotal, shipping, subtotal + shipping)
  returning id into oid;

  return jsonb_build_object(
    'order_id', oid,
    'items', lines,
    'subtotal_cents', subtotal,
    'shipping_cents', shipping,
    'total_cents', subtotal + shipping
  );
end $$;

-- Pago confirmado: consolida el stock (idempotente).
create or replace function public.complete_order(
  p_order_id uuid,
  p_session_id text,
  p_customer_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_total_cents int
) returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  it jsonb;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('paid','shipped') then return; end if;  -- ya procesado

  for it in select value from jsonb_array_elements(o.items) loop
    if o.status = 'pending' then
      -- la reserva sigue viva: pasa de reservado a vendido
      update public.products
        set stock = greatest(stock - (it ->> 'qty')::int, 0),
            reserved = greatest(reserved - (it ->> 'qty')::int, 0)
        where id = (it ->> 'product_id')::uuid;
    else
      -- pago tardío sobre un pedido ya liberado: descuenta stock igualmente
      update public.products
        set stock = greatest(stock - (it ->> 'qty')::int, 0)
        where id = (it ->> 'product_id')::uuid;
    end if;
  end loop;

  update public.orders set
    status = 'paid',
    stripe_session_id = coalesce(p_session_id, stripe_session_id),
    customer_name = p_customer_name,
    email = p_email,
    phone = p_phone,
    shipping_address = p_address,
    total_cents = coalesce(p_total_cents, total_cents),
    paid_at = now(),
    notes = case when o.status <> 'pending'
                 then coalesce(notes || E'\n', '') || 'Pago recibido tras caducar la reserva: revisa el stock.'
                 else notes end
  where id = p_order_id;
end $$;

-- Sesión caducada / abandonada: libera la reserva (idempotente).
create or replace function public.expire_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  it jsonb;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'pending' then return; end if;

  for it in select value from jsonb_array_elements(o.items) loop
    update public.products
      set reserved = greatest(reserved - (it ->> 'qty')::int, 0)
      where id = (it ->> 'product_id')::uuid;
  end loop;

  update public.orders set status = 'expired' where id = p_order_id;
end $$;

-- Cancelación desde el panel: opcionalmente devuelve las unidades al stock.
-- (El reembolso del dinero se hace en el panel de Stripe.)
create or replace function public.admin_cancel_order(p_order_id uuid, p_restock boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  it jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status = 'pending' then
    perform public.expire_order(p_order_id);
  elsif o.status in ('paid','shipped') and p_restock then
    for it in select value from jsonb_array_elements(o.items) loop
      update public.products
        set stock = stock + (it ->> 'qty')::int
        where id = (it ->> 'product_id')::uuid;
    end loop;
  end if;
  update public.orders set status = 'cancelled' where id = p_order_id;
end $$;

-- Permisos de ejecución
revoke all on function public.create_pending_order(jsonb)           from public, anon, authenticated;
revoke all on function public.complete_order(uuid,text,text,text,text,jsonb,int) from public, anon, authenticated;
revoke all on function public.expire_order(uuid)                    from public, anon, authenticated;
revoke all on function public.release_stale_orders(interval)        from public, anon, authenticated;
grant execute on function public.create_pending_order(jsonb)        to service_role;
grant execute on function public.complete_order(uuid,text,text,text,text,jsonb,int) to service_role;
grant execute on function public.expire_order(uuid)                 to service_role;
grant execute on function public.release_stale_orders(interval)     to service_role;

revoke all on function public.admin_cancel_order(uuid, boolean) from public, anon;
grant execute on function public.admin_cancel_order(uuid, boolean) to authenticated;
