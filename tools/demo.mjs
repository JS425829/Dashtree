// Builds one self-contained HTML file: the real page code plus a stand-in for the extension runtime with sample data.
// `favicons: true` fetches site icons from a public favicon service (fine for a private preview);
// `favicons: false` makes no outside requests at all (for the public site), so cards show lettered tiles.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

export async function buildDemoHtml({ favicons }) {
  const result = await build({
    stdin: { contents: "import './chrome-shim.ts'; import '../src/page/main.ts';", resolveDir: 'tools', loader: 'ts' },
    bundle: true,
    format: 'iife',
    target: 'es2022',
    write: false,
    define: { __FAVICONS__: String(favicons) },
    minifySyntax: true, // drops the dead `false ? url : ''` branch, so the favicon service's address is not even in the file
  });

  const js = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
  return readFileSync('src/page/index.html', 'utf8').replace(
    '<script type="module" src="page.js"></script>',
    () => `<script>${js}</script>`,
  );
}
