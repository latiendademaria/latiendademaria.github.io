-- Categorías y textos de partida (los administradores se añaden aparte, ver supabase/seed.sql)
insert into public.categories (name, slug, sort) values
  ('Bufandas',            'bufandas',  1),
  ('Bolsos',              'bolsos',    2),
  ('Árboles de Navidad',  'arboles',   3),
  ('Adornos',             'adornos',   4)
on conflict (slug) do nothing;

update public.settings set
  about_text = 'Soy María y tejo cada pieza a mano, con calma y con lana que me gusta tocar. Bufandas para el frío, bolsos para el día a día y, cuando llega diciembre, árboles y adornos de limpiapipas que llenan la casa de color.',
  shipping_flat_cents = 500
where id = 1;
