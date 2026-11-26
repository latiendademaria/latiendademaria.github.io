// Webhook de Stripe. Eventos a suscribir en el panel de Stripe:
//   checkout.session.completed
//   checkout.session.async_payment_succeeded
//   checkout.session.async_payment_failed
//   checkout.session.expired
import type Stripe from 'npm:stripe@17.7.0';
import { cryptoProvider, db, stripe } from '../_shared/clients.ts';

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

async function markPaid(s: Stripe.Checkout.Session) {
  const orderId = s.metadata?.order_id ?? s.client_reference_id;
  if (!orderId) throw new Error(`session ${s.id} sin order_id`);

  // La dirección de envío está en distinto sitio según la versión de la API
  // deno-lint-ignore no-explicit-any
  const anyS = s as any;
  const shipping = anyS.collected_information?.shipping_details ?? anyS.shipping_details ?? null;
  const cd = s.customer_details;

  const { error } = await db.rpc('complete_order', {
    p_order_id: orderId,
    p_session_id: s.id,
    p_customer_name: shipping?.name ?? cd?.name ?? null,
    p_email: cd?.email ?? null,
    p_phone: cd?.phone ?? null,
    p_address: shipping?.address ?? cd?.address ?? null,
    p_total_cents: s.amount_total ?? null,
  });
  if (error) throw error;
}

async function release(s: Stripe.Checkout.Session) {
  const orderId = s.metadata?.order_id ?? s.client_reference_id;
  if (!orderId) return;
  const { error } = await db.rpc('expire_order', { p_order_id: orderId });
  if (error) throw error;
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(), sig, WEBHOOK_SECRET, undefined, cryptoProvider,
    );
  } catch (e) {
    console.error('bad signature', e);
    return new Response('bad signature', { status: 400 });
  }

  try {
    const s = event.data.object as Stripe.Checkout.Session;
    switch (event.type) {
      case 'checkout.session.completed':
        // Con métodos asíncronos (p.ej. SEPA) el pago puede llegar más tarde
        if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') await markPaid(s);
        break;
      case 'checkout.session.async_payment_succeeded':
        await markPaid(s);
        break;
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        await release(s);
        break;
    }
  } catch (e) {
    console.error('webhook handling failed', event.type, e);
    return new Response('error', { status: 500 }); // Stripe reintentará
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
