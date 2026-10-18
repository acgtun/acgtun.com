// Dark Jungle Chess tests. No dependencies: node tests/game.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const GAME_DIR = path.join(__dirname, '..', 'docs', 'dark-jungle-chess');
const html = fs.readFileSync(path.join(GAME_DIR, 'index.html'), 'utf8');
const rulesHtml = fs.readFileSync(path.join(GAME_DIR, 'rules.html'), 'utf8');
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
    textContent: '', className: '', dataset: {}, children: [], attrs: {}, tabIndex: -1,
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
const loadPage = () => new Function(scriptOf(html) +
  '\nreturn { get state() { return state; }, set state(s) { state = s; }, onCellClick, newGame, loadGame, canCapture, legalTargets, IDLE_DRAW_LIMIT, I18N, SAVE_KEY };')();
const game = loadPage();
const { PAGES, META, metaFor } = require('../tools/csp.js');
const rules = new Function(scriptOf(rulesHtml) + '\nreturn { IDLE_DRAW_LIMIT, RULES };')();

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
    for (const file of PAGES) {
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(src), path.basename(file));
    }
  },

  'Content-Security-Policy hashes are current (fix: node tools/csp.js)'() {
    for (const file of PAGES) {
      const src = fs.readFileSync(file, 'utf8');
      const meta = src.match(META);
      assert.ok(meta, `${file}: missing CSP meta`);
      assert.strictEqual(meta[0], metaFor(src), `${path.relative(process.cwd(), file)}: stale CSP, run node tools/csp.js`);
    }
  },

  'rules page matches the game (draw limit, animal names, links)'() {
    assert.strictEqual(rules.IDLE_DRAW_LIMIT, game.IDLE_DRAW_LIMIT);
    for (const l of ['zh', 'en']) assert.deepStrictEqual(rules.RULES[l].animal, game.I18N[l].animal, `${l} animal names`);
    assert.ok(html.includes('href="rules.html"'), 'game does not link to rules.html');
    assert.ok(rulesHtml.includes('href="./"'), 'rules page does not link back to the game');
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
