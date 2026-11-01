// End-to-end check against a running server: `npm run dev` in one terminal, then `npm run smoke`.
// Against the deployed Worker: node smoke.js https://djc.<subdomain>.workers.dev
// Plays a full game between two connections and checks the rules the server must enforce.
import assert from 'node:assert/strict';
import '../docs/dark-jungle-chess/engine.js';

const E = globalThis.DJCEngine;
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE + '/');
const ORIGIN = LOCAL ? 'http://127.0.0.1:8000' : 'https://acgtun.com';
const WS_BASE = BASE.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function post(origin) {
  return fetch(`${BASE}/rooms`, { method: 'POST', headers: origin ? { Origin: origin } : {} });
}

// A connection that records everything it receives and lets the test wait for a matching message.
function connect(code, origin = ORIGIN) {
  const ws = new WebSocket(`${WS_BASE}/rooms/${code}/ws`, { headers: { Origin: origin } });
  const c = { ws, inbox: [], closed: null, waiters: [], lastSent: 0 };
  const check = () => {
    c.waiters = c.waiters.filter(w => {
      const i = c.inbox.findIndex((m, j) => j >= w.from && w.test(m));
      if (i >= 0) { w.resolve(c.inbox[i]); return false; }
      if (c.closed) { w.reject(new Error(`closed ${c.closed.code} ${c.closed.reason} while waiting`)); return false; }
      return true;
    });
  };
  ws.onmessage = e => { c.inbox.push(e.data === 'pong' ? { t: 'pong' } : JSON.parse(e.data)); check(); };
  ws.onclose = e => { c.closed = { code: e.code, reason: e.reason }; check(); };
  c.opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('connect failed')); });
  c.wait = (test, from = 0, ms = 5000) => new Promise((resolve, reject) => {
    c.waiters.push({ test, from, resolve, reject });
    setTimeout(() => reject(new Error('timed out waiting')), ms);
    check();
  });
  c.waitClose = async () => { while (!c.closed) await sleep(20); return c.closed; };
  // Stay under the server's 10 messages per second per connection.
  c.send = async msg => {
    const gap = 120 - (Date.now() - c.lastSent);
    if (gap > 0) await sleep(gap);
    c.lastSent = Date.now();
    const from = c.inbox.length;
    ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    return from;
  };
  c.state = () => [...c.inbox].reverse().find(m => m.t === 'state');
  return c;
}

async function hello(code, token) {
  const c = connect(code);
  await c.opened;
  await c.send({ t: 'hello', v: 1, token });
  await c.wait(m => m.t === 'state');
  return c;
}

function legalFromView(state) {
  const v = state.view;
  if (v.phase === 'over' || v.current !== state.you) return [];
  const board = v.board.map(c => (!c ? null : c.hidden ? { rank: 0, color: '?', revealed: false } : { ...c, revealed: true }));
  const out = [];
  board.forEach((p, i) => {
    if (p && !p.revealed) out.push({ flip: i });
    if (v.phase === 'play' && p && p.revealed && p.color === v.players[state.you]) {
      for (const t of E.legalTargets(board, i)) out.push({ move: [i, t] });
    }
  });
  return out;
}

function checkView(state) {
  const v = state.view;
  for (const cell of v.board) if (cell && cell.hidden) assert.deepEqual(cell, { hidden: true }, 'a face-down cell carries only { hidden: true }');
  const pieces = v.board.filter(Boolean).length + v.captured.red.length + v.captured.black.length;
  assert.equal(pieces, 16, 'board plus captured is always 16 pieces');
}

const tests = {
  async 'only acgtun.com pages can create rooms or connect'() {
    assert.equal((await post(null)).status, 403);
    assert.equal((await post('https://evil.example')).status, 403);
    const res = await post(ORIGIN);
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const { room } = await res.json();
    const evil = connect(room, 'https://evil.example');
    await assert.rejects(evil.opened);
    assert.equal((await fetch(`${BASE}/rooms/${room}/ws`)).status, 426);
    assert.equal((await fetch(`${BASE}/rooms`, { headers: { Origin: ORIGIN } })).status, 405);
  },

  async 'unknown and malformed room codes are refused'() {
    const bad = connect('nope');
    await assert.rejects(bad.opened);
    const missing = connect('0000000000');
    await missing.opened;
    assert.equal((await missing.waitClose()).code, 4004);
  },

  async 'two players play a whole game; a third is turned away'() {
    const { room, token } = await (await post(ORIGIN)).json();
    const p1 = await hello(room, token);
    const p2 = await hello(room, null);
    const welcome = p2.inbox.find(m => m.t === 'welcome');
    assert.equal(welcome.seat, 'p2');
    await p1.wait(m => m.t === 'state' && m.seated.p2);
    const third = await connect(room);
    await third.opened;
    await third.send({ t: 'hello', v: 1, token: null });
    assert.equal((await third.waitClose()).code, 4003);

    let moves = 0;
    for (;;) {
      const s1 = p1.state(), s2 = p2.state();
      assert.equal(s1.n, s2.n);
      assert.deepEqual(s1.view, s2.view, 'both players see the same game');
      checkView(s1);
      if (s1.view.phase === 'over') break;
      const mover = s1.view.current === 'p1' ? p1 : p2;
      const actions = legalFromView(mover.state());
      assert.ok(actions.length > 0, 'the player to move has a legal action');
      const a = actions[Math.floor(Math.random() * actions.length)];
      const n = mover.state().n;
      const from = [p1.inbox.length, p2.inbox.length];
      await mover.send({ t: 'act', n, a });
      await p1.wait(m => m.t === 'state' && m.n === n + 1, from[0]);
      await p2.wait(m => m.t === 'state' && m.n === n + 1, from[1]);
      if ('flip' in a) assert.ok(!p1.state().view.board[a.flip].hidden, 'a flipped piece is shown');
      moves++;
      assert.ok(moves < 500, 'the game ends');
    }
    console.log(`     ${moves} actions, ${p1.state().view.message.map(m => m.k).join(', ')}`);

    const stale = await p1.send({ t: 'act', n: 0, a: { flip: 0 } });
    assert.equal((await p1.wait(m => m.t === 'err', stale)).k, 'stale');
    const pong = await p1.send('ping');
    await p1.wait(m => m.t === 'pong', pong);

    const before = { p1: p1.state().view.players, n: p1.state().n };
    const r1 = await p1.send({ t: 'rematch' });
    await p1.wait(m => m.t === 'state' && m.rematch.p1, r1);
    const r2 = [p1.inbox.length, await p2.send({ t: 'rematch' })];
    const next1 = await p1.wait(m => m.t === 'state' && m.view.phase === 'assign', r2[0]);
    const next2 = await p2.wait(m => m.t === 'state' && m.view.phase === 'assign', r2[1]);
    assert.equal(next1.you, 'p2', 'rematch swaps seats');
    assert.equal(next2.you, 'p1');
    assert.ok(next1.n > before.n);

    const back = [p2.inbox.length, await p1.send({ t: 'resign' })];
    const over = await p2.wait(m => m.t === 'state' && m.view.phase === 'over', back[0]);
    assert.equal(over.view.winner, 'p1', 'the other player wins when one resigns');
    for (const c of [p1, p2]) c.ws.close();
  },

  async 'reconnecting with the token returns the seat and drops the old connection'() {
    const { room, token } = await (await post(ORIGIN)).json();
    const first = await hello(room, token);
    const again = await hello(room, token);
    assert.equal(again.state().you, 'p1');
    assert.equal((await first.waitClose()).code, 4001);
    const forged = connect(room);
    await forged.opened;
    await forged.send({ t: 'hello', v: 1, token: 'x'.repeat(22) });
    assert.equal((await forged.waitClose()).code, 1008);
    again.ws.close();
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack}`); }
}
console.log(failed ? `\n${failed} failed (${BASE})` : `\nall passed (${BASE})`);
process.exit(failed ? 1 : 0);
