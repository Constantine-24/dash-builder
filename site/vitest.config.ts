import { defineConfig } from 'vitest/config';
import { siteConfig } from '@grid-master/demo-kit';

export default defineConfig({
  define: { __SITE__: JSON.stringify(siteConfig({})) },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
});
