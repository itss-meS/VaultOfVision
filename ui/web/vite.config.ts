import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { devAssets } from './devAssets';

const devWithoutCsp: Plugin = {
  name: 'dev-without-csp',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '');
  },
};

const withoutOrtInBuild: Plugin = {
  name: 'without-ort-in-build',
  apply: 'build',
  enforce: 'pre',
  resolveId(id) {
    return id === 'onnxruntime-web' ? '\0empty-ort' : null;
  },
  load(id) {
    return id === '\0empty-ort' ? 'export default {};' : null;
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), devWithoutCsp, devAssets(), withoutOrtInBuild],
  build: {
    sourcemap: false,
    target: 'es2020',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    globals: false,
  },
});