import { createClient } from '@supabase/supabase-js';
import type { Api } from './api';
import type { Category, Order, Product, Settings } from './types';
import { slugify } from './format';
import { pendingCheckout } from './pending';

const BUCKET = 'product-images';

export function createSupabaseApi(url: string, key: string): Api {
  const sb = createClient(url, key, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
  });

  const ok = <T>(r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };

  async function uniqueSlug(title: string, id?: string): Promise<string> {
    const base = slugify(title);
    const { data } = await sb.from('products').select('id, slug').like('slug', `${base}%`);
    const taken = new Set((data ?? []).filter((r) => r.id !== id).map((r) => r.slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  return {
    mode: 'live',

    async getSettings() {
      return ok(await sb.from('settings').select('*').eq('id', 1).single()) as Settings;
    },
    async listCategories() {
      return ok(await sb.from('categories').select('*').order('sort').order('name')) as Category[];
    },
    async listProducts() {
      return ok(await sb.from('products').select('*').order('sort').order('created_at', { ascending: false })) as Product[];
    },
    imageUrl(path) {
      if (/^(https?:|data:|blob:)/.test(path)) return path;
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
    async checkout(lines) {
      const { data, error } = await sb.functions.invoke('create-checkout', { body: { items: lines } });
      if (error) {
        // Mensaje amable que devuelve la función
        let msg = 'No se ha podido iniciar el pago.';
        try { msg = (await error.context.json()).error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      if (data.order_id) pendingCheckout.set(data.order_id);
      return data.url as string;
    },
    async releaseAbandonedCheckout() {
      const id = pendingCheckout.get();
      if (!id) return false;
      pendingCheckout.clear();
      const { data } = await sb.functions.invoke('create-checkout', { body: { release: id } });
      return data?.released === true;
    },

    async currentEmail() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.email ?? null;
    },
    async sendMagicLink(email) {
      ok(await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/admin/` },
      }));
    },
    async signOut() { await sb.auth.signOut(); },
    async isAdmin() {
      const { data } = await sb.rpc('is_admin');
      return data === true;
    },
    onAuthChange(fn) { sb.auth.onAuthStateChange(() => fn()); },

    async saveProduct(p) {
      const row = {
        title: p.title,
        description: p.description ?? '',
        category_id: p.category_id ?? null,
        price_cents: p.price_cents ?? 0,
        stock: p.stock ?? 0,
        images: p.images ?? [],
        published: p.published ?? false,
        sort: p.sort ?? 0,
        slug: p.slug || (await uniqueSlug(p.title, p.id)),
      };
      const q = p.id
        ? sb.from('products').update(row).eq('id', p.id).select().single()
        : sb.from('products').insert(row).select().single();
      return ok(await q) as Product;
    },
    async deleteProduct(id) {
      const { data } = await sb.from('products').select('images').eq('id', id).single();
      ok(await sb.from('products').delete().eq('id', id));
      const paths = (data?.images ?? []).filter((x: string) => !/^https?:/.test(x));
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    },
    async setStock(id, stock) {
      ok(await sb.from('products').update({ stock: Math.max(0, stock) }).eq('id', id));
    },
    async uploadImage(blob) {
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `products/${crypto.randomUUID()}.${ext}`;
      ok(await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' }));
      return path;
    },
    async deleteImage(path) {
      if (/^https?:/.test(path)) return;
      await sb.storage.from(BUCKET).remove([path]);
    },
    async saveCategory(c) {
      const row = { name: c.name, slug: c.slug || slugify(c.name), sort: c.sort ?? 0 };
      ok(c.id
        ? await sb.from('categories').update(row).eq('id', c.id)
        : await sb.from('categories').insert(row));
    },
    async deleteCategory(id) { ok(await sb.from('categories').delete().eq('id', id)); },
    async saveSettings(s) { ok(await sb.from('settings').update(s).eq('id', 1)); },
    async listOrders() {
      return ok(await sb.from('orders').select('*').neq('status', 'expired')
        .order('created_at', { ascending: false }).limit(300)) as Order[];
    },
    async updateOrder(id, patch) { ok(await sb.from('orders').update(patch).eq('id', id)); },
    async cancelOrder(id, restock) {
      // Si el pago sigue abierto en Stripe, ciérralo primero para que ya no se pueda pagar
      await sb.functions.invoke('create-checkout', { body: { release: id } }).catch(() => null);
      ok(await sb.rpc('admin_cancel_order', { p_order_id: id, p_restock: restock }));
    },
  };
}
