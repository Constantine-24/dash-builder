import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { SITE, siteConfig } from '@grid-master/demo-kit';

const site = siteConfig(process.env);

/** Fills `%SITE_NAME%` in the HTML entries, so the library name lives only in `SITE.name`. */
const siteName = (): Plugin => ({
  name: 'site-name',
  transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITE_NAME%', SITE.name) },
});

export default defineConfig({
  base: site.base,
  define: { __SITE__: JSON.stringify(site) },
  plugins: [siteName(), react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        react: fileURLToPath(new URL('./react/index.html', import.meta.url)),
      },
    },
  },
});
