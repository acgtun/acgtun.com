// Dark Jungle Chess rules: pure functions over a plain state object, no DOM.
// Shared by the page (hot-seat) and the online room server, so both always play by the same rules.
// A classic script that sets globalThis.DJCEngine; the server imports it for that side effect.
'use strict';

globalThis.DJCEngine = (() => {

const IDLE_DRAW_LIMIT = 40;   // moves in a row by both players with no flip and no capture, then a draw
const COLORS = ['red', 'black'];

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// true (captures) / false (cannot) / 'mutual' (same rank, both removed)
function canCapture(a, b) {
  if (a === b) return 'mutual';
  if (a === 8) return b === 1;            // mouse only captures net
  if (a === 1) return b >= 2 && b <= 7;   // net cannot capture mouse
  return b > a;
}

function neighbors(i) {
  const r = Math.floor(i / 4), c = i % 4, out = [];
  if (r > 0) out.push(i - 4);
  if (r < 3) out.push(i + 4);
  if (c > 0) out.push(i - 1);
  if (c < 3) out.push(i + 1);
  return out;
}

// Every legal destination for the face-up piece at i: empty squares, plus face-up enemy pieces it can capture.
function legalTargets(board, i) {
  const m = board[i], out = [];
  for (const j of neighbors(i)) {
    const t = board[j];
    if (!t) out.push(j);
    else if (t.revealed && t.color !== m.color && canCapture(m.rank, t.rank)) out.push(j);
  }
  return out;
}

const hasHidden = board => board.some(p => p && !p.revealed);

function hasLegalAction(board, color) {
  if (hasHidden(board)) return true;   // a hidden piece can always be flipped
  return board.some((p, i) => p && p.revealed && p.color === color && legalTargets(board, i).length > 0);
}

const aliveCount = (board, color) => board.filter(p => p && p.color === color).length;

function newGame(rng = Math.random) {
  const pieces = [];
  for (const color of COLORS)
    for (let rank = 1; rank <= 8; rank++)
      pieces.push({ rank, color, revealed: false });
  return {
    phase: 'assign',                       // 'assign' | 'play' | 'over'
    board: shuffle(pieces, rng),
    players: { p1: null, p2: null },
    current: 'p1',
    round: 1,
    roundFlips: [],                        // colors flipped so far in this color-phase round
    captured: { red: [], black: [] },
    idleSteps: 0,                          // moves in a row with no flip and no capture
    winner: undefined,                     // 'p1' | 'p2' | null (draw)
    overReason: [],                        // message parts explaining the result
    message: [{ k: 'assignPrompt', p: { round: 1, n: 1 } }],
  };
}

const fail = err => ({ ok: false, err });
const OK = Object.freeze({ ok: true });
const isCell = i => Number.isInteger(i) && i >= 0 && i < 16;

// The only way to change a game. action is { flip: i } or { move: [from, to] }.
// Returns { ok: true }, or { ok: false, err } and leaves the state untouched.
function apply(state, seat, action) {
  if (state.phase === 'over') return fail('gameOver');
  if (seat !== state.current) return fail('notYourTurn');
  const keys = action && typeof action === 'object' && !Array.isArray(action) ? Object.keys(action) : [];
  if (keys.length !== 1) return fail('badAction');
  if (keys[0] === 'flip') {
    if (!isCell(action.flip)) return fail('badAction');
    return state.phase === 'assign' ? assignFlip(state, action.flip) : playFlip(state, action.flip);
  }
  if (keys[0] === 'move') {
    const m = action.move;
    if (!Array.isArray(m) || m.length !== 2 || !m.every(isCell)) return fail('badAction');
    return playMove(state, seat, m[0], m[1]);
  }
  return fail('badAction');
}

// Color phase: players take turns flipping; the first round with two different colors assigns them.
function assignFlip(state, i) {
  const p = state.board[i];
  if (!p || p.revealed) return fail('illegalMove');
  p.revealed = true;
  state.roundFlips.push(p.color);

  if (state.roundFlips.length < 2) {
    state.current = 'p2';
    state.message = [{ k: 'assignPrompt', p: { round: state.round, n: 2 } }];
    return OK;
  }

  const [c1, c2] = state.roundFlips;
  if (c1 !== c2) return startPlayPhase(state, c1, c2, [{ k: 'assignDone', p: { c1, c2 } }]);

  state.roundFlips = [];
  state.round++;
  state.current = 'p1';
  if (!hasHidden(state.board)) {
    // Every round matched until nothing was left to flip: player 1 takes the last color flipped.
    const other = c1 === 'red' ? 'black' : 'red';
    return startPlayPhase(state, c1, other, [{ k: 'assignExhausted', p: { c1, c2: other } }]);
  }
  state.message = [{ k: 'sameColor' }, { k: 'assignPrompt', p: { round: state.round, n: 1 } }];
  return OK;
}

function startPlayPhase(state, c1, c2, prefixParts) {
  state.players.p1 = c1;
  state.players.p2 = c2;
  state.phase = 'play';
  state.current = 'p1';
  if (!hasLegalAction(state.board, c1)) {   // only possible once every piece is face-up
    gameOver(state, 'p2', [{ k: 'noAction', p: { player: 'p1' } }]);
    return OK;
  }
  state.message = [...prefixParts, { k: 'turnPrompt', p: { player: 'p1' } }];
  return OK;
}

function playFlip(state, i) {
  const p = state.board[i];
  if (!p || p.revealed) return fail('illegalMove');
  p.revealed = true;
  state.idleSteps = 0;
  endTurn(state, [{ k: 'flipped', p: { player: state.current, piece: p } }]);
  return OK;
}

function playMove(state, seat, from, to) {
  const m = state.board[from];
  if (state.phase !== 'play' || !m || !m.revealed || m.color !== state.players[seat] ||
      !legalTargets(state.board, from).includes(to)) return fail('illegalMove');
  const t = state.board[to];
  let actionParts;
  if (!t) {
    state.board[to] = m;
    state.board[from] = null;
    state.idleSteps++;
    actionParts = [{ k: 'moved', p: { piece: m } }];
  } else {
    state.idleSteps = 0;
    if (canCapture(m.rank, t.rank) === 'mutual') {
      state.captured[m.color].push(m);
      state.captured[t.color].push(t);
      state.board[from] = null;
      state.board[to] = null;
      actionParts = [{ k: 'mutual', p: { a: m, b: t } }];
    } else {
      state.captured[t.color].push(t);
      state.board[to] = m;
      state.board[from] = null;
      actionParts = [{ k: 'ate', p: { a: m, b: t } }];
    }
  }
  endTurn(state, actionParts);
  return OK;
}

function endTurn(state, actionParts) {
  const cur = state.current, opp = cur === 'p1' ? 'p2' : 'p1';
  const curColor = state.players[cur], oppColor = state.players[opp];
  const curAlive = aliveCount(state.board, curColor);
  const oppAlive = aliveCount(state.board, oppColor);

  if (curAlive === 0 && oppAlive === 0) return gameOver(state, null, [...actionParts, { k: 'bothDead' }]);
  if (oppAlive === 0) return gameOver(state, cur, [...actionParts, { k: 'eatenOut', p: { player: opp } }]);
  if (curAlive === 0) return gameOver(state, opp, [...actionParts, { k: 'eatenOut', p: { player: cur } }]);
  if (state.idleSteps >= IDLE_DRAW_LIMIT) {
    return gameOver(state, null, [...actionParts, { k: 'idleDraw', p: { limit: IDLE_DRAW_LIMIT } }]);
  }

  state.current = opp;
  if (!hasLegalAction(state.board, oppColor)) {
    return gameOver(state, cur, [...actionParts, { k: 'noAction', p: { player: opp } }]);
  }
  state.message = [...actionParts, { k: 'turnPrompt', p: { player: opp } }];
}

function gameOver(state, winner, reasonParts) {
  state.phase = 'over';
  state.winner = winner;
  state.overReason = reasonParts;
  state.message = [winner === null ? { k: 'draw' } : { k: 'win', p: { player: winner } }];
}

return Object.freeze({
  IDLE_DRAW_LIMIT, COLORS, canCapture, neighbors, legalTargets, hasHidden, hasLegalAction, aliveCount, newGame, apply,
});
})();
