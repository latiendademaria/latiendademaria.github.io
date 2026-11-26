# La tienda de Maria — Arquitectura

Tienda online de manualidades (bufandas y bolsos de crochet, árboles y adornos de limpiapipas).
Objetivo: exposición de productos simple y elegante, pago con Stripe y gestión completa desde la propia web. Coste fijo: 0 €.

## Decisiones

| Tema | Decisión |
|---|---|
| Frontend | Sitio estático (Vite + TypeScript) en **GitHub Pages**, desplegado con GitHub Actions |
| Backend | **Supabase** (free tier): Postgres + Auth + Storage + Edge Functions |
| Pagos | **Stripe Checkout** (solo Stripe) |
| Stock | **Cantidad por producto** (sin variantes) |
| Dominio | Subdominio gratuito `*.github.io` |
| Envío | Tarifa plana, configurable desde el panel |

## Componentes

```
GitHub Pages (estático)
 ├─ /            Tienda pública: hero, rejilla, filtros, modal de producto, envíos, contacto
 └─ /admin/      Panel (login con enlace mágico)
        │  supabase-js (anon key + RLS)
        ▼
Supabase
 ├─ Postgres     products, categories, orders, settings, admins
 ├─ Storage      bucket `product-images` (lectura pública, escritura solo admin)
 ├─ Auth         magic link; solo emails en tabla `admins`
 └─ Edge Functions
     ├─ create-checkout   valida stock, reserva unidades, crea Checkout Session
     ├─ stripe-webhook    completed → pedido pagado + stock definitivo; expired → libera reserva
     └─ (cron) keepalive  vía GitHub Actions semanal, evita la pausa por inactividad
        │
        ▼
Stripe Checkout (tarjeta, Apple/Google Pay; recoge dirección y teléfono)
```

## Modelo de datos (borrador)

- **categories**: id, name, slug, sort
- **products**: id, slug, title, description, category_id, price_cents, stock, reserved, images (text[] de rutas en Storage), published (bool), sort, created_at, updated_at
  - Disponible = `stock - reserved > 0`; Agotado/Vendido en caso contrario
- **orders**: id, stripe_session_id (unique), status (`pending` | `paid` | `shipped` | `cancelled` | `expired`), items (jsonb: product_id, title, qty, unit_price), subtotal_cents, shipping_cents, total_cents, customer_name, email, phone, shipping_address (jsonb), tracking, notes, created_at, paid_at, shipped_at
- **settings** (fila única): shipping_flat_cents, shop_name, about_text, contact_email, instagram
- **admins**: email

### RLS
- Público (anon): `SELECT` en products publicados, categories, settings.
- Admin (autenticado y presente en `admins`): CRUD completo en todo.
- `orders` solo legible/escribible por admin y por las Edge Functions (service role).

## Flujo de compra

1. Cliente pulsa "Comprar" → `create-checkout` con `{items:[{product_id, qty}]}`.
2. La función, en una transacción, comprueba `stock - reserved >= qty`, incrementa `reserved`, crea pedido `pending` y una Checkout Session con caducidad de 30 min.
3. Redirección a Stripe.
4. Webhook `checkout.session.completed` → `stock -= qty`, `reserved -= qty`, pedido `paid` con datos de envío.
5. Webhook `checkout.session.expired` → `reserved -= qty`, pedido `expired`.
6. Stripe envía el recibo al cliente y el aviso de venta a Maria.

Los precios siempre se calculan en el servidor desde la BD; el cliente nunca envía precios.

## Panel de administración (pensado para usuaria no técnica, móvil primero)

- **Productos**: lista con foto, precio y stock; crear/editar con subida de fotos (redimensionado a WebP en el navegador antes de subir), reordenar, publicar/ocultar, +/- stock.
- **Pedidos**: pendientes de envío arriba; ver dirección, marcar como enviado (con nº de seguimiento opcional).
- **Ajustes**: precio de envío, textos de "Sobre mí", contacto.
- **Categorías**: alta/baja/orden.

## Límites del free tier relevantes

- Supabase: 500 MB BD, 1 GB Storage, 5 GB de transferencia/mes, pausa tras 7 días sin actividad (mitigado con keepalive).
- GitHub Pages: 1 GB de sitio, 100 GB/mes de ancho de banda.
- Stripe: sin cuota, ~1,5 % + 0,25 € por pago con tarjeta europea.

## Estructura del repo (propuesta)

```
/web                 Vite + TS (index.html, admin/index.html)
/supabase
  /migrations        SQL: tablas, RLS, funciones de reserva de stock
  /functions         create-checkout, stripe-webhook
/.github/workflows   deploy-pages.yml, keepalive.yml
```
