// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';
import auth from 'auth-astro';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  // Rendered per request by default — almost every page depends on the
  // session, the cart cookie or live catalogue/order data. The few pages
  // that don't (the shop grid's shell, login, 404) opt into build-time
  // rendering with `export const prerender = true`.
  output: 'server',
  redirects: {
    // A bare /moderator/review (no order code) has nowhere useful to land
    // but the requests queue. Still gated by the middleware's /moderator
    // prefix like any other request.
    '/moderator/review': '/moderator/requests',
  },
  adapter: node({ mode: 'standalone' }),
  integrations: [auth({ configFile: './src/auth.ts' }), icon()],
  vite: {
    plugins: [tailwindcss()],
    // Dev server is tunneled (see scripts/dev-tunnel.sh) through a random
    // *.loca.lt hostname each run, which Vite's Host-header check would
    // otherwise reject.
    server: { allowedHosts: true },
  },
});
