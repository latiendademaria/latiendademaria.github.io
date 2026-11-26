import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

export const cryptoProvider = Stripe.createSubtleCryptoProvider();

// service_role: salta RLS, solo se usa dentro de las Edge Functions
export const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

export const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://latiendademaria.github.io').replace(/\/$/, '');

export function corsHeaders(origin: string | null): HeadersInit {
  const allowed = [SITE_URL, 'http://localhost:5173', 'http://localhost:4173'];
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : SITE_URL,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Vary': 'Origin',
  };
}
