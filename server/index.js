// HTTP static server + WebSocket gateway for Harbor Compact.
//
// Protocol (JSON over /ws):
//   client → server
//     { t: 'hello', token?, name? }        resume a character or create one
//     { t: 'act', id, a: <action>, args }  perform a game action
//   server → client
//     { t: 'welcome', token, playerId, history }
//     { t: 'state', view }                 per-player filtered snapshot
//     { t: 'chat', msg }
//     { t: 'notify', text, kind }
//     { t: 'result', id, ok, message?, error?, ...extra }

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game, GameError } from './game.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, '..', 'public');
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PORT = Number(process.env.PORT ?? 3000);
const FAST = process.env.FAST === '1'; // shorter timers for playtesting

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}
function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, game.serialize());
  fs.renameSync(tmp, STATE_FILE);
}

const config = FAST ? { npcFillMs: 10000, eventLeadMs: 30000, eventLiveMs: 30000, trialMs: 20000, cooldownScale: 0.3 } : {};
const game = new Game({ state: loadState(), config });
for (const p of Object.values(game.state.players)) p.online = false;

// ------------------------------------------------------------------- static

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  if (url.pathname === '/admin/season' && req.method === 'POST') {
    if (!process.env.ADMIN_TOKEN || req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`) { res.writeHead(403); res.end(); return; }
    game.endSeason();
    game.changed();
    res.writeHead(200); res.end('season advanced');
    return;
  }
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '') || 'index.html';
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
});

// ---------------------------------------------------------------- websocket

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
const clients = new Map(); // ws → playerId

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

wss.on('connection', (ws) => {
  let bucket = 20; // simple token-bucket rate limit
  const refill = setInterval(() => { bucket = Math.min(20, bucket + 4); }, 1000);

  ws.on('message', (raw) => {
    if (--bucket < 0) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const pid = clients.get(ws);

    if (msg.t === 'hello') {
      let p = game.playerByToken(msg.token);
      if (!p) {
        if (!msg.name) { send(ws, { t: 'need_name' }); return; }
        try { p = game.createPlayer({ name: msg.name }); } catch (e) {
          send(ws, { t: 'need_name', error: e.message });
          return;
        }
        game.news(`${p.name} just moved to the city. Works as a ${p.job}.`, p.district);
      }
      clients.set(ws, p.id);
      p.online = true;
      p.lastSeen = Date.now();
      send(ws, { t: 'welcome', token: p.token, playerId: p.id, history: game.chatHistoryFor(p.id) });
      send(ws, { t: 'state', view: game.viewFor(p.id) });
      game.changed();
      return;
    }

    if (msg.t === 'act' && pid) {
      try {
        const roomsBefore = game.roomsFor(game.player(pid)).join();
        const res = game.act(pid, String(msg.a), msg.args ?? {});
        send(ws, { t: 'result', id: msg.id, ok: true, ...res });
        // Joining an event or switching sides opens rooms: send their backlog.
        if (game.roomsFor(game.player(pid)).join() !== roomsBefore) send(ws, { t: 'history', history: game.chatHistoryFor(pid) });
      } catch (e) {
        if (!(e instanceof GameError)) console.error(e);
        send(ws, { t: 'result', id: msg.id, ok: false, error: e instanceof GameError ? e.message : 'Something went wrong' });
      }
    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    const pid = clients.get(ws);
    clients.delete(ws);
    if (pid && ![...clients.values()].includes(pid)) {
      const p = game.player(pid);
      if (p) { p.online = false; p.lastSeen = Date.now(); }
      game.changed();
    }
  });
});

// Coalesce state pushes: at most one snapshot per client per 250ms.
let dirty = false;
game.on((ev) => {
  if (ev.type === 'changed') { dirty = true; return; }
  for (const [ws, pid] of clients) {
    if (ev.type === 'chat' && game.canAccessRoom(game.player(pid), ev.msg.room)) send(ws, { t: 'chat', msg: ev.msg });
    if (ev.type === 'notify' && ev.playerId === pid) send(ws, { t: 'notify', text: ev.text, kind: ev.kind });
  }
});
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  for (const [ws, pid] of clients) send(ws, { t: 'state', view: game.viewFor(pid) });
}, 250);

setInterval(() => { try { game.tick(); } catch (e) { console.error('tick failed', e); } }, game.cfg.tickMs);
setInterval(saveState, 30000);

const shutdown = () => { try { saveState(); } finally { process.exit(0); } };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`Harbor Compact running on http://localhost:${PORT}${FAST ? ' (FAST timers)' : ''}`));
