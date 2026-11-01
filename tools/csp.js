// Writes a hash-based Content-Security-Policy <meta> and versioned script URLs into each published page.
// Run after editing any inline <style> or <script>, or any script it loads (i18n.js, engine.js): node tools/csp.js
// tests/game.test.js fails if a page is stale.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
const PAGES = ['index.html', 'dark-jungle-chess/index.html', 'dark-jungle-chess/rules.html'].map(p => path.join(DOCS, p));
const META = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;

const hashes = (html, tag) =>
  [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))]
    .map(m => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);

// A page that plays online names its game server in <meta id="online-server">; it may connect only to that server
// and to the local one from `npm run dev` in server/ (used when the page itself is served from 127.0.0.1).
const ONLINE_SERVER = /<meta name="online-server" id="online-server" content="([^"]*)">/;
const LOCAL_SERVER = 'http://127.0.0.1:8787';

function connectSrc(html) {
  const m = ONLINE_SERVER.exec(html);
  if (!m) return [];
  const origins = [LOCAL_SERVER, m[1]].filter(Boolean).map(u => new URL(u).origin);
  return [`connect-src ${origins.flatMap(o => [o, o.replace(/^http/, 'ws')]).join(' ')}`];
}

// frame-ancestors and report-uri are ignored in a <meta> policy, so they are left out.
function policyFor(html) {
  const scripts = hashes(html, 'script');
  if (/<script\s[^>]*src=/.test(html)) scripts.unshift("'self'");
  const styles = hashes(html, 'style');
  return [
    "default-src 'none'",
    `script-src ${scripts.length ? scripts.join(' ') : "'none'"}`,
    `style-src ${styles.length ? styles.join(' ') : "'none'"}`,
    ...connectSrc(html),
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; ');
}

const metaFor = html => `<meta http-equiv="Content-Security-Policy" content="${policyFor(html)}">`;

// GitHub Pages caches every file for 10 minutes; a content hash in the URL keeps HTML and its scripts in step.
const SCRIPT_SRC = /(<script src=")([^"?]+)(?:\?v=[0-9a-f]+)?(">)/g;
const versioned = (html, file) => html.replace(SCRIPT_SRC, (m, open, src, close) => {
  const target = src.startsWith('/') ? path.join(DOCS, src) : path.join(path.dirname(file), src);
  const v = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0, 10);
  return `${open}${src}?v=${v}${close}`;
});

function build(html, file) {
  if (!META.test(html)) throw new Error(`${file}: no Content-Security-Policy <meta> to update`);
  const out = versioned(html, file);
  return out.replace(META, metaFor(out));
}

if (require.main === module) {
  for (const file of PAGES) {
    fs.writeFileSync(file, build(fs.readFileSync(file, 'utf8'), file));
    console.log(`updated ${path.relative(process.cwd(), file)}`);
  }
}

module.exports = { PAGES, build };
