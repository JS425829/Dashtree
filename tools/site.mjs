// Builds the live demo for the GitHub Pages site: docs/demo.html (no outside requests).
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildDemoHtml } from './demo.mjs';

mkdirSync('docs', { recursive: true });
writeFileSync('docs/demo.html', await buildDemoHtml({ favicons: false }));
writeFileSync('docs/.nojekyll', '');
console.log('wrote docs/demo.html');
