-- Permisos explícitos de tabla (los proyectos nuevos de Supabase no los conceden por defecto).
-- RLS sigue decidiendo qué filas ve cada rol; esto solo habilita el acceso a la tabla.

-- Público (visitantes de la tienda)
grant usage on schema public to anon, authenticated, service_role;
grant select on public.categories, public.products, public.settings to anon;

-- Usuarios con sesión (el panel; RLS limita a admins)
grant select, insert, update, delete on public.categories, public.products, public.orders to authenticated;
grant select, update on public.settings to authenticated;
grant select on public.admins to authenticated;

-- Edge Functions
grant all on all tables in schema public to service_role;

-- Funciones usadas dentro de las políticas RLS
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.touch_updated_at() to authenticated, service_role;
