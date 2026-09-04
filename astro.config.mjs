// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';
import auth from 'auth-astro';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  // Static by default (catalogue + item pages are pre-rendered at build time).
  // Every other route opts into per-request rendering with `export const prerender = false`.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [auth({ configFile: './src/auth.ts' }), icon()],
  vite: {
    plugins: [tailwindcss()],
  },
});
