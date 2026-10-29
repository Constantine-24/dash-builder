import type { SiteConfig } from '@grid-master/demo-kit';

declare global {
  /** Injected by vite `define` (vite.config.ts, vitest.config.ts). */
  const __SITE__: SiteConfig;
}
