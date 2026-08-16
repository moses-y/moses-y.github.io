#!/usr/bin/env node
// Headless driver for the moses-y.github.io static site.
//
// Speaks Chrome DevTools Protocol directly over Node's built-in WebSocket
// (Node >= 22), so there is nothing to npm install. Puppeteer/Playwright are
// NOT dependencies of this repo and installing them just to click a button is
// not worth 300MB.
//
// Usage:
//   node .claude/skills/run-moses-y-github-io/driver.mjs <url> [command...]
//
// Commands (run in order, all optional):
//   wait:<css>[:<ms>]    wait for a selector (default 15000ms)
//   click:<css>          click the first match
//   eval:<expr>          evaluate JS, print the JSON result
//   text:<css>           print textContent of the first match
//   count:<css>          print how many nodes match
//   shot:<path>          full-page PNG screenshot
//   sleep:<ms>           wait
//
// Exit code is non-zero if any command fails or the page logged an error.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME = process.env.CHROME_BIN || 'chromium';
const PORT = Number(process.env.CDP_PORT || 9222);
const [, , url, ...cmds] = process.argv;

if (!url) {
  console.error('usage: driver.mjs <url> [wait:sel] [click:sel] [eval:expr] [shot:path] ...');
  process.exit(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --disable-gpu and --no-sandbox are both required in a container; without the
// sandbox flag Chromium exits immediately with no diagnostic on most images.
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--window-size=1440,900', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

let chromeErr = '';
chrome.stderr.on('data', d => { chromeErr += d; });

const cleanup = () => { try { chrome.kill('SIGTERM'); } catch {} };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await r.json();
      const page = targets.find(t => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chromium never exposed a CDP page target.\n' + chromeErr.slice(0, 600));
}

const ws = new WebSocket(await targetUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });

let seq = 0;
const pending = new Map();
const pageErrors = [];

ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    pageErrors.push(msg.params?.exceptionDetails?.exception?.description
      || msg.params?.exceptionDetails?.text || 'unknown page error');
  }
};

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} timed out`)); }
    }, 30000);
  });
}

// Returns the value, and throws if the page threw. `awaitPromise` lets an
// expression return a promise, which the semantic layer needs.
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result?.value;
}

const q = css => JSON.stringify(css);

await send('Page.enable');
await send('Runtime.enable');

// Page.loadEventFired is unreliable for pages that hydrate from fetch(), so we
// navigate then poll readyState instead.
await send('Page.navigate', { url });
for (let i = 0; i < 80; i++) {
  try { if (await evaluate('document.readyState') === 'complete') break; } catch {}
  await sleep(250);
}

let failed = 0;
for (const cmd of cmds) {
  const i = cmd.indexOf(':');
  const verb = i === -1 ? cmd : cmd.slice(0, i);
  const arg = i === -1 ? '' : cmd.slice(i + 1);
  try {
    if (verb === 'wait') {
      const m = arg.match(/^(.*?)(?::(\d+))?$/);
      const sel = m[1], budget = Number(m[2] || 15000);
      const t0 = Date.now();
      let found = false;
      while (Date.now() - t0 < budget) {
        if (await evaluate(`!!document.querySelector(${q(sel)})`)) { found = true; break; }
        await sleep(200);
      }
      if (!found) throw new Error(`selector never appeared: ${sel}`);
      console.log(`wait   ${sel} -> ok (${Date.now() - t0}ms)`);

    } else if (verb === 'click') {
      const ok = await evaluate(
        `(()=>{const e=document.querySelector(${q(arg)});if(!e)return false;e.click();return true})()`);
      if (!ok) throw new Error(`no element: ${arg}`);
      await sleep(400);
      console.log(`click  ${arg} -> ok`);

    } else if (verb === 'eval') {
      console.log(`eval   ${JSON.stringify(await evaluate(arg))}`);

    } else if (verb === 'text') {
      const t = await evaluate(`(document.querySelector(${q(arg)})||{}).textContent||null`);
      console.log(`text   ${arg} -> ${t === null ? '(no match)' : JSON.stringify(t.trim().slice(0, 300))}`);
      if (t === null) throw new Error('no match');

    } else if (verb === 'count') {
      console.log(`count  ${arg} -> ${await evaluate(`document.querySelectorAll(${q(arg)}).length`)}`);

    } else if (verb === 'sleep') {
      await sleep(Number(arg));

    } else if (verb === 'shot' || verb === 'shotv') {
      // Full-page capture re-lays-out the page, which drops position:fixed overlays
      // (the nav menu). Use shotv for anything fixed.
      const { data } = await send('Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: verb === 'shot' });
      mkdirSync(dirname(arg), { recursive: true });
      writeFileSync(arg, Buffer.from(data, 'base64'));
      console.log(`shot   ${arg} -> ${(Buffer.from(data, 'base64').length / 1024).toFixed(0)}KB`);

    } else {
      throw new Error(`unknown command "${verb}"`);
    }
  } catch (e) {
    console.error(`FAIL   ${cmd}: ${e.message}`);
    failed++;
  }
}

if (pageErrors.length) {
  console.error(`\n${pageErrors.length} page error(s):`);
  pageErrors.slice(0, 5).forEach(e => console.error('  ' + e.split('\n')[0]));
}

ws.close();
cleanup();
process.exit(failed || pageErrors.length ? 1 : 0);
