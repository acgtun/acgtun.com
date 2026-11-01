// One online game room: seats, the WebSocket protocol, and the per-player view.
// No Cloudflare APIs here; room.js adapts this to a Durable Object, and tests/room.test.js drives it with fakes.
//
// The server owns the board. Every message a player receives goes through viewFor(), which sends face-down
// pieces as { hidden: true } with no rank or color.
import '../../docs/dark-jungle-chess/engine.js';

const E = globalThis.DJCEngine;

export const LIMITS = Object.freeze({
  messageBytes: 1024,
  messagesPerSecond: 10,
  helloMs: 10_000,              // a new connection must say hello within this
  offlineMs: 60_000,            // a seat with no ping or message for this long counts as offline
  claimMs: 5 * 60_000,          // the waiting player may claim the win after the opponent is offline this long
  expireMs: 24 * 60 * 60_000,   // the room is deleted this long after the last change
  sockets: 6,                   // per room, including connections that have not said hello yet
});

export const CLOSE = Object.freeze({
  policy: 1008, tooBig: 1009, busy: 1013,
  expired: 4000, replaced: 4001, roomFull: 4003, noRoom: 4004,
});

const SEATS = ['p1', 'p2'];
const other = seat => (seat === 'p1' ? 'p2' : 'p1');

// Crockford base32 without I, L, O, U: easy to read aloud and to type.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ROOM_CODE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => CODE_ALPHABET[b & 31]).join('');
}

const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const newToken = () => base64url(crypto.getRandomValues(new Uint8Array(16)));

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

const pieceView = p => ({ rank: p.rank, color: p.color });

// What one player may see. Face-down pieces carry nothing but the fact that they are face-down.
export function viewFor(game) {
  const strip = parts => parts.map(x => (x.p ? { k: x.k, p: stripParams(x.p) } : { k: x.k }));
  const stripParams = p => Object.fromEntries(Object.entries(p).map(([k, v]) =>
    [k, v && typeof v === 'object' ? pieceView(v) : v]));
  return {
    phase: game.phase,
    current: game.current,
    players: { ...game.players },
    round: game.round,
    idleSteps: game.idleSteps,
    winner: game.winner === undefined ? null : game.winner,
    board: game.board.map(p => (!p ? null : p.revealed ? pieceView(p) : { hidden: true })),
    captured: { red: game.captured.red.map(pieceView), black: game.captured.black.map(pieceView) },
    message: strip(game.message),
    overReason: strip(game.overReason),
  };
}

function parse(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const keys = Object.keys(m).sort().join();
  switch (m.t) {
    case 'hello':
      return keys === 't,token,v' && m.v === 1 && (m.token === null || (typeof m.token === 'string' && m.token.length <= 64)) ? m : null;
    case 'act':
      return keys === 'a,n,t' && Number.isInteger(m.n) && m.n >= 0 ? m : null;
    case 'resign': case 'claim': case 'rematch':
      return keys === 't' ? m : null;
    default:
      return null;
  }
}

/*
 * host is what the platform provides:
 *   sockets()         live connections: { meta, send(text), close(code, reason), lastPing() -> ms | null }
 *   saveMeta(ws)      persist ws.meta across hibernation
 *   load() / save(room) / deleteAll()
 *   setAlarm(ms)      wake onAlarm() at this time
 *   now()             ms
 *   random()          [0, 1) for dealing; cryptoRandom in production
 */
export class RoomCore {
  constructor(host) {
    this.host = host;
    this.room = undefined;          // undefined: not loaded yet; null: no room here
    this.rates = new WeakMap();     // ws -> { second, count }; in memory only, a hibernated room is idle anyway
    this.queue = Promise.resolve();
  }

  // Every event runs to completion before the next starts, even across awaits.
  serial(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async loaded() {
    if (this.room === undefined) this.room = (await this.host.load()) || null;
    return this.room;
  }

  // POST /rooms: deal a new game and hand the creator the Player 1 token.
  create() {
    return this.serial(async () => {
      if (await this.loaded()) throw new Error('room exists');
      const now = this.host.now(), token = newToken();
      this.room = {
        v: 1, n: 0, created: now, updated: now,
        game: E.newGame(this.host.random),
        last: null,
        tokens: { p1: await sha256(token), p2: null },
        seen: { p1: now, p2: null },
        rematch: { p1: false, p2: false },
      };
      await this.persist();
      return { token };
    });
  }

  open(ws) {
    return this.serial(async () => {
      if (!(await this.loaded())) return ws.close(CLOSE.noRoom, 'noRoom');
      this.sweep();
      if (this.host.sockets().length > LIMITS.sockets) return ws.close(CLOSE.busy, 'busy');
      ws.meta = { seat: null, opened: this.host.now() };
      this.host.saveMeta(ws);
    });
  }

  message(ws, text) {
    return this.serial(async () => {
      if (!(await this.loaded())) return ws.close(CLOSE.noRoom, 'noRoom');
      if (typeof text !== 'string') return ws.close(CLOSE.policy, 'binary');
      if (text.length > LIMITS.messageBytes) return ws.close(CLOSE.tooBig, 'tooBig');
      if (!this.withinRate(ws)) return ws.close(CLOSE.policy, 'rate');
      const m = parse(text);
      const seat = ws.meta && ws.meta.seat;
      if (!seat) {
        if (!m || m.t !== 'hello') return ws.close(CLOSE.policy, 'hello');
        return this.hello(ws, m.token);
      }
      if (!m || m.t === 'hello') return this.send(ws, { t: 'err', k: 'badMessage' });
      this.room.seen[seat] = this.host.now();
      if (m.t === 'act') return this.act(ws, seat, m);
      if (m.t === 'resign') return this.resign(ws, seat);
      if (m.t === 'claim') return this.claim(ws, seat);
      return this.rematch(ws, seat);
    });
  }

  close(ws) {
    return this.serial(async () => {
      if (!(await this.loaded())) return;
      const seat = ws.meta && ws.meta.seat;
      if (!seat) return;
      this.room.seen[seat] = this.host.now();
      await this.host.save(this.room);
      this.broadcast(ws);
    });
  }

  alarm() {
    return this.serial(async () => {
      if (!(await this.loaded())) return;
      const due = this.room.updated + LIMITS.expireMs;
      if (this.host.now() < due) return this.host.setAlarm(due);
      for (const ws of this.host.sockets()) ws.close(CLOSE.expired, 'expired');
      await this.host.deleteAll();
      this.room = null;
    });
  }

  async hello(ws, token) {
    const room = this.room;
    let seat = null;
    if (token !== null) {
      const hash = await sha256(token);
      seat = SEATS.find(s => room.tokens[s] === hash) || null;
      if (!seat) {
        this.send(ws, { t: 'err', k: 'badToken' });
        return ws.close(CLOSE.policy, 'badToken');
      }
    } else if (!room.tokens.p2) {
      seat = 'p2';
      token = newToken();
      room.tokens.p2 = await sha256(token);
      this.send(ws, { t: 'welcome', seat, token });
    } else {
      this.send(ws, { t: 'err', k: 'roomFull' });
      return ws.close(CLOSE.roomFull, 'roomFull');
    }
    for (const old of this.host.sockets()) {
      if (old !== ws && old.meta && old.meta.seat === seat) old.close(CLOSE.replaced, 'replaced');
    }
    ws.meta = { seat, opened: ws.meta.opened };
    this.host.saveMeta(ws);
    room.seen[seat] = this.host.now();
    await this.host.save(room);
    this.broadcast();
  }

  async act(ws, seat, m) {
    const room = this.room;
    if (m.n !== room.n) {
      this.send(ws, { t: 'err', k: 'stale' });
      return this.sendState(ws);
    }
    if (!room.tokens.p2) return this.send(ws, { t: 'err', k: 'waiting' });
    const res = E.apply(room.game, seat, m.a);
    if (!res.ok) return this.send(ws, { t: 'err', k: res.err });
    room.last = 'flip' in m.a ? { flip: m.a.flip } : { move: [...m.a.move] };
    await this.commit();
  }

  async resign(ws, seat) {
    const game = this.room.game;
    if (game.phase === 'over') return this.send(ws, { t: 'err', k: 'gameOver' });
    this.finish(other(seat), [{ k: 'resigned', p: { player: seat } }]);
    await this.commit();
  }

  async claim(ws, seat) {
    const room = this.room, opp = other(seat);
    const ok = room.game.phase !== 'over' && room.tokens[opp] && room.game.current === opp &&
      !this.online(opp) && this.host.now() - this.lastActive(opp) >= LIMITS.claimMs;
    if (!ok) return this.send(ws, { t: 'err', k: 'cannotClaim' });
    this.finish(seat, [{ k: 'abandoned', p: { player: opp } }]);
    await this.commit();
  }

  async rematch(ws, seat) {
    const room = this.room;
    if (room.game.phase !== 'over') return this.send(ws, { t: 'err', k: 'notOver' });
    room.rematch[seat] = true;
    if (room.rematch.p1 && room.rematch.p2) {
      // Swap seats so the other player flips first this time.
      room.tokens = { p1: room.tokens.p2, p2: room.tokens.p1 };
      room.seen = { p1: room.seen.p2, p2: room.seen.p1 };
      for (const s of this.host.sockets()) {
        if (s.meta && s.meta.seat) { s.meta = { ...s.meta, seat: other(s.meta.seat) }; this.host.saveMeta(s); }
      }
      room.game = E.newGame(this.host.random);
      room.last = null;
      room.rematch = { p1: false, p2: false };
    }
    await this.commit();
  }

  finish(winner, reason) {
    const game = this.room.game;
    game.phase = 'over';
    game.winner = winner;
    game.overReason = reason;
    game.message = [{ k: 'win', p: { player: winner } }];
  }

  // A change to the game: bump the version every client must quote back, save, and tell both players.
  async commit() {
    this.room.n++;
    await this.persist();
    this.broadcast();
  }

  async persist() {
    const room = this.room;
    room.updated = this.host.now();
    await this.host.save(room);
    await this.host.setAlarm(room.updated + LIMITS.expireMs);
  }

  lastActive(seat) {
    let t = this.room.seen[seat] || 0;
    for (const ws of this.seated(seat)) t = Math.max(t, ws.lastPing() || 0, ws.meta.opened);
    return t;
  }

  online(seat) {
    return this.seated(seat).length > 0 && this.host.now() - this.lastActive(seat) < LIMITS.offlineMs;
  }

  seated(seat) {
    return this.host.sockets().filter(ws => ws.meta && ws.meta.seat === seat);
  }

  withinRate(ws) {
    const second = Math.floor(this.host.now() / 1000);
    const r = this.rates.get(ws);
    if (!r || r.second !== second) { this.rates.set(ws, { second, count: 1 }); return true; }
    return ++r.count <= LIMITS.messagesPerSecond;
  }

  // Connections that never said hello in time are dropped whenever the room wakes up.
  sweep() {
    const now = this.host.now();
    for (const ws of this.host.sockets()) {
      if (ws.meta && !ws.meta.seat && now - ws.meta.opened > LIMITS.helloMs) ws.close(CLOSE.policy, 'hello');
    }
  }

  stateFor(seat) {
    const room = this.room;
    return {
      t: 'state', n: room.n, you: seat,
      seated: { p1: !!room.tokens.p1, p2: !!room.tokens.p2 },
      online: { p1: this.online('p1'), p2: this.online('p2') },
      rematch: { ...room.rematch },
      last: room.last,
      view: viewFor(room.game),
    };
  }

  sendState(ws) { this.send(ws, this.stateFor(ws.meta.seat)); }

  broadcast(except) {
    for (const ws of this.host.sockets()) {
      if (ws !== except && ws.meta && ws.meta.seat) this.sendState(ws);
    }
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* the socket is already closing */ }
  }
}
