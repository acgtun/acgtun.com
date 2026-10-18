// Writes a hash-based Content-Security-Policy <meta> into each published page.
// Run after editing any inline <style> or <script>: node tools/csp.js
// tests/game.test.js fails if a page's policy is stale.
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

// frame-ancestors and report-uri are ignored in a <meta> policy, so they are left out.
function policyFor(html) {
  const scripts = hashes(html, 'script');
  if (/<script\s[^>]*src=/.test(html)) scripts.unshift("'self'");
  const styles = hashes(html, 'style');
  return [
    "default-src 'none'",
    `script-src ${scripts.length ? scripts.join(' ') : "'none'"}`,
    `style-src ${styles.length ? styles.join(' ') : "'none'"}`,
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; ');
}

const metaFor = html => `<meta http-equiv="Content-Security-Policy" content="${policyFor(html)}">`;

if (require.main === module) {
  for (const file of PAGES) {
    const html = fs.readFileSync(file, 'utf8');
    if (!META.test(html)) throw new Error(`${file}: no Content-Security-Policy <meta> to update`);
    fs.writeFileSync(file, html.replace(META, metaFor(html)));
    console.log(`updated ${path.relative(process.cwd(), file)}`);
  }
}

module.exports = { PAGES, META, metaFor };
