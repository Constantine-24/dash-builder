import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { siteConfig } from '@grid-master/demo-kit';

const site = siteConfig(process.env);

export default defineConfig({
  base: site.base,
  define: { __SITE__: JSON.stringify(site) },
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        react: fileURLToPath(new URL('./react/index.html', import.meta.url)),
      },
    },
  },
});
