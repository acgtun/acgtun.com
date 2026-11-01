# acgtun.com

Static site for [acgtun.com](https://acgtun.com), served by GitHub Pages from `docs/`.

| Path | What |
| --- | --- |
| `docs/` | Published site root (`CNAME`, `.nojekyll`, landing page) |
| `docs/dark-jungle-chess/` | 暗棋斗兽棋 · Dark Jungle Chess: `index.html` (the game, on one screen or online), `engine.js` (the rules, shared with the online server), `rules.html` (how to play) and `i18n.js` (UI text in 30 languages) |
| `design/` | Design docs (not published to the site) |
| `server/` | Online play server (Cloudflare Workers + Durable Objects); `src/room-core.js` is the room logic |
| `tests/` | Game and online-room tests |
| `tools/csp.js` | Rewrites each page's Content-Security-Policy hashes and `?v=` script versions |

## Run locally

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Then open <http://127.0.0.1:8000/dark-jungle-chess/>.

The online play server (needs Node.js; the first command installs wrangler into `server/node_modules`):

```bash
cd server && npm install
npm run dev     # local server on http://127.0.0.1:8787
npm run smoke   # in another terminal: plays a full game against it
```

With both running, the game page at <http://127.0.0.1:8000/dark-jungle-chess/> shows "Play a friend online" and uses the local server. On the published site the button stays hidden until `<meta id="online-server">` in `docs/dark-jungle-chess/index.html` names the deployed server (then run `node tools/csp.js`).

## Test

```bash
node tests/game.test.js   # the game, rules and translations
node tests/room.test.js   # online rooms (server/src/room-core.js)
```

No dependencies.

After editing any inline `<script>` or `<style>`, `i18n.js` or `engine.js`, regenerate the CSP hashes and script versions (the tests fail until you do):

```bash
node tools/csp.js
```

## Translations

All UI text lives in `docs/dark-jungle-chess/i18n.js`, one block per language. Every language must have the same keys, `{placeholders}` and `**bold**` markers as English; the tests check this. Translations are AI-generated and have not been reviewed by native speakers.
