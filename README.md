# La tienda de María

Tienda online de crochet y adornos de limpiapipas. Web estática en GitHub Pages, datos en Supabase y pagos con Stripe Checkout. Coste fijo: 0 €.

Diseño y decisiones: [ARCHITECTURE.md](ARCHITECTURE.md).

## Desarrollo local

```bash
cd web
npm install
npm run dev          # http://localhost:5173  (tienda)  ·  /admin/  (panel)
```

Sin `web/.env` la web arranca en **modo demo**: productos de ejemplo guardados en `localStorage`, el login entra con cualquier email y el pago se simula. Para conectar con Supabase copia `web/.env.example` a `web/.env` y rellena los valores.

## Puesta en marcha (una sola vez)

### 1. Supabase
1. Crea un proyecto (región UE, p. ej. Frankfurt).
2. **SQL Editor** → ejecuta `supabase/migrations/20261126000000_init.sql` y después `supabase/seed.sql` (cambia antes el email de admin).
3. **Authentication → Users → Invite user** con el email de María (y el tuyo). Solo los emails de la tabla `admins` pueden gestionar la tienda.
4. **Authentication → URL Configuration**:
   - Site URL: `https://latiendademaria.github.io`
   - Redirect URLs: `https://latiendademaria.github.io/admin/`, `http://localhost:5173/admin/`
5. (Opcional) **Authentication → Email templates**: traduce el email del enlace mágico al español.

### 2. Stripe
1. Activa la cuenta (datos fiscales y bancarios) y, en **Settings → Payment methods**, habilita los métodos que quieras (tarjeta, Apple Pay, Google Pay…).
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
3. Activa en **Settings → Emails** el recibo al cliente y las notificaciones de pago para María.

### 3. Edge Functions
Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... SITE_URL=https://latiendademaria.github.io
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

Usa primero las claves `sk_test_` / `whsec_` de modo test y prueba con la tarjeta `4242 4242 4242 4242`.

### 4. GitHub
1. Crea la cuenta/organización `latiendademaria` y el repo **`latiendademaria.github.io`**.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables** (son públicas, no secretos):
   - `SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
   - `SUPABASE_ANON_KEY` = clave *anon* / *publishable*
4. Push a `main` → se despliega solo.

> ⚠️ Secretos (`sk_live_…`, `whsec_…`, `service_role`) **nunca** van al repo ni a variables de GitHub: solo a `supabase secrets`.

## Mantenimiento

- **Keepalive**: `.github/workflows/keepalive.yml` consulta Supabase cada 3 días para que no se pause. GitHub desactiva los workflows programados si el repo pasa 60 días sin commits; si ocurre, reactívalo en la pestaña *Actions*.
- **Reservas**: al iniciar un pago se reservan unidades 30 min. Si Stripe no avisa de la caducidad, `release_stale_orders` las libera a los 90 min.
- **Reembolsos**: se hacen en Stripe; en el panel, *Cancelar* el pedido y elegir si se devuelven unidades al stock.
- **Textos legales**: `web/legal/*.html` contienen campos `[ENTRE CORCHETES]` por completar.

## Estructura

```
web/                 Vite + TypeScript (sin framework)
  index.html         tienda
  admin/index.html   panel
  gracias.html       tras el pago
  legal/             aviso legal, privacidad, condiciones
  src/lib/           api (supabase / demo), cesta, utilidades
supabase/
  migrations/        esquema, RLS, funciones de stock
  functions/         create-checkout, stripe-webhook
.github/workflows/   deploy, keepalive
```
