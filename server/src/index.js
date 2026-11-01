// The Worker in front of the rooms.
//   POST /rooms               create a room; returns { room, token } (the creator's Player 1 token)
//   GET  /rooms/<code>/ws     WebSocket into that room
// Only pages on acgtun.com may use it: the Origin header is checked on both, so another site cannot
// open a room connection from a visitor's browser.
import { ROOM_CODE, newRoomCode } from './room-core.js';

export { Room } from './room.js';

const ORIGINS = new Set(['https://acgtun.com', 'https://www.acgtun.com']);
const DEV_ORIGIN = 'http://127.0.0.1:8000';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function reply(status, body, extra = {}) {
  const headers = { ...SECURITY_HEADERS, ...extra };
  if (body !== null) headers['Content-Type'] = typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json';
  return new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

// The local page server is allowed only when this Worker itself runs locally (wrangler dev).
function allowedOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (ORIGINS.has(origin)) return origin;
  if (origin === DEV_ORIGIN && LOCAL_HOSTS.has(url.hostname)) return origin;
  return null;
}

const cors = origin => ({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });

async function limited(limiter, request) {
  const { success } = await limiter.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  return !success;
}

async function createRoom(env, origin) {
  // A 10-character code has 50 bits; a clash is practically impossible, but cost nothing to retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newRoomCode();
    try {
      const { token } = await env.ROOMS.get(env.ROOMS.idFromName(code)).create();
      return reply(201, { room: code, token }, cors(origin));
    } catch (e) {
      console.error('create failed', code, e && e.message);
    }
  }
  return reply(503, 'Try again later', cors(origin));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/rooms') {
      const origin = allowedOrigin(request, url);
      if (!origin) return reply(403, 'Forbidden');
      if (request.method === 'OPTIONS') {
        return reply(204, null, { ...cors(origin), 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Max-Age': '86400' });
      }
      if (request.method !== 'POST') return reply(405, 'Method not allowed', { Allow: 'POST' });
      if (await limited(env.CREATE_LIMIT, request)) return reply(429, 'Too many rooms, try again in a minute', cors(origin));
      return createRoom(env, origin);
    }

    const match = /^\/rooms\/([^/]+)\/ws$/.exec(path);
    if (match) {
      if (request.headers.get('Upgrade') !== 'websocket') return reply(426, 'Expected a WebSocket', { Upgrade: 'websocket' });
      if (!allowedOrigin(request, url)) return reply(403, 'Forbidden');
      if (!ROOM_CODE.test(match[1])) return reply(404, 'No such room');
      if (await limited(env.CONNECT_LIMIT, request)) return reply(429, 'Too many connections');
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
    }

    if (path === '/') return reply(200, 'Dark Jungle Chess rooms: https://acgtun.com/dark-jungle-chess/');
    return reply(404, 'Not found');
  },
};
