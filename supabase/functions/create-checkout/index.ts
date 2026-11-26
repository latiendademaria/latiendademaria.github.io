// POST { items: [{ product_id, qty }] } → { url }
// Reserva stock, crea pedido pendiente y abre una sesión de Stripe Checkout.
import { corsHeaders, db, getStripe, SITE_URL } from '../_shared/clients.ts';

type Line = { product_id: string; title: string; qty: number; unit_price_cents: number; image: string | null };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

function publicImage(path: string | null): string[] {
  if (!path) return [];
  if (/^https?:\/\//.test(path)) return [path];
  return [`${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`];
}

function friendlyError(msg: string): string {
  if (msg.includes('OUT_OF_STOCK:')) {
    return `Lo sentimos, ya no quedan suficientes unidades de "${msg.split('OUT_OF_STOCK:')[1].trim()}".`;
  }
  if (msg.includes('PRODUCT_NOT_FOUND')) return 'Uno de los productos ya no está disponible.';
  if (msg.includes('EMPTY_CART')) return 'El carrito está vacío.';
  if (msg.includes('MIN_TOTAL')) return 'El pedido mínimo es de 0,50 €. Añade algo más a la cesta.';
  return 'No se ha podido iniciar el pago. Inténtalo de nuevo.';
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let items: { product_id: string; qty: number }[];
  try {
    const body = await req.json();
    items = (body.items ?? []).map((i: { product_id: unknown; qty: unknown }) => ({
      product_id: String(i.product_id),
      qty: Math.floor(Number(i.qty)),
    }));
  } catch {
    return json({ error: 'Petición no válida' }, 400);
  }

  // Red de seguridad: libera reservas abandonadas antes de comprobar stock
  await db.rpc('release_stale_orders');

  const { data: order, error } = await db.rpc('create_pending_order', { p_items: items });
  if (error) return json({ error: friendlyError(error.message) }, 409);

  const lines = order.items as Line[];
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      locale: 'es',
      client_reference_id: order.order_id,
      metadata: { order_id: order.order_id },
      payment_intent_data: { metadata: { order_id: order.order_id } },
      line_items: lines.map((l) => ({
        quantity: l.qty,
        price_data: {
          currency: 'eur',
          unit_amount: l.unit_price_cents,
          product_data: { name: l.title, images: publicImage(l.image) },
        },
      })),
      shipping_address_collection: { allowed_countries: ['ES'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: order.shipping_cents === 0 ? 'Envío gratuito' : 'Envío estándar (3-5 días laborables)',
          fixed_amount: { amount: order.shipping_cents, currency: 'eur' },
        },
      }],
      phone_number_collection: { enabled: true },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // mínimo permitido por Stripe
      success_url: `${SITE_URL}/gracias.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?pago=cancelado`,
    });

    await db.from('orders').update({ stripe_session_id: session.id }).eq('id', order.order_id);
    return json({ url: session.url });
  } catch (e) {
    console.error('stripe error', e);
    await db.rpc('expire_order', { p_order_id: order.order_id });
    return json({ error: 'No se ha podido conectar con la pasarela de pago.' }, 502);
  }
});
