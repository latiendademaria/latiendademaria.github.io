import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Sitio en la raíz de latiendademaria.github.io → base '/'
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        gracias: resolve(__dirname, 'gracias.html'),
        avisoLegal: resolve(__dirname, 'legal/aviso-legal.html'),
        privacidad: resolve(__dirname, 'legal/privacidad.html'),
        condiciones: resolve(__dirname, 'legal/condiciones.html'),
      },
    },
  },
});
