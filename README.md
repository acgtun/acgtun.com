# acgtun.com

Static site for [acgtun.com](https://acgtun.com), served by GitHub Pages from `docs/`.

| Path | What |
| --- | --- |
| `docs/` | Published site root (`CNAME`, `.nojekyll`, landing page) |
| `docs/dark-jungle-chess/` | 暗棋斗兽棋 · Dark Jungle Chess: `index.html` (the game), `rules.html` (how to play) and `i18n.js` (UI text in 30 languages) |
| `design/` | Design docs (not published to the site) |
| `tests/` | Game tests |
| `tools/csp.js` | Rewrites each page's Content-Security-Policy hashes |

## Run locally

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Then open <http://127.0.0.1:8000/dark-jungle-chess/>.

## Test

```bash
node tests/game.test.js
```

No dependencies.

After editing any inline `<script>` or `<style>`, regenerate the CSP hashes (the tests fail until you do):

```bash
node tools/csp.js
```

## Translations

All UI text lives in `docs/dark-jungle-chess/i18n.js`, one block per language. Every language must have the same keys, `{placeholders}` and `**bold**` markers as English; the tests check this. Translations are AI-generated and have not been reviewed by native speakers.
