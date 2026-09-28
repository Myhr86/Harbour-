// Harbor Compact browser client. No framework: the server pushes a filtered
// snapshot of the city, and each tab renders it to HTML strings.

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$${Math.round(n ?? 0).toLocaleString('en-US')}`;
const valueK = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
const FNAME = { family: 'Family', board: 'Board', badge: 'Badge', civilian: 'Civilian', neutral: 'Neutral' };
const FCOLOR = { family: '#c0443c', board: '#cfa446', badge: '#4a7fd1', neutral: '#4f9a62', civilian: '#8a97a8' };
const EV_ICON = { heist: ['H', 'family'], raid: ['R', 'badge'], board_meeting: ['B', 'board'], sitdown: ['S', 'family'] };

const S = {
  ws: null, view: null, token: localStorage.getItem('hc_token'), tab: 'map',
  selDistrict: null, selEvent: null, selCase: null, ledgerTab: 'district', ledgerFilter: 'all',
  room: null, chat: {}, unread: {}, pending: new Map(), seq: 0, pendingRender: false, connected: false,
};

// ------------------------------------------------------------------ network

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  S.ws = ws;
  ws.onopen = () => { S.connected = true; ws.send(JSON.stringify({ t: 'hello', token: S.token })); };
  ws.onclose = () => { S.connected = false; renderWho(); setTimeout(connect, 1500); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'need_name') return showOnboarding(m.error);
    if (m.t === 'welcome') {
      S.token = m.token;
      localStorage.setItem('hc_token', m.token);
      hideModal();
      S.chat = {};
      for (const msg of m.history) addChat(msg, false);
    }
    if (m.t === 'history') for (const msg of m.history) addChat(msg, false);
    if (m.t === 'state') {
      const first = !S.view;
      S.view = m.view;
      if (first) { S.selDistrict = S.view.me.district; S.room = `public:${S.view.me.district}`; }
      render();
    }
    if (m.t === 'chat') addChat(m.msg, true);
    if (m.t === 'notify') toast(m.text, m.kind);
    if (m.t === 'result') {
      const cb = S.pending.get(m.id);
      S.pending.delete(m.id);
      if (m.ok && m.message) toast(m.message, 'good');
      if (!m.ok) toast(m.error, 'bad');
      cb?.(m);
    }
  };
}

function act(a, args = {}) {
  return new Promise((resolve) => {
    if (!S.connected) { toast('Reconnecting…', 'warn'); return resolve({ ok: false }); }
    const id = ++S.seq;
    S.pending.set(id, resolve);
    S.ws.send(JSON.stringify({ t: 'act', id, a, args }));
  });
}

function addChat(msg, live) {
  const list = (S.chat[msg.room] ||= []);
  if (list.some((m) => m.id === msg.id)) return;
  list.push(msg);
  if (list.length > 120) list.shift();
  const visible = (S.tab === 'chat' && S.room === msg.room) || (S.tab === 'events' && S.selEvent && msg.room === `event:${S.selEvent}`);
  if (live && !visible && msg.fromId !== S.view?.me.id) S.unread[msg.room] = (S.unread[msg.room] ?? 0) + 1;
  renderChatLogs();
  renderDots();
}

// ------------------------------------------------------------------ helpers

function toast(text, kind = 'info') {
  if (!text) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

const fpill = (f) => `<span class="pill f-${esc(f)}">${esc(FNAME[f] ?? f)}</span>`;
const me = () => S.view.me;
const district = (id) => S.view.districts.find((d) => d.id === id);
const playersIn = (id) => S.view.players.filter((p) => p.district === id && p.id !== me().id && !p.jailed);
function secsLeft(ts) { return Math.max(0, Math.ceil((ts - Date.now()) / 1000)); }
function fmtSecs(s) { return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`; }

// A button bound to an action. `cd` names a cooldown key so it can count down.
function abtn(label, a, args = {}, { cls = '', cd = null, disabled = false, confirm = null } = {}) {
  const until = cd ? me().cooldowns[cd] ?? 0 : 0;
  const left = secsLeft(until);
  return `<button class="btn ${cls}" data-act="${esc(a)}" data-args="${esc(JSON.stringify(args))}"${cd ? ` data-cd="${esc(cd)}" data-until="${until}" data-label="${esc(label)}"` : ''}${confirm ? ` data-confirm="${esc(confirm)}"` : ''}${disabled ? ' data-off="1"' : ''}${disabled || left ? ' disabled' : ''}>${esc(label)}${left ? ` (${left}s)` : ''}</button>`;
}

// ------------------------------------------------------------------ render

function render() {
  if (!S.view) return;
  // Don't clobber a form the player is typing in; render when they leave it.
  const a = document.activeElement;
  if (a && $('#main').contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) { S.pendingRender = true; renderHeader(); return; }
  S.pendingRender = false;
  renderHeader();
  const keep = {};
  document.querySelectorAll('[data-keep]').forEach((el) => { keep[el.dataset.keep] = el.scrollTop; });
  $('#main').innerHTML = { map: renderMap, ledger: renderLedger, events: renderEvents, chat: renderChat, profile: renderProfile }[S.tab]();
  document.querySelectorAll('[data-keep]').forEach((el) => { if (keep[el.dataset.keep] !== undefined) el.scrollTop = keep[el.dataset.keep]; });
  renderChatLogs();
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  renderDots();
}

function renderHeader() {
  const v = S.view, m = v.me;
  const c = v.clock;
  const h12 = ((c.hour + 11) % 12) + 1;
  $('#clock').textContent = `${h12}:${String(c.minute).padStart(2, '0')} ${c.hour < 12 ? 'AM' : 'PM'} · Day ${c.day} · Season ${v.season}`;
  renderWho();
  const jailed = m.jailedUntil > Date.now();
  $('#stats').innerHTML = `
    <span class="heat">▲ Heat <b>${m.heat}</b></span>
    <span class="inf">★ Influence <b>${m.influence}</b></span>
    <span>Cash <b>${money(m.cash)}</b> <span class="dirty">+ ${money(m.dirtyCash)} dirty</span></span>
    <span>Lives <b>${m.lives}</b></span>
    <span>Rep <b>${m.rep}</b></span>
    ${jailed ? `<span class="bad">In custody <b data-until="${m.jailedUntil}" data-fmt="1">${fmtSecs(secsLeft(m.jailedUntil))}</b></span>` : ''}`;
}

function renderWho() {
  if (!S.view) return;
  const m = S.view.me;
  $('#who').innerHTML = `<b>${esc(m.name)}</b><span class="f-${m.faction}">${FNAME[m.faction]}</span> · ${esc(m.job)} · <span class="${S.connected ? 'online' : 'bad'}">● ${S.connected ? 'Online' : 'Offline'}</span>`;
}

function renderDots() {
  if (!S.view) return;
  const unread = Object.values(S.unread).reduce((a, b) => a + b, 0);
  $('#chatdot').classList.toggle('on', unread > 0 && S.tab !== 'chat');
  const mineLive = S.view.events.some((e) => e.mine && ['open', 'live'].includes(e.status));
  $('#evdot').classList.toggle('on', mineLive && S.tab !== 'events');
}

// -------------------------------------------------------------------- map

const SHAPES = {
  docks: { pts: '30,40 330,30 345,300 50,320', c: [190, 175], kind: 'docks' },
  downtown: { pts: '375,30 645,30 645,300 375,300', c: [510, 165], kind: 'downtown' },
  industrial: { pts: '690,35 965,55 955,325 700,305', c: [828, 180], kind: 'industrial' },
  suburbs: { pts: '30,380 430,368 450,685 45,690', c: [240, 530], kind: 'suburbs' },
  riverfront: { pts: '560,380 965,390 965,688 540,690', c: [755, 535], kind: 'riverfront' },
};

const short = (name) => { const n = String(name ?? '').replace(/"[^"]*"\s*/g, ''); return n.length > 16 ? `${n.slice(0, 15)}…` : n; };

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

function texture(id, shape) {
  const r = rng(id);
  const xs = shape.pts.split(' ').map((p) => p.split(',').map(Number));
  const [x0, x1] = [Math.min(...xs.map((p) => p[0])), Math.max(...xs.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...xs.map((p) => p[1])), Math.max(...xs.map((p) => p[1]))];
  let out = '';
  const kind = shape.kind;
  const step = kind === 'suburbs' ? 34 : kind === 'downtown' ? 38 : 44;
  for (let x = x0 + 8; x < x1 - 10; x += step) {
    for (let y = y0 + 8; y < y1 - 10; y += step) {
      const v = r();
      if (kind === 'suburbs') {
        if (v < 0.45) out += `<circle cx="${x + 12}" cy="${y + 12}" r="${7 + r() * 6}" fill="#2f5a34" opacity=".9"/>`;
        else out += `<rect x="${x + 4}" y="${y + 6}" width="20" height="16" fill="#5b4a3c"/><path d="M${x + 2} ${y + 7}l12-8 12 8z" fill="#7a3d33"/>`;
      } else if (kind === 'downtown') {
        const w = 22 + r() * 10;
        out += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="#39414d" stroke="#4b5563"/><rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${w - 8}" fill="#2b313a"/>`;
      } else if (kind === 'industrial') {
        out += `<rect x="${x}" y="${y}" width="${30 + r() * 10}" height="${22 + r() * 12}" fill="#5a3b33" stroke="#6f4b40"/>`;
        if (v < 0.3) out += `<rect x="${x + 6}" y="${y - 10}" width="6" height="20" fill="#3d2a25"/>`;
      } else if (kind === 'docks') {
        const col = ['#7a3a2e', '#2f5d7a', '#8a6b2e', '#3d6b45'][Math.floor(r() * 4)];
        out += v < 0.7 ? `<rect x="${x}" y="${y}" width="30" height="12" fill="${col}"/><rect x="${x}" y="${y + 16}" width="30" height="12" fill="#444"/>` : `<path d="M${x} ${y + 30}V${y}h26" stroke="#c46b2e" stroke-width="3" fill="none"/>`;
      } else {
        out += v < 0.35 ? `<circle cx="${x + 14}" cy="${y + 14}" r="9" fill="#35573a"/>` : `<rect x="${x}" y="${y}" width="28" height="24" fill="#4b3a33" stroke="#5e4a40"/>`;
      }
    }
  }
  return out;
}

function mapSvg() {
  const v = S.view;
  let defs = '', body = '';
  for (const d of v.districts) {
    const sh = SHAPES[d.id];
    if (!sh) continue;
    const col = FCOLOR[d.control] ?? FCOLOR.neutral;
    defs += `<clipPath id="clip-${d.id}"><polygon points="${sh.pts}"/></clipPath>`;
    const [cx, cy] = sh.c;
    const here = v.players.filter((p) => p.district === d.id && !p.jailed);
    const tokens = here.slice(0, 14).map((p, i) => {
      const ang = (i / Math.min(here.length, 14)) * Math.PI * 2 + 0.4;
      const tx = cx + Math.cos(ang) * 115, ty = cy + Math.sin(ang) * 80;
      const isMe = p.id === me().id;
      return `<g><title>${esc(p.name)} (${FNAME[p.faction]})</title>${isMe ? `<circle class="token-me" cx="${tx}" cy="${ty}" r="14" fill="none" stroke="#fff" stroke-width="2"/>` : ''}<circle cx="${tx}" cy="${ty}" r="${isMe ? 10 : 7}" fill="${FCOLOR[p.faction]}" stroke="#0a0f14" stroke-width="2"/></g>`;
    }).join('');
    const evs = v.events.filter((e) => e.district === d.id && ['open', 'live'].includes(e.status));
    const evMark = evs.length ? `<g><circle cx="${cx + 82}" cy="${cy - 40}" r="13" fill="${evs.some((e) => e.status === 'live') ? '#e0574b' : '#c9a45c'}" stroke="#0a0f14" stroke-width="2"/><text x="${cx + 82}" y="${cy - 35}" text-anchor="middle" font-size="14">${evs.length}</text></g>` : '';
    body += `<g class="district ${S.selDistrict === d.id ? 'sel' : ''}" data-district="${d.id}">
      <polygon class="shape" points="${sh.pts}" fill="#1f262f" stroke="${col}"/>
      <g clip-path="url(#clip-${d.id})">${texture(d.id, sh)}<polygon points="${sh.pts}" fill="${col}" opacity="${d.control === 'neutral' ? 0.18 : 0.32}"/></g>
      <rect class="lbl-box" x="${cx - 86}" y="${cy - 40}" width="172" height="80" rx="4"/>
      <text x="${cx}" y="${cy - 16}" text-anchor="middle" font-size="19">${esc(d.name)}</text>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="13" fill="${col}" style="fill:${col}">${esc(d.control === 'badge' ? 'Badge Control' : d.control === 'neutral' ? 'Neutral' : `${FNAME[d.control]} · ${short(d.holder)}`)}</text>
      <text x="${cx}" y="${cy + 28}" text-anchor="middle" font-size="14">Heat ${d.heat}</text>
      ${evMark}${tokens}
    </g>`;
  }
  const bridges = `<path d="M345 170H375M645 170H690M240 320V368M755 305V380M450 530H540" stroke="#8b7a60" stroke-width="10" stroke-linecap="round" opacity=".8"/>`;
  const waves = Array.from({ length: 30 }, (_, i) => `<path d="M${(i * 137) % 980} ${(i * 53) % 700 + 10}q6 -4 12 0t12 0" stroke="#27506f" fill="none" stroke-width="2"/>`).join('');
  return `<svg viewBox="0 0 1000 720" role="img" aria-label="City map"><defs>${defs}</defs><rect width="1000" height="720" fill="#14304a"/>${waves}${bridges}${body}</svg>`;
}

function renderMap() {
  const d = district(S.selDistrict) ?? S.view.districts[0];
  return `<div class="map-layout">
    <div>
      <div class="map-wrap">${mapSvg()}
        <div class="legend"><b class="muted">Block owner</b>
          ${['family', 'board', 'badge', 'neutral'].map((f) => `<span><i class="fdot" style="background:${FCOLOR[f]}"></i>${FNAME[f]}</span>`).join('')}
          <span><i class="fdot" style="border:2px solid #fff"></i>You</span>
          <span><i class="fdot" style="background:#c9a45c"></i>Event</span>
        </div>
      </div>
      ${renderLiveEventsPanel()}
    </div>
    <aside>${renderDistrictPanel(d)}</aside>
  </div>`;
}

function renderLiveEventsPanel() {
  const evs = S.view.events.filter((e) => ['open', 'live'].includes(e.status));
  return `<div class="panel" style="margin-top:12px"><h3>Live events <button class="btn small" data-tab="events">View all</button></h3>
    ${evs.length ? evs.map(evCard).join('') : '<div class="empty">Quiet night. Something will turn up.</div>'}</div>`;
}

function renderDistrictPanel(d) {
  const m = me();
  const here = m.district === d.id;
  const assets = S.view.assets.filter((a) => a.district === d.id);
  const nearby = playersIn(d.id);
  const heatLevel = d.heat >= 60 ? 'HIGH' : d.heat >= 30 ? 'MEDIUM' : 'LOW';
  return `
  <div class="panel">
    <div class="panel-h"><div><h3 style="font-size:20px">${esc(d.name)}</h3><div class="sub">${d.holder ? `Held by ${esc(d.holder)}` : d.control === 'badge' ? 'Heavy police presence' : 'Nobody holds this block'}</div></div>${fpill(d.control)}</div>
    <div class="panel-b">
      <dl class="kv">
        <dt>Rackets</dt><dd>${d.rackets}%</dd>
        <dt>Business tax</dt><dd>${d.businessTax}%</dd>
        ${d.skim ? `<dt>Dock skim</dt><dd>${d.skim}%</dd>` : ''}
        <dt>Heat level</dt><dd class="${heatLevel === 'HIGH' ? 'bad' : heatLevel === 'MEDIUM' ? 'warn' : 'good'}">${heatLevel} (${d.heat})</dd>
        <dt>Police</dt><dd><div class="bar" style="max-width:160px"><i style="width:${d.presence}%;background:#4a7fd1"></i></div></dd>
      </dl>
    </div>
  </div>
  <div class="panel"><h3>${here ? 'What you can do here' : 'Actions'}</h3><div class="panel-b">${here ? districtActions(d) : `<p class="muted" style="margin-top:0">You're in ${esc(district(m.district).name)}.</p>${abtn(`Go to ${d.name}`, 'move', { district: d.id }, { cls: 'primary', cd: 'move' })}`}</div></div>
  <div class="panel"><h3>Nearby <span class="sub">${nearby.length} here</span></h3>
    ${nearby.length ? nearby.map((p) => playerRow(p, here)).join('') : '<div class="empty">Nobody around.</div>'}</div>
  <div class="panel"><h3>Block ledger</h3>
    ${assets.map((a) => `<div class="row"><div class="grow"><b>${esc(a.name)}</b> ${a.suspected ? '<span class="pill bad">Under investigation</span>' : ''}<div class="sub">${esc(a.type)} · ${esc(a.owner)} · ${valueK(a.value)}</div></div>${assetButtons(a)}</div>`).join('')}
  </div>`;
}

function playerRow(p, here) {
  const m = me();
  const btns = [];
  if (here && m.faction === 'badge' && p.faction !== 'badge') btns.push(abtn('Open case', 'open_case', { targetType: 'player', targetId: p.id }, { cls: 'small blue' }));
  if (here && m.faction === 'family') btns.push(abtn('Sit-down', 'call_sitdown', { targetId: p.id }, { cls: 'small', cd: 'sitdown' }));
  if (p.faction === 'badge' && m.faction !== 'badge') btns.push(`<button class="btn small" data-bribe="${p.id}">Envelope</button>`);
  if (m.faction === 'board' && p.faction === 'family' && S.view.assets.some((a) => a.mine)) btns.push(`<button class="btn small" data-front="${p.id}">Offer front</button>`);
  return `<div class="row"><div class="grow"><b class="f-${p.faction}">${esc(p.name)}</b> ${p.npc ? '<span class="sub">(NPC)</span>' : ''}<div class="sub">${FNAME[p.faction]} · ${esc(p.job)} · Rep ${p.rep} · Heat ${p.heatBand}</div></div><div class="btns">${btns.join('')}</div></div>`;
}

function assetButtons(a) {
  const m = me();
  if (m.faction === 'board' && !a.mine && (a.owner === 'For sale' || S.view.players.find((p) => p.id === a.ownerId)?.npc)) {
    return abtn(`Buy ${money(a.price)}`, 'buy_asset', { assetId: a.id }, { cls: 'small', disabled: m.cash < a.price });
  }
  if (m.faction === 'badge' && a.ownerId) return abtn('Open case', 'open_case', { targetType: 'asset', targetId: a.id }, { cls: 'small blue' });
  if (a.mine) return '<span class="pill f-board">Yours</span>';
  if (a.frontsForMe) return '<span class="pill f-family">Your front</span>';
  return '';
}

function districtActions(d) {
  const m = me();
  const out = [`<div class="btns" style="margin-bottom:10px">${abtn(`Work shift (${m.job})`, 'work', {}, { cd: 'work' })}</div>`];
  if (m.faction === 'civilian') {
    out.push(`<p class="muted">Everyone has two lives. Pick a side:</p><div class="btns">${['family', 'board', 'badge'].map((f) => abtn(`Join ${FNAME[f]}`, 'choose_track', { faction: f }, { cls: 'small' })).join('')}</div>`);
  }
  if (m.faction === 'family') {
    const crimes = Object.entries(S.view.crimes).filter(([, c]) => (!c.districts || c.districts.includes(d.id)) && (!c.needsTerritory || d.holderId === m.id));
    const fronts = S.view.assets.filter((a) => a.frontsForMe || a.mine);
    out.push(`<h4 class="muted" style="margin:6px 0">Rackets</h4><div class="btns">${crimes.map(([k, c]) => abtn(c.label, 'crime', { kind: k }, { cd: `crime:${k}` })).join('')}</div>
      <h4 class="muted" style="margin:12px 0 6px">Territory & crew</h4><div class="btns">
        ${d.holderId === m.id ? '<span class="pill f-family">You hold this block</span>' : abtn(`Claim block ($1,500)`, 'claim_territory', {}, { cd: 'claim', confirm: d.holder ? `Take ${d.name} from ${d.holder}? It may not go your way.` : null })}
        ${abtn('Plan heist ($300)', 'create_heist', { role: 'Driver' }, { cd: 'heist' })}
      </div>
      <h4 class="muted" style="margin:12px 0 6px">Launder dirty money</h4>
      <div class="field"><input type="number" id="launder-amt" min="100" step="100" value="${Math.min(1000, Math.max(100, Math.floor(m.dirtyCash / 100) * 100))}">
        <select id="launder-via"><option value="">Dockside fence (40% cut)</option>${fronts.map((a) => `<option value="${a.id}">${esc(a.name)} (${a.mine ? 0 : a.cut}% cut)</option>`).join('')}</select>
        <button class="btn" data-launder data-cd="launder" data-until="${m.cooldowns.launder ?? 0}" data-label="Wash">Wash</button></div>`);
  }
  if (m.faction === 'board') {
    out.push(`<div class="btns">
      ${d.holderId === m.id ? '<span class="pill f-board">You hold this block</span>' : abtn('Claim block (25 influence)', 'claim_territory', {}, { cd: 'claim' })}
      ${abtn('Lobby City Hall ($400)', 'lobby', {}, { cd: 'lobby' })}
      <button class="btn" data-tab="ledger" data-ledger="mine">Manage companies</button></div>`);
  }
  if (m.faction === 'badge') {
    const patrolling = m.patrolUntil > Date.now() && m.district === d.id;
    out.push(`<div class="btns">
      ${abtn(patrolling ? 'Extend patrol' : 'Patrol', 'patrol', {}, { cd: 'patrol' })}
      ${abtn('Crackdown (20 inf)', 'crackdown', {}, { cd: 'crackdown', cls: 'danger' })}
      <button class="btn blue" data-tab="ledger" data-ledger="cases">Case files</button></div>
      ${patrolling ? `<p class="sub">On patrol: <span data-until="${m.patrolUntil}" data-fmt="1">${fmtSecs(secsLeft(m.patrolUntil))}</span> left. Crimes here may land in your files.</p>` : ''}`);
  }
  return out.join('');
}

// ----------------------------------------------------------------- ledger

function renderLedger() {
  const m = me();
  const tabs = [['district', 'District ledger'], ['mine', m.faction === 'badge' ? 'Envelopes' : 'My holdings'], ['cases', m.faction === 'badge' ? 'Case files' : 'Heat on the street']];
  const body = S.ledgerTab === 'district' ? ledgerDistrict() : S.ledgerTab === 'mine' ? (m.faction === 'badge' ? ledgerEnvelopes() : ledgerMine()) : ledgerCases();
  return `<div class="seg">${tabs.map(([k, l]) => `<button class="${S.ledgerTab === k ? 'on' : ''}" data-ledger="${k}">${l}</button>`).join('')}</div>${body}`;
}

function ledgerDistrict() {
  const f = S.ledgerFilter;
  const rows = S.view.assets.filter((a) => f === 'all' || a.district === f);
  return `<div class="panel"><div class="panel-h"><h3>District ledger</h3>
    <select data-filter><option value="all">All districts</option>${S.view.districts.map((d) => `<option value="${d.id}" ${f === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
    <div class="table-wrap"><table><thead><tr><th>Owner</th><th>Asset</th><th>Type</th><th>District</th><th class="num">Value</th><th></th></tr></thead><tbody>
    ${rows.map((a) => `<tr><td>${esc(a.owner)}</td><td>${esc(a.name)} ${a.suspected ? '<span class="pill bad">Suspected</span>' : ''}</td><td>${esc(a.type)}</td><td>${esc(district(a.district).name)}</td><td class="num">${valueK(a.value)}</td><td class="num">${assetButtons(a)}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="panel"><h3>Territory</h3><div class="table-wrap"><table><thead><tr><th>District</th><th>Control</th><th>Held by</th><th class="num">Rackets</th><th class="num">Tax</th><th class="num">Heat</th></tr></thead><tbody>
    ${S.view.districts.map((d) => `<tr><td>${esc(d.name)}</td><td>${fpill(d.control)}</td><td>${esc(d.holder ?? '—')}</td><td class="num">${d.rackets}%</td><td class="num">${d.businessTax}%</td><td class="num">${d.heat}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

function ledgerMine() {
  const m = me();
  const mine = S.view.assets.filter((a) => a.mine);
  const fronts = S.view.assets.filter((a) => a.frontsForMe);
  const family = S.view.players.filter((p) => p.faction === 'family');
  const dirtyNames = ['Clean', 'Skimming', 'Laundering', 'Full front'];
  let html = '';
  if (m.faction === 'board' || mine.length) {
    html += `<div class="panel"><h3>Your companies</h3>${mine.length ? mine.map((a) => `
      <div class="row" style="flex-wrap:wrap"><div class="grow"><b>${esc(a.name)}</b> <span class="sub">${esc(a.type)} · ${esc(district(a.district).name)} · ${money(a.income)}/tick base</span>
        <div class="sub">Paper trail</div><div class="bar heat" style="max-width:220px"><i style="width:${a.trail}%"></i></div></div>
        <div class="field">
          <select data-dirty="${a.id}">${dirtyNames.map((n, i) => `<option value="${i}" ${a.dirty === i ? 'selected' : ''}>Books: ${n}${i ? ` (+${i * 50}% income)` : ''}</option>`).join('')}</select>
          <select data-partner="${a.id}"><option value="">No Family partner</option>${family.map((p) => `<option value="${p.id}" ${a.partnerId === p.id ? 'selected' : ''}>Front for ${esc(p.name)}</option>`).join('')}</select>
          ${m.faction === 'board' ? abtn('Bury paper ($400)', 'bury_paper', { assetId: a.id }, { cls: 'small', cd: 'bury' }) : ''}
          ${m.faction === 'board' ? `<button class="btn small" data-meeting="${a.id}">Board meeting</button>` : ''}
          ${abtn('Sell to city', 'sell_asset', { assetId: a.id }, { cls: 'small danger', confirm: `Sell ${a.name} to the city at 70%?` })}
        </div></div>`).join('') : '<div class="empty">You own nothing yet. Buy something from the district ledger.</div>'}</div>`;
  }
  if (fronts.length || m.faction === 'family') {
    html += `<div class="panel"><h3>Fronts washing your money</h3>${fronts.length ? fronts.map((a) => `<div class="row"><div class="grow"><b>${esc(a.name)}</b><div class="sub">Owner ${esc(a.owner)} · ${a.cut}% cut</div></div></div>`).join('') : '<div class="empty">No Board partner yet. Without a front you wash money through a fence at 40%.</div>'}</div>`;
  }
  if (m.faction === 'civilian') html += '<div class="panel"><div class="empty">Civilians keep a paycheck, not a ledger. Pick a side in Profile.</div></div>';
  return html;
}

function ledgerEnvelopes() {
  const b = S.view.bribes;
  return `<div class="panel"><h3>Envelopes on your desk</h3>${b.length ? b.map((x) => `<div class="row"><div class="grow"><b>${money(x.amount)}</b> from ${esc(x.from)}${x.caseId ? ` <span class="sub">re: case #${esc(x.caseId)}</span>` : ''}<div class="sub">Expires in <span data-until="${x.expiresAt}" data-fmt="1">${fmtSecs(secsLeft(x.expiresAt))}</span></div></div>
    <div class="btns">${abtn('Keep it', 'accept_bribe', { bribeId: x.id }, { cls: 'small danger' })}${abtn('Log as evidence', 'report_bribe', { bribeId: x.id }, { cls: 'small blue' })}</div></div>`).join('') : '<div class="empty">Clean desk. For now.</div>'}</div>
    <div class="panel"><div class="panel-b sub">Keeping an envelope pays dirty cash and weakens any case it names. Logging it earns influence and opens a file on whoever sent it.</div></div>`;
}

function ledgerCases() {
  const m = me();
  const cases = S.view.cases;
  if (m.faction === 'badge') {
    const sel = cases.find((c) => c.id === S.selCase && c.evidence);
    if (sel) return caseFile(sel);
    return `<div class="panel"><h3>Case files</h3>${cases.filter((c) => c.evidence).map((c) => `<div class="row" data-case="${c.id}" style="cursor:pointer"><div class="grow"><b>#${esc(c.id)} ${esc(c.targetName)}</b><div class="sub">${esc(c.status)} · ${esc(c.officer)} · ${c.evidence.length} evidence · ${c.witnesses.length} witnesses</div></div><div style="width:120px"><div class="bar"><i style="width:${c.strength}%"></i></div><div class="sub" style="text-align:right">${c.strength}%</div></div></div>`).join('') || '<div class="empty">No open files. Open one from the map on a player or an asset.</div>'}</div>`;
  }
  return `<div class="panel"><h3>Heat on the street</h3>${cases.length ? cases.map((c) => {
    const coop = c.witnesses.filter((w) => w.status === 'cooperating').length;
    return `<div class="row" style="flex-wrap:wrap"><div class="grow"><b>${esc(c.targetName)}</b> <span class="pill ${c.status === 'trial' ? 'bad' : 'warn'}">${c.status === 'trial' ? 'On trial' : 'Building'}</span>
      <div class="sub">Case #${esc(c.id)} · Det. ${esc(c.officer)} · ${coop} cooperating witness${coop === 1 ? '' : 'es'}${c.status === 'trial' ? ` · verdict in <span data-until="${c.trialEndsAt}" data-fmt="1">${fmtSecs(secsLeft(c.trialEndsAt))}</span>` : ''}</div>
      <div class="bar" style="max-width:220px;margin-top:4px"><i style="width:${c.strength}%"></i></div></div>
      <div class="btns">${m.faction === 'family' ? abtn('Lean on a witness', 'intimidate', { caseId: c.id }, { cls: 'small danger', cd: 'intimidate', disabled: !coop }) : ''}
      ${m.faction === 'board' ? abtn('Bury paper ($600)', 'bury_paper', { caseId: c.id }, { cls: 'small', cd: 'bury' }) : ''}
      <button class="btn small" data-bribe-case="${c.id}">Envelope for the detective</button></div></div>`;
  }).join('') : '<div class="empty">No rumors. Keep it that way.</div>'}</div>
  <div class="panel"><h3>The bench</h3><div class="panel-b"><p class="sub" style="margin-top:0">${esc(S.view.officials.judge)} has a reputation. You've contributed ${money(m.judgePocket)} to their retirement.</p>
    <div class="field"><input type="number" id="judge-amt" min="500" step="500" value="1000">${`<button class="btn" data-judge data-cd="bribe_judge" data-until="${m.cooldowns.bribe_judge ?? 0}" data-label="Pay a visit">Pay a visit</button>`}</div></div></div>`;
}

function caseFile(c) {
  const m = me();
  const coop = c.witnesses.filter((w) => w.status === 'cooperating').length;
  const riskCls = (v) => (v === 'HIGH' ? 'bad' : v === 'MEDIUM' ? 'warn' : 'good');
  const actions = c.status === 'building' ? [
    ['Investigate', 'Legwork (cooldown)', abtn('Go', 'investigate', { caseId: c.id }, { cls: 'small', cd: 'investigate' })],
    ['Subpoena records', '15 influence', abtn('File', 'subpoena', { caseId: c.id }, { cls: 'small', cd: 'subpoena', disabled: m.influence < 15 })],
    ['Interview witness', '10 influence', abtn('Knock', 'interview', { caseId: c.id }, { cls: 'small', cd: 'interview', disabled: m.influence < 10 })],
    ['Offer deal to witness', '+10 heat', abtn('Offer', 'offer_deal', { caseId: c.id }, { cls: 'small', cd: 'deal' })],
    ['Request raid', '30 influence', abtn('Request', 'request_raid', { caseId: c.id }, { cls: 'small blue', disabled: m.influence < 30 })],
    ['Overreach', '+20 heat, +12% strength', abtn('Cut corners', 'overreach', { caseId: c.id }, { cls: 'small danger', cd: 'overreach', disabled: c.overreach >= 2 })],
    ['Close case', c.strength >= 50 ? 'Suspicious when strong' : 'Weak file', abtn('Close', 'close_case', { caseId: c.id }, { cls: 'small', confirm: 'Close this file?' })],
  ] : [];
  return `<button class="btn small" data-case="" style="margin-bottom:10px">← All files</button>
  <div class="panel"><div class="panel-h"><h3 style="font-size:18px">Evidence file: ${esc(c.targetName)}</h3><span class="pill ${c.status === 'trial' ? 'bad' : 'f-badge'}">${esc(c.status)}</span></div></div>
  <div class="case-layout"><div>
    <div class="panel"><div class="panel-b"><dl class="kv"><dt>Case</dt><dd>#${esc(c.id)} · lead ${esc(c.officer)}</dd><dt>Target</dt><dd>${esc(c.targetName)}</dd><dt>Strength</dt><dd><div class="bar"><i style="width:${c.strength}%"></i></div>${c.strength}%</dd>
      ${c.status === 'trial' ? `<dt>Verdict in</dt><dd data-until="${c.trialEndsAt}" data-fmt="1">${fmtSecs(secsLeft(c.trialEndsAt))}</dd>` : ''}</dl></div></div>
    <div class="panel ev-log"><h3>Evidence log <span class="sub">${c.evidence.length}</span></h3>${c.evidence.map((e) => `<div class="row"><span>${esc(e.label)} <span class="sub">· ${esc(e.source)}</span></span><span class="st-${e.status}">${esc(e.status)}</span></div>`).join('') || '<div class="empty">Nothing yet.</div>'}
      ${c.overreach ? `<div class="row"><span>Overreach</span><span class="bad">×${c.overreach}</span></div>` : ''}${c.tampered ? `<div class="row"><span>Tampered</span><span class="bad">×${c.tampered}</span></div>` : ''}</div>
    <div class="panel"><h3>Witnesses <span class="sub">${coop} cooperating</span></h3>${c.witnesses.map((w) => `<div class="row"><span>${esc(w.name)}</span><span class="${w.status === 'cooperating' ? 'good' : 'bad'}">${esc(w.status)}</span></div>`).join('') || '<div class="empty">No one has talked.</div>'}</div>
  </div><div>
    ${actions.length ? `<div class="panel"><h3>Possible actions</h3>${actions.map(([l, cost, b]) => `<div class="action-row"><div><b>${l}</b><div class="cost">${cost}</div></div>${b}</div>`).join('')}</div>` : ''}
    <div class="panel"><h3>Case risks</h3><div class="panel-b"><dl class="kv"><dt>Intimidation</dt><dd class="${riskCls(c.risks.intimidation)}">${c.risks.intimidation}</dd><dt>Snitch</dt><dd class="${riskCls(c.risks.snitch)}">${c.risks.snitch}</dd><dt>Political</dt><dd class="${riskCls(c.risks.political)}">${c.risks.political}</dd></dl></div></div>
    ${c.status === 'building' ? abtn('Submit to DA for review', 'submit_da', { caseId: c.id }, { cls: 'primary block', disabled: c.strength < 35 }) + '<p class="sub">The DA wants at least 35%. Juries want a lot more.</p>' : ''}
  </div></div>`;
}

// ----------------------------------------------------------------- events

function evCard(e) {
  const [ic, f] = EV_ICON[e.type];
  const filled = e.roles.filter((r) => !r.open).length;
  const when = e.status === 'live' ? '<span class="pill live-tag">● Live</span>'
    : e.status === 'open' ? (secsLeft(e.startsAt) ? `<span class="sub">Starts in <span data-until="${e.startsAt}" data-fmt="1">${fmtSecs(secsLeft(e.startsAt))}</span></span>` : '<span class="sub warn">Waiting on roles</span>')
      : `<span class="pill ${e.result?.ok ? 'good' : 'muted'}">${esc(e.status)}</span>`;
  return `<div class="ev-card" data-event="${e.id}"><div class="ev-icon f-${f}">${ic}</div><div><b>${esc(e.title)}</b>${e.mine ? ' <span class="pill f-board">You\'re in</span>' : ''}<div class="sub">${esc(e.location)} · ${filled}/${e.roles.length} roles</div></div><div>${when}</div></div>`;
}

function renderEvents() {
  const e = S.view.events.find((x) => x.id === S.selEvent);
  if (e) return eventDetail(e);
  const active = S.view.events.filter((x) => ['open', 'live'].includes(x.status));
  const done = S.view.events.filter((x) => !['open', 'live'].includes(x.status));
  const m = me();
  return `<div class="panel"><h3>Live windows ${m.faction === 'family' ? abtn('Plan a heist ($300)', 'create_heist', { role: 'Driver' }, { cls: 'small', cd: 'heist' }) : ''}</h3>${active.map(evCard).join('') || '<div class="empty">Nothing scheduled right now.</div>'}</div>
  ${done.length ? `<div class="panel"><h3>Recently</h3>${done.map(evCard).join('')}</div>` : ''}
  <div class="panel"><div class="panel-b sub">Heists need a Driver, Lookout, Inside Man, Muscle and Fence. Raids need backup and a signed warrant. Board meetings vote. Sit-downs end in a deal, a warning or a body. Empty seats get filled by locals if nobody shows.</div></div>`;
}

function eventDetail(e) {
  const m = me();
  const myRole = e.roles.find((r) => r.playerId === m.id);
  const filled = e.roles.filter((r) => !r.open).length;
  const timerTs = e.status === 'live' ? e.endsAt : e.startsAt;
  const [, f] = EV_ICON[e.type];
  let special = '';
  if (e.status === 'live' && myRole) {
    if (e.type === 'board_meeting') special = `<div class="panel"><h3>Your vote</h3><div class="panel-b btns">${abtn('Yes', 'vote', { eventId: e.id, choice: 'yes' }, { cls: e.myVote === 'yes' ? 'primary' : '' })}${abtn('No', 'vote', { eventId: e.id, choice: 'no' }, { cls: e.myVote === 'no' ? 'primary' : '' })}</div></div>`;
    if (e.type === 'sitdown' && myRole.role !== 'Witness') special = `<div class="panel"><h3>How does this end?</h3><div class="panel-b btns">${['deal', 'warning', 'hit'].map((c) => abtn(c === 'hit' ? 'A body' : c === 'deal' ? 'A deal' : 'A warning', 'vote', { eventId: e.id, choice: c }, { cls: e.myVote === c ? 'primary' : c === 'hit' ? 'danger' : '', confirm: c === 'hit' ? 'Someone loses a life. Your heat will spike. Sure?' : null })).join('')}</div></div>`;
    if (e.type === 'heist') special = `<div class="panel"><h3>Loyalty</h3><div class="panel-b btns">${abtn('Snitch to the Badge', 'betray', { eventId: e.id, how: 'snitch' }, { cls: 'danger', confirm: 'Betrayal is cheap the first time and expensive after that. Snitch?' })}${myRole.role === 'Fence' ? abtn('Run with the take', 'betray', { eventId: e.id, how: 'run' }, { cls: 'danger', confirm: 'Take the whole payout and leave the crew holding the bag?' }) : ''}</div></div>`;
  }
  const info = e.type === 'heist' ? `<dt>Payout</dt><dd>${money(e.payout)} + rep</dd>${myRole ? `<dt>Your cut</dt><dd>${e.cuts[myRole.role]}%</dd>` : ''}`
    : e.type === 'board_meeting' ? `<dt>Proposal</dt><dd>${e.target.proposal === 'sell' ? `Sell ${esc(e.target.assetName)} to ${esc(e.target.buyerName)} for ${money(e.target.price)}` : `Report ${esc(e.target.assetName)} to the police`}</dd>${e.votes ? `<dt>Votes</dt><dd>${e.votes.yes ?? 0} yes · ${e.votes.no ?? 0} no</dd>` : ''}`
      : e.type === 'raid' ? `<dt>Target</dt><dd>${esc(e.target.name)}</dd>` : `<dt>Guest</dt><dd>${esc(e.target?.name)}</dd>`;
  return `<button class="btn small" data-event="" style="margin-bottom:10px">← All events</button>
  <div class="panel"><div class="panel-h"><h3 style="font-size:18px">${e.type === 'heist' ? 'Live event: ' : ''}${esc(e.title)}</h3>${e.status === 'live' ? '<span class="pill live-tag">● In progress</span>' : `<span class="pill f-${f}">${esc(e.status)}</span>`}</div>
    <div class="ev-top">
      ${['open', 'live'].includes(e.status) ? `<div class="timer" data-until="${timerTs}" data-fmt="1">${fmtSecs(secsLeft(timerTs))}</div>` : ''}
      <div class="stat">Participants<b>${filled} / ${e.roles.length}</b></div>
      ${e.type === 'heist' ? `<div class="stat">Heat if failed<b>+${e.heatIfFailed}</b></div>` : ''}
      <div style="margin-left:auto">${myRole && ['open', 'live'].includes(e.status) ? abtn('Leave event', 'leave_event', { eventId: e.id }, { cls: 'danger', confirm: e.status === 'live' ? 'Walking out now costs rep and heat. Leave?' : null }) : ''}</div>
    </div></div>
  ${e.status === 'open' && filled < e.roles.length ? '<div class="warn-box">⚠ Timer paused until all roles are filled. Locals will step in if nobody else does.</div>' : ''}
  ${e.type === 'heist' && e.status !== 'resolved' ? '<div class="warn-box">⚠ If the truck leaves empty or the crew gets pinched, everyone eats heat.</div>' : ''}
  ${e.result ? `<div class="panel"><div class="panel-b"><b class="${e.result.ok ? 'good' : 'bad'}">${esc(e.result.summary)}</b></div></div>` : ''}
  <div class="ev-grid"><div>
    <div class="panel"><div class="panel-b"><dl class="kv"><dt>Location</dt><dd>${esc(e.location)}</dd><dt>Objective</dt><dd>${esc(e.objective)}</dd>${info}</dl></div></div>
    <div class="panel"><h3>Roles (${filled} / ${e.roles.length})</h3>${e.roles.map((r) => `<div class="role"><div><b>${esc(r.role)}</b>${r.playerId === m.id ? ' <span class="sub">(You)</span>' : ''}<div class="sub">${r.open ? 'Open' : `${esc(r.name)}${r.npc ? ' (NPC)' : ''}`}</div></div>
      <div>${r.open ? (r.canTake && !myRole && e.status === 'open' ? abtn('Take role', 'join_event', { eventId: e.id, role: r.role }, { cls: 'small primary' }) : '<span class="sub">Waiting</span>') : r.playerId === m.id && e.status === 'open' ? abtn(r.ready ? 'Ready ✓' : 'Ready up', 'ready_event', { eventId: e.id }, { cls: `small ${r.ready ? 'primary' : ''}` }) : `<span class="${r.ready ? 'bad' : 'warn'}" style="font:500 12px var(--head);letter-spacing:.08em">${r.ready ? 'READY' : 'WAITING'}</span>`}</div></div>`).join('')}</div>
    ${special}
  </div><div>
    ${myRole ? chatBox(`event:${e.id}`, e.type === 'heist' ? 'Talk to your crew…' : 'Speak…', true) : '<div class="panel"><div class="empty">Take a role to join the event channel.</div></div>'}
  </div></div>`;
}

// ------------------------------------------------------------------- chat

const roomLabel = (room) => {
  const [k, v] = room.split(':');
  if (k === 'public') return `Public — ${district(v)?.name ?? v}`;
  if (k === 'faction') return `${FNAME[v]} channel`;
  if (k === 'event') return S.view.events.find((e) => e.id === v)?.title ?? 'Event';
  return room;
};

function chatBox(room, placeholder = 'Speak in character…', short = false) {
  return `<div class="panel"><h3>${esc(roomLabel(room))}</h3><div class="chatlog ${short ? 'short' : ''}" data-chatlog="${esc(room)}" data-keep="log-${esc(room)}"></div>
    <form class="chat-input" data-say="${esc(room)}"><input maxlength="280" placeholder="${esc(placeholder)}" autocomplete="off"><button class="btn primary">Send</button></form></div>`;
}

function renderChat() {
  const rooms = S.view.rooms;
  if (!rooms.includes(S.room)) S.room = `public:${me().district}`;
  delete S.unread[S.room];
  const here = S.view.players.filter((p) => p.district === S.room.split(':')[1]);
  return `<div class="chat-layout"><div>
    <div class="panel rooms"><h3>Rooms</h3>${rooms.map((r) => `<button class="${r === S.room ? 'on' : ''}" data-room="${esc(r)}">${esc(roomLabel(r))}${S.unread[r] ? `<span class="n">${S.unread[r]}</span>` : ''}</button>`).join('')}</div>
    ${S.room.startsWith('public:') ? `<div class="panel players-here"><h3>Players here (${here.length})</h3>${here.slice(0, 12).map((p) => `<div class="row"><span class="f-${p.faction}">${esc(p.name)}</span><span class="sub">${FNAME[p.faction]}</span></div>`).join('')}</div>` : ''}
  </div><div>${chatBox(S.room, S.room.startsWith('public:') ? 'Type in-character message…' : 'Talk to your people…')}</div></div>`;
}

function renderChatLogs() {
  document.querySelectorAll('[data-chatlog]').forEach((el) => {
    const room = el.dataset.chatlog;
    const msgs = S.chat[room] ?? [];
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40 || !el.dataset.rendered;
    el.innerHTML = msgs.map((m) => {
      const t = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (m.system) return `<div class="msg sys"><span class="who muted">▲</span><span class="t">${t}</span><span class="txt">${esc(m.text)}</span></div>`;
      return `<div class="msg"><span class="who f-${esc(m.faction)}">${esc(m.name)} <span class="sub">[${FNAME[m.faction] ?? ''}]</span></span><span class="t">${t}</span><span class="txt">${esc(m.text)}</span></div>`;
    }).join('') || '<div class="empty">Quiet in here.</div>';
    el.dataset.rendered = '1';
    if (atBottom) el.scrollTop = el.scrollHeight;
  });
}

// ---------------------------------------------------------------- profile

function renderProfile() {
  const m = me(), v = S.view;
  const tracks = ['family', 'board', 'badge'];
  const blurbs = {
    family: 'Protection, smuggling, casinos as fronts, hits, territory. Crime pays in dirty cash and heat.',
    board: 'Companies, real estate, laundering, "consulting". Businesses tick income and buy political influence.',
    badge: 'Investigations, raids, evidence, internal affairs — and the constant temptation to look the other way.',
  };
  return `<div class="panel"><div class="panel-h"><div><h3 style="font-size:22px">${esc(m.name)}</h3><div class="sub">${FNAME[m.faction]} · ${esc(m.job)}${m.tracks.length ? ` · walked: ${m.tracks.map((t) => FNAME[t]).join(' → ')}` : ''}</div></div>${fpill(m.faction)}</div>
    <div class="panel-b"><dl class="kv">
      <dt>Reputation</dt><dd>${m.rep}${m.betrayals ? ` <span class="bad">· ${m.betrayals} betrayal${m.betrayals > 1 ? 's' : ''} on record</span>` : ''}</dd>
      <dt>Heat</dt><dd><div class="bar heat" style="max-width:240px"><i style="width:${m.heat}%"></i></div></dd>
      <dt>Influence</dt><dd>${m.influence}</dd>
      <dt>Cash</dt><dd>${money(m.cash)} clean · ${money(m.dirtyCash)} dirty</dd>
      <dt>Lives</dt><dd>${m.lives}</dd>
      <dt>Record</dt><dd>${m.stats.crimes} jobs · ${m.stats.heists} heists · ${m.stats.convictions} convictions won · ${m.stats.timesConvicted} times convicted</dd>
    </dl></div></div>
  <h3 style="margin:16px 0 8px">Everyone has two lives</h3>
  <div class="track-cards">${tracks.map((t) => `<div class="track ${m.faction === t ? 'cur' : ''}"><h3 class="f-${t}">${FNAME[t]}</h3><p class="sub" style="margin:0">${blurbs[t]}</p>
    ${m.faction === t ? '<span class="pill f-board">Your side</span>' : abtn(m.faction === 'civilian' ? `Walk the ${FNAME[t]} road` : `Switch to ${FNAME[t]} (−15 rep)`, 'choose_track', { faction: t }, { cls: 'block', confirm: m.faction === 'civilian' ? null : 'Changing sides halves your influence and drops your blocks. People remember. Continue?' })}</div>`).join('')}</div>
  <div class="panel" style="margin-top:12px"><h3>City Hall · Season ${v.season}</h3><div class="panel-b"><dl class="kv"><dt>Mayor</dt><dd>${esc(v.officials.mayor)}</dd><dt>Police</dt><dd>${esc(v.officials.commissioner)}</dd><dt>Bench</dt><dd>${esc(v.officials.judge)}</dd><dt>Season ends</dt><dd>${new Date(v.seasonEndsAt).toLocaleDateString()}</dd></dl>
    <p class="sub">At season's end the mayor, commissioner and every block reset. Companies, reputations and grudges persist.</p></div></div>
  <div class="panel"><h3>City wire</h3><ul class="feed">${v.feed.map((f) => `<li>${esc(f.text)} <span class="sub">${new Date(f.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ul></div>
  <div class="panel"><div class="panel-b"><button class="btn danger" data-logout>Forget this device</button> <span class="sub">Your character lives on the server; this only clears the login key stored in this browser.</span></div></div>`;
}

// -------------------------------------------------------------- modals

function showOnboarding(error) {
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="modal-card"><h2>⚓ Harbor Compact</h2>
    <p><b>Everyone has two lives.</b> You arrive as a civilian with a legal job and a modest apartment. The Family, the Board and the Badge all need people like you.</p>
    <p class="sub">The city keeps moving when you're gone. Businesses tick, cases build, and idle players can still be raided.</p>
    ${error ? `<p class="bad">${esc(error)}</p>` : ''}
    <form id="join"><input name="name" maxlength="24" placeholder="Your name on the street" autofocus required><button class="btn primary">Arrive</button></form></div>`;
  $('#join').onsubmit = (ev) => {
    ev.preventDefault();
    const name = ev.target.name.value.trim();
    S.ws.send(JSON.stringify({ t: 'hello', name }));
  };
  $('#join input').focus();
}

function hideModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

function promptModal(title, body, fields, onSubmit) {
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="modal-card"><h2 style="font-size:20px">${esc(title)}</h2><p class="sub">${body}</p>
    <form id="pm" style="flex-direction:column">${fields}<div class="btns"><button class="btn primary">Confirm</button><button type="button" class="btn" data-close>Cancel</button></div></form></div>`;
  $('#pm').onsubmit = async (ev) => {
    ev.preventDefault();
    const res = await onSubmit(new FormData(ev.target));
    if (res?.ok !== false) hideModal();
  };
  m.querySelector('[data-close]').onclick = hideModal;
}

function bribeModal(officerId, caseId) {
  const cops = S.view.players.filter((p) => p.faction === 'badge');
  const c = caseId ? S.view.cases.find((x) => x.id === caseId) : null;
  promptModal('An envelope', 'Dirty money goes first. The officer can keep it, or log it as evidence against you.',
    `<select name="officer">${cops.map((p) => `<option value="${p.id}" ${p.id === officerId || (c && p.name === c.officer) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
     <input type="number" name="amount" min="100" step="100" value="1000">`,
    (fd) => act('offer_bribe', { officerId: fd.get('officer'), amount: Number(fd.get('amount')), caseId }));
}

function frontModal(familyId) {
  const mine = S.view.assets.filter((a) => a.mine);
  const p = S.view.players.find((x) => x.id === familyId);
  promptModal(`Front for ${p.name}`, 'Their dirty money runs through your books. You keep a cut. Your paper trail grows.',
    `<select name="asset">${mine.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
     <label class="sub">Your cut % <input type="number" name="cut" min="5" max="50" value="15"></label>`,
    (fd) => act('set_partner', { assetId: fd.get('asset'), partnerId: familyId, cut: Number(fd.get('cut')) }));
}

function meetingModal(assetId) {
  const a = S.view.assets.find((x) => x.id === assetId);
  promptModal(`Board meeting: ${a.name}`, 'Seats are filled by the board. Majority wins. Costs 5 influence.',
    `<select name="proposal"><option value="sell">Sell it</option><option value="report">Report it to the police</option></select>
     <select name="buyer"><option value="">— buyer (for sale) —</option>${S.view.players.filter((p) => p.id !== me().id).map((p) => `<option value="${p.id}">${esc(p.name)} (${FNAME[p.faction]})</option>`).join('')}</select>
     <input type="number" name="price" min="100" step="100" value="${Math.round(a.value / 100)}">`,
    (fd) => act('call_meeting', { assetId, proposal: fd.get('proposal'), buyerId: fd.get('buyer'), price: Number(fd.get('price')) }));
}

// -------------------------------------------------------------- events wiring

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, [data-district], [data-event], [data-case]');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) { S.tab = d.tab; if (d.ledger) S.ledgerTab = d.ledger; if (d.tab === 'events') S.selEvent = null; render(); window.scrollTo(0, 0); return; }
  if (d.ledger) { S.ledgerTab = d.ledger; render(); return; }
  if (d.district !== undefined && !d.act) { S.selDistrict = d.district; render(); return; }
  if (d.event !== undefined) { S.selEvent = d.event || null; S.tab = 'events'; render(); window.scrollTo(0, 0); return; }
  if (d.case !== undefined) { S.selCase = d.case || null; render(); return; }
  if (d.room) { S.room = d.room; render(); return; }
  if (d.bribe) return bribeModal(d.bribe);
  if (d.bribeCase) return bribeModal(null, d.bribeCase);
  if (d.front) return frontModal(d.front);
  if (d.meeting) return meetingModal(d.meeting);
  if (d.logout !== undefined) { if (confirm('Forget this character on this device? Without the key you cannot log back in.')) { localStorage.removeItem('hc_token'); location.reload(); } return; }
  if (d.launder !== undefined) {
    const via = $('#launder-via').value;
    await act('launder', { amount: Number($('#launder-amt').value), assetId: via || undefined });
    return render();
  }
  if (d.judge !== undefined) { await act('bribe_judge', { amount: Number($('#judge-amt').value) }); return render(); }
  if (d.act) {
    if (d.confirm && !confirm(d.confirm)) return;
    t.disabled = true;
    const res = await act(d.act, JSON.parse(d.args || '{}'));
    if (res.eventId) { S.selEvent = res.eventId; S.tab = 'events'; }
    if (res.caseId && d.act === 'open_case') { S.selCase = res.caseId; S.tab = 'ledger'; S.ledgerTab = 'cases'; }
    if (d.act === 'move') S.selDistrict = JSON.parse(d.args).district;
    render();
  }
});

document.addEventListener('change', (ev) => {
  const d = ev.target.dataset;
  if (d.filter !== undefined) { S.ledgerFilter = ev.target.value; ev.target.blur(); render(); }
  if (d.dirty) { act('set_dirty', { assetId: d.dirty, level: Number(ev.target.value) }); ev.target.blur(); }
  if (d.partner) { act('set_partner', { assetId: d.partner, partnerId: ev.target.value || null }); ev.target.blur(); }
});

document.addEventListener('submit', (ev) => {
  const room = ev.target.dataset.say;
  if (!room) return;
  ev.preventDefault();
  const input = ev.target.querySelector('input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  act('say', { room, text });
});

document.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender) render(); }, 0));

// Countdown labels and cooldown buttons tick every second without a full re-render.
setInterval(() => {
  document.querySelectorAll('[data-until]').forEach((el) => {
    const left = secsLeft(Number(el.dataset.until));
    if (el.dataset.cd) {
      el.textContent = left ? `${el.dataset.label} (${left}s)` : el.dataset.label;
      el.disabled = left > 0 || el.dataset.off === '1';
    } else if (el.dataset.fmt) el.textContent = fmtSecs(left);
  });
}, 1000);

connect();
