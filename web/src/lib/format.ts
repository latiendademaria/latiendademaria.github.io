const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const money = (cents: number) => eur.format(cents / 100);

const dt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const dateTime = (iso: string) => dt.format(new Date(iso));

export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'producto';

/** € escritos por una persona ("12,50", "12.5", "12") → céntimos */
export function parseEuros(input: string): number | null {
  const clean = input.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}
export const centsToInput = (c: number) => (c / 100).toFixed(2).replace('.', ',');
