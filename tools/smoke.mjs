// Real-browser smoke test for the Chromium build (Chrome, Edge).
//   node tools/smoke.mjs <path-to-browser.exe> [extension-dir=dist] [debug-port=9333] [ws|pipe=ws]
// It launches the browser headless with the extension loaded, clicks through a small local site (a same-tab link
// and a new-tab link), opens the tree page, and checks the tree that was recorded.
//   ws   (Edge)   loads the extension with --load-extension and talks to the browser over a debugging websocket.
//   pipe (Chrome) branded Chrome ignores --load-extension, so the extension is loaded with the debugging
//                 protocol's Extensions.loadUnpacked, which is only available over a pipe.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [browser, extDir = 'dist', port = '9333', mode = 'ws'] = process.argv.slice(2);
if (!browser) throw new Error('usage: node tools/smoke.mjs <browser.exe> [extension-dir] [debug-port] [ws|pipe]');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (what, fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(150);
  }
};

// a tiny site: A -(same-tab link)-> B -(new-tab link)-> C
const pages = {
  '/a': '<title>Page A</title><a id="same" href="/b">to B</a>',
  '/b': '<title>Page B</title><a id="blank" href="/c" target="_blank">to C</a>',
  '/c': '<title>Page C</title>c',
};
const site = createServer((req, res) => {
  const path = req.url.split('?')[0];
  res.writeHead(pages[path] ? 200 : 404, { 'content-type': 'text/html' });
  res.end(pages[path] ?? 'not found');
}).listen(0, '127.0.0.1');
await new Promise((r) => site.once('listening', r));
const origin = `http://127.0.0.1:${site.address().port}`;

/** A Chrome DevTools Protocol client over any transport: `sendRaw(text)` out, `handle(message)` in. */
class Cdp {
  constructor(sendRaw) {
    this.sendRaw = sendRaw; this.n = 0; this.pending = new Map(); this.events = [];
  }
  handle(d) {
    if (d.id && this.pending.has(d.id)) {
      const { res, rej } = this.pending.get(d.id);
      this.pending.delete(d.id);
      d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result);
    } else this.events.push(d);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.n;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.sendRaw(JSON.stringify({ id, method, params, sessionId })); });
  }
}

const profile = mkdtempSync(join(tmpdir(), 'histo-smoke-'));
const common = ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'];
const proc = mode === 'pipe'
  ? spawn(browser, [...common, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
  : spawn(browser, [...common, `--remote-debugging-port=${port}`, `--load-extension=${resolve(extDir)}`, '--disable-features=DisableLoadExtensionCommandLineSwitch', 'about:blank'], { stdio: 'ignore' });

let dumpState = async () => {};
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures.push(name);
};

try {
  let cdp;
  if (mode === 'pipe') {
    // messages are JSON objects each ended by a NUL byte: we write to fd 3 and read from fd 4
    cdp = new Cdp((s) => proc.stdio[3].write(`${s}\0`));
    let buffered = '';
    proc.stdio[4].on('data', (chunk) => {
      buffered += chunk.toString('utf8');
      const parts = buffered.split('\0');
      buffered = parts.pop();
      for (const p of parts) if (p) cdp.handle(JSON.parse(p));
    });
    console.log(`browser: ${(await cdp.send('Browser.getVersion')).product}`);
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve(extDir) });
    console.log(`loaded the extension as ${id}`);
  } else {
    const version = await until('the browser debugging port', async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).json());
    console.log(`browser: ${version.Browser}`);
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    cdp = new Cdp((s) => ws.send(s));
    ws.onmessage = (m) => cdp.handle(JSON.parse(m.data));
  }

  const targets = async () => (await cdp.send('Target.getTargets')).targetInfos;
  // a blank tab fires tab events, which wakes a background worker the browser has not started yet
  await cdp.send('Target.createTarget', { url: 'about:blank' });
  const worker = await until('the extension service worker', async () =>
    (await targets()).find((t) => t.type === 'service_worker' && t.url.endsWith('/background.js')),
  ).catch(async (e) => {
    console.log('targets seen:', (await targets()).map((t) => `${t.type} ${t.url}`));
    throw e;
  });
  const extId = new URL(worker.url).host;
  check('the extension loaded and its background worker is running', true);

  // catch errors thrown in the background worker
  const workerSession = (await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true })).sessionId;
  await cdp.send('Runtime.enable', {}, workerSession);

  const attach = async (targetId) => (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  const evaluate = async (session, expression) =>
    // userGesture: the click counts as a real user action, so target=_blank links are not blocked as popups
    (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, session)).result.value;
  const ready = (session, title) => until(`page "${title}"`, () => evaluate(session, `document.readyState==='complete' && document.title===${JSON.stringify(title)}`));

  // A, then follow a same-tab link to B, then a new-tab link to C
  const tabA = (await cdp.send('Target.createTarget', { url: `${origin}/a` })).targetId;
  const sA = await attach(tabA);
  await ready(sA, 'Page A');
  await sleep(600);
  await evaluate(sA, `document.getElementById('same').click()`);
  await ready(sA, 'Page B');
  await sleep(800);
  await evaluate(sA, `document.getElementById('blank').click()`);
  const tabC = await until('the new tab for C', async () => (await targets()).find((t) => t.type === 'page' && t.url === `${origin}/c`));
  await ready(await attach(tabC.targetId), 'Page C');
  await sleep(1200);

  // open the tree page and read what it shows
  const tree = (await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/index.html` })).targetId;
  const sT = await attach(tree);
  const read = `(() => ({
    labels: [...document.querySelectorAll('.node .label')].map((n) => n.textContent),
    open: document.querySelectorAll('.node.open').length,
    hollow: document.querySelectorAll('.node.hollow').length,
    links: document.querySelectorAll('.connectors .link').length,
    title: document.title,
    logo: !!document.querySelector('h1 .logo'),
  }))()`;
  const nodesExpr = `chrome.runtime.sendMessage({ type: 'getState' }).then((r) =>
    Object.values(r.state.nodes).map((n) => ({ title: n.title, url: n.url.replace(location.origin, ''), tabId: n.tabId, parent: r.state.nodes[n.parentId]?.title ?? null })))`;
  dumpState = async () => {
    console.log('tree page at failure:', JSON.stringify(await evaluate(sT, read)));
    console.log('saved nodes at failure:', JSON.stringify(await evaluate(sT, nodesExpr)));
    console.log('worker events:', JSON.stringify(cdp.events.filter((e) => e.sessionId === workerSession).map((e) => e.method + ' ' + JSON.stringify(e.params).slice(0, 200))));
  };
  const seen = await until('three nodes on the tree page', async () => {
    const v = await evaluate(sT, read);
    return v.labels.length >= 3 ? v : null;
  });
  console.log('tree page shows:', JSON.stringify(seen));
  console.log('saved nodes:', JSON.stringify(await evaluate(sT, nodesExpr)));

  check('the tree page opens with the Histo-tree title and logo', seen.title === 'Histo-tree' && seen.logo);
  check('three pages were recorded: A, B and C', ['Page A', 'Page B', 'Page C'].every((t) => seen.labels.includes(t)), JSON.stringify(seen.labels));
  check('they form one chain: two connectors (A to B, B to C)', seen.links === 2, `links=${seen.links}`);
  check('the page A left is hollow; B and C, still open, are solid', seen.hollow === 1 && seen.open === 2, `open=${seen.open} hollow=${seen.hollow}`);

  // clicking a hollow node reopens its page
  await evaluate(sT, `[...document.querySelectorAll('.node')].find((n) => n.textContent.includes('Page A')).querySelector('.node-main').click()`);
  const reopened = await until('A reopened in a new tab', async () =>
    (await targets()).filter((t) => t.type === 'page' && t.url === `${origin}/a`).length >= 1,
  ).then(() => true, () => false);
  check('clicking the hollow node for A reopens it', reopened);
  if (!reopened) {
    console.log('targets at failure:', JSON.stringify((await targets()).filter((t) => t.type === 'page').map((t) => t.url.replace(origin, ''))));
    await dumpState().catch(() => {});
  }

  const errors = cdp.events
    .filter((e) => e.sessionId === workerSession && (e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')))
    .map((e) => JSON.stringify(e.params).slice(0, 300));
  check('the background worker threw no errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check(`smoke test ran to the end (${e.message})`, false);
  await dumpState().catch(() => {});
} finally {
  // kill the whole process tree: killing just the main process leaves headless child processes (and the debugging port) behind
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else proc.kill();
  site.close();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold a file; harmless temp data */ }
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
