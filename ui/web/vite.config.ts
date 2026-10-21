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

const withoutDevEnginesInBuild: Plugin = {
  name: 'without-dev-engines-in-build',
  apply: 'build',
  enforce: 'pre',
  resolveId(id) {
    return id === 'onnxruntime-web' || id === 'sql.js' ? '\0empty-dev-engine' : null;
  },
  load(id) {
    return id === '\0empty-dev-engine' ? 'export default {};' : null;
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), devWithoutCsp, devAssets(), withoutDevEnginesInBuild],
  build: {
    sourcemap: false,
    target: 'es2020',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    globals: false,
  },
});
