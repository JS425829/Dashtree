// Builds .superpowers/preview/preview.html: the real page code + sample data, openable straight from disk.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildDemoHtml } from './demo.mjs';

mkdirSync('.superpowers/preview', { recursive: true });
writeFileSync('.superpowers/preview/preview.html', await buildDemoHtml({ favicons: true }));
console.log('wrote .superpowers/preview/preview.html');
