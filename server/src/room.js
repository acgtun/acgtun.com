// The Durable Object for one room: adapts RoomCore to Cloudflare's hibernatable WebSockets, storage and alarms.
// One instance per room code (idFromName). It may be evicted between messages, so all state lives in
// storage ('room') and in each socket's attachment (its seat), never only in memory.
import { DurableObject } from 'cloudflare:workers';
import { RoomCore, cryptoRandom } from './room-core.js';

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Answered by the runtime without waking the object; the time of the last ping tells who is online.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.conns = new WeakMap();
    const storage = ctx.storage;
    this.core = new RoomCore({
      sockets: () => ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN).map(ws => this.conn(ws)),
      saveMeta: conn => conn.ws.serializeAttachment(conn.meta),
      load: () => storage.get('room'),
      save: room => storage.put('room', room),
      deleteAll: async () => { await storage.deleteAlarm(); await storage.deleteAll(); },
      setAlarm: ms => storage.setAlarm(ms),
      now: () => Date.now(),
      random: cryptoRandom,
    });
  }

  // RoomCore compares connections by identity, so each socket gets exactly one wrapper.
  conn(ws) {
    let conn = this.conns.get(ws);
    if (!conn) {
      const ctx = this.ctx;
      conn = {
        ws,
        meta: ws.deserializeAttachment(),
        send: text => ws.send(text),
        close: (code, reason) => { try { ws.close(code, reason); } catch (e) { /* already closed */ } },
        lastPing: () => { const at = ctx.getWebSocketAutoResponseTimestamp(ws); return at ? at.getTime() : null; },
      };
      this.conns.set(ws, conn);
    }
    return conn;
  }

  // Called by the Worker over RPC. Throws if the code is already taken.
  create() {
    return this.core.create();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response(null, { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    await this.core.open(this.conn(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    return this.core.message(this.conn(ws), message);
  }

  webSocketClose(ws) {
    return this.core.close(this.conn(ws));
  }

  webSocketError(ws) {
    return this.core.close(this.conn(ws));
  }

  alarm() {
    return this.core.alarm();
  }
}
