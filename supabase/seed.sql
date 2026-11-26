-- Datos iniciales. Ejecutar una vez tras la migración (SQL Editor de Supabase).

-- 1) Email(s) con acceso al panel. ¡Cambia esto!
insert into public.admins (email) values ('CAMBIAR@ejemplo.com') on conflict do nothing;

-- 2) Categorías de partida
insert into public.categories (name, slug, sort) values
  ('Bufandas',            'bufandas',  1),
  ('Bolsos',              'bolsos',    2),
  ('Árboles de Navidad',  'arboles',   3),
  ('Adornos',             'adornos',   4)
on conflict (slug) do nothing;

-- 3) Textos de la tienda
update public.settings set
  about_text = 'Soy María y tejo cada pieza a mano, con calma y con lana que me gusta tocar. Bufandas para el frío, bolsos para el día a día y, cuando llega diciembre, árboles y adornos de limpiapipas que llenan la casa de color.',
  shipping_flat_cents = 500
where id = 1;
