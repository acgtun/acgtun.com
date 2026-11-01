// Online room tests: protocol, seats, and that no message ever reveals a face-down piece.
// No dependencies: node tests/room.test.js
'use strict';
const assert = require('assert');
const path = require('path');

const SEED = Number(process.env.SEED) || Date.now() % 1e9;
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(SEED);
const pick = arr => arr[Math.floor(rand() * arr.length)];

// A stand-in for the Durable Object: clock, storage, alarm and sockets the test controls.
function makeRoom(core) {
  const sockets = new Set();
  let stored = null;
  const host = {
    clock: 1_700_000_000_000,
    alarm: null,
    sockets: () => [...sockets].filter(ws => ws.isOpen),
    saveMeta() {},
    load: async () => (stored ? structuredClone(stored) : null),
    save: async room => { stored = structuredClone(room); },
    deleteAll: async () => { stored = null; },
    setAlarm: async t => { host.alarm = t; },
    now: () => host.clock,
    random: seeded(SEED + 1),
    stored: () => stored,
  };
  const room = { host, core: new core.RoomCore(host) };
  room.connect = async () => {
    const ws = {
      meta: null, isOpen: true, inbox: [], closed: null, pingAt: null,
      send(text) { if (!this.isOpen) throw new Error('closed'); this.inbox.push(JSON.parse(text)); },
      close(code, reason) { if (this.isOpen) { this.isOpen = false; this.closed = { code, reason }; } },
      lastPing() { return this.pingAt; },
      take() { const out = this.inbox; this.inbox = []; return out; },
      lastState() { return [...this.inbox].reverse().find(m => m.t === 'state'); },
    };
    sockets.add(ws);
    await room.core.open(ws);
    return ws;
  };
  room.say = (ws, msg) => room.core.message(ws, typeof msg === 'string' ? msg : JSON.stringify(msg));
  room.hangUp = async ws => { ws.isOpen = false; await room.core.close(ws); };
  room.join = async token => {
    const ws = await room.connect();
    await room.say(ws, { t: 'hello', v: 1, token });
    return ws;
  };
  room.start = async () => {
    const { token } = await room.core.create();
    const p1 = await room.join(token);
    const p2 = await room.join(null);
    const p2token = p2.inbox.find(m => m.t === 'welcome').token;
    return { p1, p2, p1token: token, p2token };
  };
  return room;
}

// Each piece (rank + color) exists exactly once, so any rank/color pair in a message names one real piece.
function assertNoLeak(room, messages) {
  const game = room.core.room.game;
  const hidden = new Set(game.board.filter(p => p && !p.revealed).map(p => `${p.rank}${p.color}`));
  const walk = (x, where) => {
    if (!x || typeof x !== 'object') return;
    if ('rank' in x || 'color' in x) {
      assert.ok(!hidden.has(`${x.rank}${x.color}`), `leaked a face-down piece at ${where}: ${JSON.stringify(x)}`);
      assert.ok(!('revealed' in x), `${where}: internal field sent`);
    }
    for (const [k, v] of Object.entries(x)) walk(v, `${where}.${k}`);
  };
  for (const m of messages) {
    walk(m, m.t);
    if (m.t === 'state') {
      m.view.board.forEach((cell, i) => {
        const real = game.board[i];
        if (real && !real.revealed) assert.deepStrictEqual(cell, { hidden: true }, `cell ${i}`);
      });
    }
  }
}

// The moves a client can work out from its own view, the way the real page will.
function legalFromView(state, E) {
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

const errs = ws => ws.inbox.filter(m => m.t === 'err').map(m => m.k);

(async () => {
  const core = await import(path.join(__dirname, '..', 'server', 'src', 'room-core.js'));
  const E = globalThis.DJCEngine;
  const { CLOSE, LIMITS } = core;

  const tests = {
    async 'room codes and tokens are random and well-formed'() {
      const codes = new Set(Array.from({ length: 500 }, core.newRoomCode));
      assert.strictEqual(codes.size, 500);
      for (const c of codes) assert.ok(core.ROOM_CODE.test(c), c);
      const room = makeRoom(core);
      const { p1token, p2token } = await room.start();
      assert.ok(/^[A-Za-z0-9_-]{22}$/.test(p1token) && /^[A-Za-z0-9_-]{22}$/.test(p2token));
      assert.notStrictEqual(p1token, p2token);
      const saved = JSON.stringify(room.host.stored());
      assert.ok(!saved.includes(p1token) && !saved.includes(p2token), 'tokens must be stored hashed');
    },

    async 'creator is Player 1, the first to join is Player 2, a third is turned away'() {
      const room = makeRoom(core);
      const { p1, p2 } = await room.start();
      assert.strictEqual(p1.lastState().you, 'p1');
      assert.strictEqual(p2.lastState().you, 'p2');
      assert.deepStrictEqual(p1.lastState().online, { p1: true, p2: true });
      const third = await room.join(null);
      assert.deepStrictEqual(errs(third), ['roomFull']);
      assert.strictEqual(third.closed.code, CLOSE.roomFull);
      await assert.rejects(room.core.create(), /room exists/);
    },

    async 'random games: no message ever reveals a face-down piece, and both players see the same game'() {
      const GAMES = 400;
      let moves = 0, finished = 0;
      for (let g = 0; g < GAMES; g++) {
        const room = makeRoom(core);
        const { p1, p2 } = await room.start();
        const state = { p1: null, p2: null };
        // Check every message against the game as it is right after the event that produced it.
        const collect = () => {
          for (const ws of [p1, p2]) {
            const msgs = ws.take();
            assertNoLeak(room, msgs);
            for (const m of msgs) if (m.t === 'state') state[m.you] = m;
          }
          if (state.p1 && state.p2 && state.p1.n === state.p2.n) {
            assert.deepStrictEqual(state.p1.view, state.p2.view, 'players disagree about the game');
          }
        };
        const say = async (ws, msg) => { await room.say(ws, msg); collect(); };
        collect();
        for (let step = 0; step < 600; step++) {
          room.host.clock += 150 + Math.floor(rand() * 2000);   // stay under the rate limit
          const game = room.core.room.game;
          if (game.phase === 'over') {
            finished++;
            if (rand() < 0.3) { await say(p1, { t: 'rematch' }); await say(p2, { t: 'rematch' }); continue; }
            break;
          }
          const seat = game.current;
          const ws = [p1, p2].find(c => c.meta.seat === seat);
          const mine = state[seat];
          const roll = rand();
          if (roll < 0.04) await say(ws, pick(['{', '[]', '{"t":"act"}', '{"t":"act","n":-1,"a":{}}', '{"t":"hello","v":1,"token":null}']));
          else if (roll < 0.06) await say([p1, p2].find(c => c !== ws), { t: 'act', n: mine.n, a: { flip: 3 } });
          else if (roll < 0.065) await say(ws, { t: 'resign' });
          else if (roll < 0.07) await say(ws, { t: 'act', n: mine.n + 1, a: { flip: 1 } });
          else {
            await say(ws, { t: 'act', n: mine.n, a: pick(legalFromView(mine, E)) });
            moves++;
          }
        }
      }
      assert.ok(moves > GAMES * 10 && finished > GAMES / 2, `too little play: ${moves} moves, ${finished} finished`);
    },

    async 'out-of-turn, stale and malformed messages are rejected and change nothing'() {
      const room = makeRoom(core);
      const { p1, p2 } = await room.start();
      const before = JSON.stringify(room.core.room);
      p1.take(); p2.take();
      await room.say(p2, { t: 'act', n: 0, a: { flip: 0 } });
      assert.deepStrictEqual(errs(p2), ['notYourTurn']);
      await room.say(p1, { t: 'act', n: 7, a: { flip: 0 } });
      assert.deepStrictEqual(errs(p1), ['stale']);
      assert.strictEqual(p1.lastState().n, 0, 'a stale act must resend the current state');
      for (const bad of ['nope', '{"t":"act","n":0,"a":{"flip":0},"x":1}', '{"t":"wave"}', '{"t":"hello","v":1,"token":null}']) {
        p1.take();
        await room.say(p1, bad);
        assert.deepStrictEqual(errs(p1), ['badMessage'], bad);
      }
      await room.say(p1, { t: 'act', n: 0, a: { move: [0, 1] } });
      assert.ok(['illegalMove', 'badAction'].includes(errs(p1).pop()));
      await room.say(p1, { t: 'rematch' });
      assert.strictEqual(errs(p1).pop(), 'notOver');
      assert.strictEqual(JSON.stringify(room.core.room).replace(/"seen":\{[^}]*\}/, ''), before.replace(/"seen":\{[^}]*\}/, ''));
    },

    async 'nothing can be played until Player 2 has joined'() {
      const room = makeRoom(core);
      const { token } = await room.core.create();
      const p1 = await room.join(token);
      await room.say(p1, { t: 'act', n: 0, a: { flip: 0 } });
      assert.deepStrictEqual(errs(p1), ['waiting']);
      assert.deepStrictEqual(p1.lastState().seated, { p1: true, p2: false });
    },

    async 'connections must say hello first, stay small and not flood'() {
      const room = makeRoom(core);
      await room.start();
      const a = await room.connect();
      await room.say(a, { t: 'resign' });
      assert.strictEqual(a.closed.code, CLOSE.policy);
      const b = await room.connect();
      await room.say(b, 'x'.repeat(LIMITS.messageBytes + 1));
      assert.strictEqual(b.closed.code, CLOSE.tooBig);
      const room2 = makeRoom(core);
      const { p1 } = await room2.start();
      for (let i = 0; i <= LIMITS.messagesPerSecond; i++) await room2.say(p1, { t: 'rematch' });
      assert.strictEqual(p1.closed.code, CLOSE.policy);
      const silent = await room.connect();
      room.host.clock += LIMITS.helloMs + 1;
      await room.connect();
      assert.strictEqual(silent.closed.code, CLOSE.policy, 'a silent connection is dropped');
      const room3 = makeRoom(core);
      await room3.start();
      const extra = [];
      for (let i = 0; i < LIMITS.sockets; i++) extra.push(await room3.connect());
      assert.strictEqual(extra.pop().closed.code, CLOSE.busy);
    },

    async 'reconnecting with the token returns the seat and drops the old connection'() {
      const room = makeRoom(core);
      const { p1, p1token } = await room.start();
      const again = await room.join(p1token);
      assert.strictEqual(p1.closed.code, CLOSE.replaced);
      assert.strictEqual(again.lastState().you, 'p1');
      const wrong = await room.join('A'.repeat(22));
      assert.deepStrictEqual(errs(wrong), ['badToken']);
      assert.strictEqual(wrong.closed.code, CLOSE.policy);
    },

    async 'the room survives hibernation: a fresh RoomCore picks up from storage'() {
      const room = makeRoom(core);
      const { p1, p2 } = await room.start();
      await room.say(p1, { t: 'act', n: 0, a: { flip: 5 } });
      room.core = new core.RoomCore(room.host);
      await room.say(p2, { t: 'act', n: 1, a: { flip: 6 } });
      assert.strictEqual(p2.lastState().n, 2);
      assert.ok(p2.lastState().view.board[5] && !p2.lastState().view.board[5].hidden);
    },

    async 'resigning ends the game for the other player'() {
      const room = makeRoom(core);
      const { p1, p2 } = await room.start();
      await room.say(p2, { t: 'resign' });
      const v = p1.lastState().view;
      assert.strictEqual(v.phase, 'over');
      assert.strictEqual(v.winner, 'p1');
      assert.deepStrictEqual(v.overReason, [{ k: 'resigned', p: { player: 'p2' } }]);
    },

    async 'a win can be claimed only after the opponent is gone 5 minutes on their turn'() {
      const room = makeRoom(core);
      const { p1, p2 } = await room.start();
      await room.say(p1, { t: 'act', n: 0, a: { flip: 0 } });   // now p2's turn
      await room.hangUp(p2);
      assert.deepStrictEqual(p1.lastState().online, { p1: true, p2: false });
      await room.say(p1, { t: 'claim' });
      assert.strictEqual(errs(p1).pop(), 'cannotClaim');
      room.host.clock += LIMITS.claimMs;
      p1.pingAt = room.host.clock;
      await room.say(p1, { t: 'claim' });
      const v = p1.lastState().view;
      assert.strictEqual(v.winner, 'p1');
      assert.deepStrictEqual(v.overReason, [{ k: 'abandoned', p: { player: 'p2' } }]);

      // A phone that drops off the network often leaves its socket open; no pings means offline.
      const room2 = makeRoom(core);
      const s = await room2.start();
      await room2.say(s.p1, { t: 'act', n: 0, a: { flip: 0 } });
      room2.host.clock += LIMITS.claimMs + 1;
      s.p1.pingAt = room2.host.clock;
      await room2.say(s.p1, { t: 'claim' });
      assert.strictEqual(s.p1.lastState().view.winner, 'p1');

      // You cannot claim while it is your own turn.
      const room3 = makeRoom(core);
      const t = await room3.start();
      await room3.hangUp(t.p2);
      room3.host.clock += LIMITS.claimMs + 1;
      await room3.say(t.p1, { t: 'claim' });
      assert.strictEqual(errs(t.p1).pop(), 'cannotClaim');
    },

    async 'rematch needs both players and swaps who goes first'() {
      const room = makeRoom(core);
      const { p1, p2, p1token } = await room.start();
      await room.say(p2, { t: 'resign' });
      await room.say(p1, { t: 'rematch' });
      assert.deepStrictEqual(p2.lastState().rematch, { p1: true, p2: false });
      assert.strictEqual(p2.lastState().view.phase, 'over');
      await room.say(p2, { t: 'rematch' });
      assert.strictEqual(p1.lastState().you, 'p2');
      assert.strictEqual(p2.lastState().you, 'p1');
      assert.strictEqual(p1.lastState().view.phase, 'assign');
      assert.ok(p1.lastState().view.board.every(c => c && c.hidden));
      const back = await room.join(p1token);
      assert.strictEqual(back.lastState().you, 'p2', 'the old Player 1 token now holds seat p2');
    },

    async 'a room idle for 24 hours is deleted; activity pushes the expiry back'() {
      const room = makeRoom(core);
      const { p1 } = await room.start();
      const first = room.host.alarm;
      assert.strictEqual(first, room.host.clock + LIMITS.expireMs);
      room.host.clock += 60_000;
      await room.say(p1, { t: 'act', n: 0, a: { flip: 0 } });
      assert.ok(room.host.alarm > first);
      room.host.clock = first;
      await room.core.alarm();
      assert.ok(room.host.stored(), 'woke early: must re-arm, not delete');
      room.host.clock = room.host.alarm;
      await room.core.alarm();
      assert.strictEqual(room.host.stored(), null);
      assert.strictEqual(p1.closed.code, CLOSE.expired);
      const late = await room.connect();
      assert.strictEqual(late.closed.code, CLOSE.noRoom);
    },
  };

  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try { await fn(); console.log(`ok   ${name}`); }
    catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 3).join('\n     ')}`); }
  }
  console.log(failed ? `\n${failed} failed (replay with SEED=${SEED})` : `\nall passed (SEED=${SEED})`);
  process.exit(failed ? 1 : 0);
})();
