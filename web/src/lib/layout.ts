import { esc } from './dom';

/** Logo: flor de limpiapipas con pétalos de colores y botón central */
export const yarnMark = `
<svg viewBox="0 0 64 64" aria-hidden="true">
  <g stroke-width="3.4" stroke-linejoin="round"><path d="M32 23 C 22.5 16, 22.5 5, 32 3 C 41.5 5, 41.5 16, 32 23 Z" fill="#F7D0CB" stroke="#D9473B"/><path d="M32 23 C 22.5 16, 22.5 5, 32 3 C 41.5 5, 41.5 16, 32 23 Z" fill="#FCEFC2" stroke="#E8B52E" transform="rotate(60 32 32)"/><path d="M32 23 C 22.5 16, 22.5 5, 32 3 C 41.5 5, 41.5 16, 32 23 Z" fill="#D3EEEF" stroke="#5FB7BB" transform="rotate(120 32 32)"/><path d="M32 23 C 22.5 16, 22.5 5, 32 3 C 41.5 5, 41.5 16, 32 23 Z" fill="#FADDE7" stroke="#E585A8" transform="rotate(180 32 32)"/><path d="M32 23 C 22.5 16, 22.5 5, 32 3 C 41.5 5, 41.5 16, 32 23 Z" fill="#E6DCF4" stroke="#9B7BCF" transform="rotate(240 32 32)"/><path d="M32 23 C 22.5 16, 22.5 5, 32 3 C 41.5 5, 41.5 16, 32 23 Z" fill="#D2DEF2" stroke="#3F72C2" transform="rotate(300 32 32)"/></g>
  <circle cx="32" cy="32" r="9" fill="#D9A441"/>
</svg>`;

export function brand(href = '/') {
  return `<a class="brand" href="${href}" aria-label="La tienda de María, inicio">
    ${yarnMark}
    <span class="brand__text"><span class="brand__small">La tienda de</span><span class="brand__name">María</span></span>
  </a>`;
}

export function footer(contactEmail = '', instagram = '') {
  const year = new Date().getFullYear();
  const ig = instagram.replace(/^@/, '');
  return `<footer class="site-footer"><div class="wrap">
    <span>© ${year} La tienda de María · Hecho a mano en España</span>
    <nav>
      ${contactEmail ? `<a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a>` : ''}
      ${ig ? `<a href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">@${esc(ig)}</a>` : ''}
      <a href="/legal/aviso-legal.html">Aviso legal</a>
      <a href="/legal/privacidad.html">Privacidad</a>
      <a href="/legal/condiciones.html">Condiciones de venta</a>
    </nav>
  </div></footer>`;
}
