-- Pedido mínimo: Stripe exige al menos 0,50 € por pago en EUR.

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

  -- Stripe no acepta pagos por debajo de 0,50 € (el raise deshace la reserva)
  if subtotal + shipping < 50 then
    raise exception 'MIN_TOTAL';
  end if;

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

revoke all on function public.create_pending_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_pending_order(jsonb) to service_role;
