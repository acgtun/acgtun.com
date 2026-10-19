// Dark Jungle Chess tests. No dependencies: node tests/game.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const GAME_DIR = path.join(__dirname, '..', 'docs', 'dark-jungle-chess');
const html = fs.readFileSync(path.join(GAME_DIR, 'index.html'), 'utf8');
const rulesHtml = fs.readFileSync(path.join(GAME_DIR, 'rules.html'), 'utf8');
const I18N_FILE = path.join(GAME_DIR, 'i18n.js');
const I18N_SRC = fs.readFileSync(I18N_FILE, 'utf8');
const scriptOf = page => page.match(/<script>([\s\S]*?)<\/script>/)[1];

// Seeded RNG so a failing random game can be replayed: SEED=<n> node tests/game.test.js
const SEED = Number(process.env.SEED) || Date.now() % 1e9;
let rngState = SEED;
Math.random = () => {
  rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Just enough DOM for render() to run; innerHTML assignment clears children like the real one.
function fakeEl() {
  return {
    textContent: '', className: '', value: '', dataset: {}, children: [], attrs: {}, tabIndex: -1,
    set innerHTML(_) { this.children = []; }, get innerHTML() { return ''; },
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); },
    append(...cs) { this.children.push(...cs); },
    replaceChildren(...cs) { this.children = cs; },
    addEventListener() {}, contains: () => false, focus() {},
  };
}
function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const els = {};
global.window = { localStorage: fakeStorage(), sessionStorage: fakeStorage(), addEventListener() {}, confirm: () => true };
global.document = {
  documentElement: {}, title: '', activeElement: null, body: { classList: { toggle() {} } },
  getElementById: id => (els[id] ||= fakeEl()),
  createElement: () => fakeEl(),
};
const loadPage = () => new Function(I18N_SRC + '\n' + scriptOf(html) +
  '\nreturn { get state() { return state; }, set state(s) { state = s; }, get lang() { return lang; }, onCellClick, newGame, loadGame, ' +
  'canCapture, legalTargets, setLang, fmtMsg, IDLE_DRAW_LIMIT, DJC, SAVE_KEY };')();
const game = loadPage();
const { DJC } = game;
const { PAGES, build } = require('../tools/csp.js');
const rules = new Function(I18N_SRC + '\n' + scriptOf(rulesHtml) +
  '\nreturn { IDLE_DRAW_LIMIT, render, setLang: l => { lang = l; } };')();

const textOf = n => (n && typeof n === 'object' ? n.textContent + n.children.map(textOf).join('') : String(n));
const LEFTOVER = /\{\w+\}|\*\*|\b(undefined|NaN|null)\b/;

const P = (rank, color, revealed = true) => ({ rank, color, revealed });
function playState(board, extra = {}) {
  game.newGame();
  Object.assign(game.state, { phase: 'play', board, players: { p1: 'red', p2: 'black' }, current: 'p1', ...extra });
  return game.state;
}
function emptyBoard() { return Array(16).fill(null); }

const tests = {
  'canCapture matches the rules table'() {
    for (let a = 1; a <= 8; a++) for (let b = 1; b <= 8; b++) {
      const want = a === b ? 'mutual' : a === 8 ? b === 1 : a === 1 ? (b >= 2 && b <= 7) : b > a;
      assert.strictEqual(game.canCapture(a, b), want, `canCapture(${a}, ${b})`);
    }
  },

  'mouse (8) captures net (1); net cannot capture mouse'() {
    const b = emptyBoard();
    b[0] = P(8, 'red'); b[1] = P(1, 'black'); b[15] = P(5, 'black');
    const s = playState(b);
    assert.ok(game.legalTargets(s.board, 0).includes(1));
    s.board[0] = P(1, 'red'); s.board[1] = P(8, 'black');
    assert.ok(!game.legalTargets(s.board, 0).includes(1));
  },

  'same rank: mutual destruction empties both squares'() {
    const b = emptyBoard();
    b[0] = P(3, 'red'); b[1] = P(3, 'black'); b[10] = P(2, 'red'); b[15] = P(5, 'black');
    const s = playState(b);
    game.onCellClick(0); game.onCellClick(1);
    assert.strictEqual(s.board[0], null);
    assert.strictEqual(s.board[1], null);
    assert.strictEqual(s.captured.red.length, 1);
    assert.strictEqual(s.captured.black.length, 1);
    assert.strictEqual(s.current, 'p2');
  },

  'mutual destruction of the last pieces is a draw'() {
    const b = emptyBoard();
    b[0] = P(4, 'red'); b[1] = P(4, 'black');
    const s = playState(b);
    game.onCellClick(0); game.onCellClick(1);
    assert.strictEqual(s.phase, 'over');
    assert.strictEqual(s.winner, null);
  },

  'capturing the last enemy piece wins'() {
    const b = emptyBoard();
    b[0] = P(2, 'red'); b[1] = P(6, 'black');
    const s = playState(b);
    game.onCellClick(0); game.onCellClick(1);
    assert.strictEqual(s.phase, 'over');
    assert.strictEqual(s.winner, 'p1');
  },

  'no legal action on your turn loses'() {
    const b = emptyBoard();
    // Black mouse in the corner, boxed in by red pieces it cannot capture.
    b[0] = P(8, 'black'); b[1] = P(3, 'red'); b[4] = P(4, 'red'); b[15] = P(2, 'red'); b[14] = P(5, 'red');
    const s = playState(b);
    game.onCellClick(15); game.onCellClick(11);
    assert.strictEqual(s.phase, 'over');
    assert.strictEqual(s.winner, 'p1');
    assert.ok(s.overReason.some(x => x.k === 'noAction'));
  },

  'idle limit ends in a draw and keeps the last move in the reason'() {
    const b = emptyBoard();
    b[0] = P(5, 'red'); b[15] = P(6, 'black');
    const s = playState(b, { idleSteps: game.IDLE_DRAW_LIMIT - 1 });
    game.onCellClick(0); game.onCellClick(1);
    assert.strictEqual(s.phase, 'over');
    assert.strictEqual(s.winner, null);
    assert.deepStrictEqual(s.overReason.map(x => x.k), ['moved', 'idleDraw']);
  },

  'with a piece selected, tapping a hidden piece deselects and keeps the turn'() {
    const b = emptyBoard();
    b[0] = P(5, 'red'); b[15] = P(6, 'black', false); b[10] = P(3, 'black');
    const s = playState(b);
    game.onCellClick(0);
    assert.strictEqual(s.selected, 0);
    game.onCellClick(15);
    assert.strictEqual(s.selected, null);
    assert.strictEqual(s.board[15].revealed, false);
    assert.strictEqual(s.current, 'p1');
  },

  'with a piece selected, tapping another own piece reselects it'() {
    const b = emptyBoard();
    b[0] = P(5, 'red'); b[5] = P(6, 'red'); b[15] = P(3, 'black');
    const s = playState(b);
    game.onCellClick(0); game.onCellClick(5);
    assert.strictEqual(s.selected, 5);
    assert.strictEqual(s.current, 'p1');
  },

  'color phase: different colors assign roles and player 1 starts'() {
    game.newGame();
    const s = game.state;
    const red = s.board.findIndex(p => p.color === 'red');
    const black = s.board.findIndex(p => p.color === 'black');
    game.onCellClick(red); game.onCellClick(black);
    assert.strictEqual(s.phase, 'play');
    assert.deepStrictEqual(s.players, { p1: 'red', p2: 'black' });
    assert.strictEqual(s.current, 'p1');
  },

  'a game in progress survives leaving the page and coming back'() {
    game.newGame();
    const s = game.state;
    game.onCellClick(s.board.findIndex(p => p.color === 'red'));
    game.onCellClick(s.board.findIndex(p => p.color === 'black' && !p.revealed));
    const restored = game.loadGame();
    assert.ok(restored, 'no saved game');
    assert.deepStrictEqual(restored.board, JSON.parse(JSON.stringify(s.board)));
    assert.strictEqual(restored.phase, 'play');
    assert.strictEqual(restored.current, s.current);
  },

  'a tampered save (HTML in a piece rank) is rejected'() {
    game.newGame();
    const saved = JSON.parse(window.sessionStorage.getItem(game.SAVE_KEY));
    saved.board[0] = { rank: '<img src=x onerror=alert(1)>', color: 'red', revealed: true };
    window.sessionStorage.setItem(game.SAVE_KEY, JSON.stringify(saved));
    assert.strictEqual(game.loadGame(), null);
  },

  'a corrupted save (unknown message key, wrong piece count) is rejected'() {
    game.newGame();
    const good = window.sessionStorage.getItem(game.SAVE_KEY);
    const badMsg = JSON.parse(good);
    badMsg.message = [{ k: 'noSuchMessage' }];
    window.sessionStorage.setItem(game.SAVE_KEY, JSON.stringify(badMsg));
    assert.strictEqual(game.loadGame(), null);
    const badCount = JSON.parse(good);
    badCount.board[0] = null;
    window.sessionStorage.setItem(game.SAVE_KEY, JSON.stringify(badCount));
    assert.strictEqual(game.loadGame(), null);
    for (const junk of ['not json', 'null', '[]', '{"phase":"play"}']) {
      window.sessionStorage.setItem(game.SAVE_KEY, junk);
      assert.strictEqual(game.loadGame(), null, junk);
    }
  },

  'the page starts a fresh game when the save is bad'() {
    window.sessionStorage.setItem(game.SAVE_KEY, JSON.stringify({ phase: 'play', board: 'x' }));
    const page = loadPage();
    assert.strictEqual(page.state.phase, 'assign');
    assert.ok(page.state.board.every(p => p && !p.revealed));
  },

  'no page builds HTML from strings (Trusted Types would block it)'() {
    for (const file of [...PAGES, I18N_FILE]) {
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(src), path.basename(file));
    }
  },

  'no Object.hasOwn (it throws on Safari < 15.4 and leaves a blank page)'() {
    for (const file of [...PAGES, I18N_FILE]) assert.ok(!/Object\.hasOwn\b/.test(fs.readFileSync(file, 'utf8')), path.basename(file));
  },

  'every page re-reads the language when Back restores it from the bfcache'() {
    for (const file of PAGES) {
      const src = fs.readFileSync(file, 'utf8');
      if (/<script src=/.test(src)) assert.ok(/addEventListener\('pageshow'/.test(src), path.relative(process.cwd(), file));
    }
  },

  'restart asks in-page, not with window.confirm (some in-app browsers block it)'() {
    assert.ok(/<dialog id="confirm"/.test(html), 'missing confirm dialog');
    assert.ok(/confirmDlg\.showModal\(\)/.test(html), 'restart does not open the dialog');
  },

  'CSP hashes and script versions are current (fix: node tools/csp.js)'() {
    for (const file of PAGES) {
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(src === build(src, file), `${path.relative(process.cwd(), file)}: stale, run node tools/csp.js`);
      if (/<script src=/.test(src)) assert.ok(/<script src="[^"]+\?v=[0-9a-f]{10}">/.test(src), `${file}: unversioned script`);
    }
  },

  'rules page matches the game (draw limit, links)'() {
    assert.strictEqual(rules.IDLE_DRAW_LIMIT, game.IDLE_DRAW_LIMIT);
    assert.ok(html.includes('href="rules.html"'), 'game does not link to rules.html');
    assert.ok(rulesHtml.includes('href="./"'), 'rules page does not link back to the game');
  },

  'all 30 languages have the same keys, placeholders and bold markers as English'() {
    const codes = Object.keys(DJC.T);
    assert.strictEqual(codes.length, 30);
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
    const bold = s => (s.match(/\*\*/g) || []).length;
    function same(a, b, where) {
      if (typeof b === 'string') {
        assert.strictEqual(typeof a, 'string', where);
        assert.ok(a.trim() && !/[<>]/.test(a), `${where}: empty or contains < >`);
        if (!/\.(name|htmlLang)$/.test(where)) {
          assert.strictEqual(ph(a), ph(b), `${where}: placeholders`);
          assert.strictEqual(bold(a), bold(b), `${where}: ** markers`);
        }
        return;
      }
      if (Array.isArray(b)) {
        assert.ok(Array.isArray(a) && a.length === b.length, `${where}: length`);
        b.forEach((x, i) => same(a[i], x, `${where}[${i}]`));
        return;
      }
      assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${where}: keys`);
      for (const k of Object.keys(b)) same(a[k], b[k], `${where}.${k}`);
    }
    for (const code of codes) same(DJC.T[code], DJC.T.en, code);
    assert.strictEqual(new Set(codes.map(c => DJC.T[c].name)).size, 30, 'duplicate language names');
  },

  'every language renders the game, every message and the rules page with no leftovers'() {
    const sample = { round: 2, n: 1, c1: 'red', c2: 'black', player: 'p1', piece: P(3, 'red'), a: P(3, 'red'), b: P(5, 'black'), limit: 40 };
    for (const code of Object.keys(DJC.T)) {
      const b = emptyBoard();
      b[0] = P(5, 'red'); b[1] = P(6, 'black'); b[4] = P(2, 'black', false);
      const s = playState(b, { captured: { red: [P(7, 'red')], black: [P(8, 'black')] }, selected: 0 });
      game.setLang(code);
      const texts = [document.title, els.status.textContent, els['label-p1'].textContent, els['label-p2'].textContent,
        els.restart.textContent, els['rules-link'].textContent, els['confirm-text'].textContent,
        els['confirm-ok'].textContent, els['confirm-cancel'].textContent, ...els.board.children.map(c => c.attrs['aria-label'] + textOf(c)),
        textOf(els['tray-red']), textOf(els['tray-black'])];
      for (const k of Object.keys(DJC.T.en.msg)) texts.push(game.fmtMsg([{ k, p: sample }]));
      s.players.p1 = null;
      texts.push(game.fmtMsg([{ k: 'turnPrompt', p: { player: 'p1' } }]));
      for (const t of texts) assert.ok(t && !LEFTOVER.test(t), `${code}: "${t}"`);
      assert.strictEqual(game.lang, code);
      assert.strictEqual(document.documentElement.lang, DJC.T[code].htmlLang);

      rules.setLang(code);
      rules.render();
      const page = textOf(els.rules);
      assert.ok(!LEFTOVER.test(page), `${code} rules page: ${(page.match(LEFTOVER) || [])[0]}`);
      assert.ok(page.includes(DJC.T[code].animal[7]) && page.includes('40'), `${code} rules page is missing names or the limit`);
    }
  },

  'messages read naturally in English and Chinese'() {
    playState(emptyBoard());
    const parts = [{ k: 'flipped', p: { player: 'p1', piece: P(2, 'red') } }, { k: 'turnPrompt', p: { player: 'p2' } }];
    game.setLang('en');
    assert.strictEqual(game.fmtMsg(parts), "Player 1 (Red) flipped Red Elephant. Player 2 (Black)'s turn: flip a hidden piece, or move/capture");
    game.setLang('zh');
    assert.strictEqual(game.fmtMsg(parts), '玩家 1（红方）翻开了红象。轮到玩家 2（黑方）：翻暗子，或移动/吃子');
  },

  'language choice: saved choice, then browser languages, then Chinese'() {
    const cases = [
      ['ja', ['fr'], 'ja'], ['xx', ['fr-FR'], 'fr'], [null, ['zh-TW'], 'zh-Hant'], [null, ['zh-Hant-HK'], 'zh-Hant'],
      [null, ['zh-CN'], 'zh'], [null, ['pt-BR'], 'pt'], [null, ['tl-PH'], 'fil'], [null, ['nl', 'de'], 'de'],
      [null, ['nl'], 'zh'], [null, undefined, 'zh'], ['__proto__', ['__proto__'], 'zh'], [null, ['en-GB'], 'en'],
    ];
    for (const [stored, prefs, want] of cases) assert.strictEqual(DJC.pickLang(stored, prefs), want, `${stored} ${prefs}`);
  },

  'language picker: a globe and one dropdown listing every language'() {
    const root = fakeEl(), chosen = [];
    const update = DJC.mountLangPicker(root, code => chosen.push(code));
    const [globe, select] = root.children;
    assert.strictEqual(globe.textContent, '🌐');
    assert.deepStrictEqual(select.children.map(o => o.value), Object.keys(DJC.T));
    assert.deepStrictEqual(select.children.slice(0, 2).map(o => o.value), ['zh', 'en']);
    update('ja');
    assert.strictEqual(select.value, 'ja');
    assert.strictEqual(select.attrs['aria-label'], DJC.T.ja.language);
  },

  'Arabic, Urdu and Persian switch the page to right-to-left'() {
    playState(emptyBoard());
    for (const code of ['ar', 'ur', 'fa']) {
      game.setLang(code);
      assert.strictEqual(document.documentElement.dir, 'rtl', code);
    }
    game.setLang('en');
    assert.strictEqual(document.documentElement.dir, 'ltr');
    assert.ok(/#board \{\s*direction: ltr;/.test(html), 'board must stay left-to-right so row/column labels match');
  },

  'random full games: pieces are conserved, turns pass, games end'() {
    const GAMES = 3000;
    for (let g = 0; g < GAMES; g++) {
      game.newGame();
      let plies = 0;
      while (game.state.phase !== 'over') {
        const s = game.state;
        assert.ok(++plies < 2000, 'game did not terminate');
        if (s.phase === 'assign') {
          const hidden = s.board.flatMap((p, i) => (p && !p.revealed ? [i] : []));
          game.onCellClick(hidden[Math.floor(Math.random() * hidden.length)]);
        } else {
          const me = s.players[s.current], before = s.current, actions = [];
          s.board.forEach((p, i) => {
            if (p && !p.revealed) actions.push([i]);
            if (p && p.revealed && p.color === me) for (const t of game.legalTargets(s.board, i)) actions.push([i, t]);
          });
          assert.ok(actions.length, 'play phase reached with no legal action');
          for (const i of actions[Math.floor(Math.random() * actions.length)]) game.onCellClick(i);
          if (s.phase !== 'over') assert.notStrictEqual(s.current, before, 'turn did not pass');
        }
        const s2 = game.state;
        assert.strictEqual(s2.board.filter(Boolean).length + s2.captured.red.length + s2.captured.black.length, 16);
        assert.ok(game.loadGame(), `valid position failed to load back (phase ${s2.phase})`);
      }
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
console.log(failed ? `\n${failed} failed (replay with SEED=${SEED})` : `\nall passed (SEED=${SEED})`);
process.exit(failed ? 1 : 0);
