import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
copyFileSync('src/theme.css', 'dist/theme.css');
copyFileSync('src/blocks.css', 'dist/blocks.css');
