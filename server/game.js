// Harbor Compact — authoritative game state and rules.
//
// The Game class owns one persistent city. It is transport-agnostic: the
// WebSocket server calls act()/tick()/viewFor() and forwards emitted events.
// Time and randomness are injectable so the rules can be tested
// deterministically.

import { randomBytes } from 'node:crypto';
import * as D from './data.js';
import { runDirector } from './npc.js';

export class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const DEFAULT_CONFIG = {
  tickMs: 5000,
  dayMs: 24 * 60 * 1000, // one in-game day = 24 real minutes
  seasonMs: 49 * 24 * 60 * 60 * 1000, // seven weeks
  cooldownScale: 1,
  npcFillMs: 30000, // empty event roles are filled by NPCs after this long
  eventLeadMs: 120000, // scheduled start after creation
  eventLiveMs: 60000,
  eventAbandonMs: 300000, // unfilled events are cancelled after start + this
  trialMs: 45000,
  bribeTtlMs: 120000,
  jailMs: 180000,
  heatDecay: 0.4,
  chatHistory: 80,
  minOpenEvents: 2,
  directorEveryTicks: 3,
};

const EVENT_ACTIONS = new Set(['join_event', 'leave_event', 'ready_event', 'vote', 'betray']);
// Actions allowed while jailed.
const JAIL_OK = new Set(['say', 'move']);

const ACTIONS = new Set([
  'move', 'work', 'choose_track',
  'crime', 'claim_territory', 'launder', 'intimidate', 'create_heist', 'call_sitdown',
  'buy_asset', 'sell_asset', 'set_dirty', 'set_partner', 'bury_paper', 'lobby', 'call_meeting',
  'patrol', 'crackdown', 'open_case', 'investigate', 'subpoena', 'interview', 'offer_deal',
  'request_raid', 'overreach', 'submit_da', 'close_case', 'accept_bribe', 'report_bribe',
  'offer_bribe', 'bribe_judge', 'say',
  ...EVENT_ACTIONS,
]);

export class Game {
  constructor({ now = () => Date.now(), rng = Math.random, config = {}, state = null } = {}) {
    this.now = now;
    this.rng = rng;
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    this.listeners = new Set();
    this.tickCount = 0;
    if (state) this.state = state;
    else this.newWorld();
  }

  // ---------------------------------------------------------------- plumbing

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }
  changed() { this.emit({ type: 'changed' }); }

  id(prefix) { return `${prefix}${(++this.state.seq).toString(36)}`; }
  rand(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
  chance(p) { return this.rng() < p; }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  player(id) { return this.state.players[id]; }
  nameOf(id) { return this.state.players[id]?.name ?? 'the City'; }

  notify(playerId, text, kind = 'info') {
    if (playerId && !this.player(playerId)?.isNpc) this.emit({ type: 'notify', playerId, text, kind });
  }

  say(room, text, from = null) {
    const s = this.state;
    const p = from ? this.player(from) : null;
    const msg = {
      id: this.id('m'), room, at: this.now(), text: String(text).slice(0, 280),
      fromId: p?.id ?? null, name: p?.name ?? null, faction: p?.faction ?? null, system: !p,
    };
    (s.chat[room] ||= []).push(msg);
    if (s.chat[room].length > this.cfg.chatHistory) s.chat[room].splice(0, s.chat[room].length - this.cfg.chatHistory);
    this.emit({ type: 'chat', msg });
    return msg;
  }

  // Public news: goes to the feed and to the district's public room.
  news(text, district = null) {
    const s = this.state;
    s.feed.unshift({ at: this.now(), text, district });
    s.feed.length = Math.min(s.feed.length, 40);
    if (district) this.say(`public:${district}`, text);
  }

  // ------------------------------------------------------------------- world

  newWorld() {
    const t = this.now();
    const s = this.state = {
      version: 1, season: 1, seasonStartedAt: t, createdAt: t, seq: 0,
      players: {}, districts: {}, assets: {}, events: {}, cases: {}, bribes: {},
      chat: {}, feed: [], officials: {},
    };
    for (const d of D.DISTRICTS) s.districts[d.id] = { ...d, heat: d.baseHeat, presence: 20, holderId: null };
    s.districts.suburbs.presence = 70; // the suburbs start under Badge control

    const npcIds = {};
    for (const n of D.NPCS) {
      const p = this.createPlayer({ name: n.name, faction: n.faction, job: n.job, isNpc: true, district: n.district });
      Object.assign(p, { rep: n.rep, npcKey: n.key, cash: 6000, influence: 50 });
      if (n.faction === 'badge') p.corruption = n.key === 'hale' ? 0.45 : 0.1;
      npcIds[n.key] = p.id;
    }
    for (const a of D.ASSETS) {
      s.assets[a.id] = {
        id: a.id, name: a.name, type: a.type, district: a.district, value: a.value, income: a.income,
        ownerId: a.owner ? npcIds[a.owner] : null, dirty: a.dirty ?? 0, trail: (a.dirty ?? 0) * 12,
        partnerId: null, cut: 15,
      };
    }
    for (const [d, key] of Object.entries(D.STARTING_HOLDERS)) s.districts[d].holderId = key ? npcIds[key] : null;
    this.shuffleOfficials();
  }

  shuffleOfficials() {
    const o = this.state.officials;
    o.mayor = { name: this.pick(D.OFFICIAL_NAMES.mayor) };
    o.commissioner = { name: this.pick(D.OFFICIAL_NAMES.commissioner) };
    o.judge = { name: this.pick(D.OFFICIAL_NAMES.judge), corruption: Math.round((0.1 + this.rng() * 0.5) * 100) / 100, pockets: {} };
  }

  createPlayer({ name, faction = 'civilian', job, isNpc = false, district = 'downtown' }) {
    const t = this.now();
    const clean = String(name ?? '').replace(/[^\p{L}\p{N} .'"\-]/gu, '').trim().slice(0, 24);
    if (!isNpc && clean.length < 2) fail('Pick a name with at least 2 letters');
    if (!isNpc && Object.values(this.state.players).some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      fail('That name is taken in this city');
    }
    const p = {
      id: this.id('p'), name: clean, faction, job: job || this.pick(D.JOBS), isNpc,
      cash: 1200, dirtyCash: 0, heat: 0, influence: 10, rep: 0, lives: 3, district,
      cooldowns: {}, betrayals: 0, tracks: [], jailedUntil: 0, patrolUntil: 0, corruption: 0,
      online: false, lastSeen: t, joinedAt: t,
      token: isNpc ? null : randomBytes(18).toString('hex'),
      stats: { crimes: 0, heists: 0, convictions: 0, timesConvicted: 0 },
    };
    this.state.players[p.id] = p;
    return p;
  }

  playerByToken(token) {
    if (!token) return null;
    return Object.values(this.state.players).find((p) => p.token === token) ?? null;
  }

  // ----------------------------------------------------------------- helpers

  need(p, ...factions) {
    if (!factions.includes(p.faction)) fail(`Only ${factions.map((f) => D.FACTIONS[f].name).join(' / ')} can do that`);
  }

  cool(p, key, secs) {
    const t = this.now();
    const until = p.cooldowns[key] ?? 0;
    if (until > t) fail(`Not yet — ${Math.ceil((until - t) / 1000)}s cooldown`);
    p.cooldowns[key] = t + secs * 1000 * this.cfg.cooldownScale;
  }

  spend(p, field, amt, label = field) {
    if ((p[field] ?? 0) < amt) fail(`Not enough ${label} (need ${amt})`);
    p[field] -= amt;
  }

  // Pays from dirty money first, then clean cash.
  spendAnyCash(p, amt) {
    if (p.cash + p.dirtyCash < amt) fail(`Not enough cash (need $${amt})`);
    const fromDirty = Math.min(p.dirtyCash, amt);
    p.dirtyCash -= fromDirty;
    p.cash -= amt - fromDirty;
  }

  addHeat(p, n) { p.heat = clamp(Math.round((p.heat + n) * 10) / 10, 0, 100); }
  addRep(p, n) { p.rep = Math.round(p.rep + n); }
  districtHeat(id, n) { const d = this.state.districts[id]; d.heat = clamp(Math.round(d.heat + n), 0, 100); }

  getCase(id) { return this.state.cases[id] ?? fail('No such case'); }
  getAsset(id) { return this.state.assets[id] ?? fail('No such asset'); }
  getEvent(id) { return this.state.events[id] ?? fail('No such event'); }

  controllerOf(d) {
    const holder = d.holderId ? this.player(d.holderId) : null;
    if (holder) return holder.faction;
    if (d.presence >= 60) return 'badge';
    return 'neutral';
  }

  // How dirty is the target of a case (0–100)? Drives evidence odds.
  targetDirt(c) {
    if (c.targetType === 'asset') {
      const a = this.state.assets[c.targetId];
      return a ? clamp(a.dirty * 20 + a.trail / 2, 0, 100) : 0;
    }
    const p = this.player(c.targetId);
    return p ? clamp(p.heat + p.dirtyCash / 200 + p.corruption / 100, 0, 100) : 0;
  }

  caseOwnerId(c) {
    return c.targetType === 'asset' ? this.state.assets[c.targetId]?.ownerId ?? null : c.targetId;
  }

  strength(c) {
    let s = 0;
    for (const e of c.evidence) s += e.weight * (D.EVIDENCE_STATUS[e.status] ?? 0);
    s += c.witnesses.filter((w) => w.status === 'cooperating').length * 10;
    s += c.overreach * 12;
    s -= c.tampered * 20;
    return clamp(Math.round(s), 0, 100);
  }

  addEvidence(c, label, weight, status, source = '') {
    c.evidence.push({ id: this.id('e'), label, weight, status, source, at: this.now() });
    this.checkRumor(c);
  }

  checkRumor(c) {
    if (!c.rumored && this.strength(c) >= 40 && c.status === 'building') {
      c.rumored = true;
      this.news(`Word on the street: the Badge is building a file on ${c.targetName}.`, c.district);
      this.notify(this.caseOwnerId(c), `Someone is building a case on ${c.targetName}. Case #${c.id}.`, 'warn');
    }
  }

  openCase(officer, targetType, targetId) {
    const s = this.state;
    let targetName, district;
    if (targetType === 'asset') {
      const a = this.getAsset(targetId);
      targetName = a.name + (a.ownerId ? ` (${this.nameOf(a.ownerId)})` : '');
      district = a.district;
    } else if (targetType === 'player') {
      const t = this.player(targetId) ?? fail('No such player');
      if (t.id === officer.id) fail('You cannot investigate yourself');
      targetName = t.name;
      district = t.district;
    } else fail('Bad case target');
    const existing = Object.values(s.cases).find((c) => c.targetType === targetType && c.targetId === targetId && ['building', 'trial'].includes(c.status));
    if (existing) return existing;
    const c = {
      id: this.id('c'), officerId: officer.id, targetType, targetId, targetName, district,
      evidence: [], witnesses: [], overreach: 0, tampered: 0, status: 'building', rumored: false,
      createdAt: this.now(), trialEndsAt: 0, notes: '',
    };
    s.cases[c.id] = c;
    return c;
  }

  // Badge officers patrolling a district when a crime happens there.
  patrollersIn(district) {
    const t = this.now();
    return Object.values(this.state.players).filter((p) => p.faction === 'badge' && p.patrolUntil > t && p.district === district);
  }

  // ------------------------------------------------------------ action entry

  act(playerId, type, args = {}) {
    const p = this.player(playerId) ?? fail('Unknown player');
    if (!ACTIONS.has(type)) fail(`Unknown action: ${type}`);
    if (p.jailedUntil > this.now() && !JAIL_OK.has(type)) {
      fail(`You're doing time for another ${Math.ceil((p.jailedUntil - this.now()) / 1000)}s`);
    }
    // A failed action must not burn its cooldown.
    const cooldowns = { ...p.cooldowns };
    let res;
    try {
      res = this[`a_${type}`](p, args ?? {}) ?? {};
    } catch (e) {
      p.cooldowns = cooldowns;
      throw e;
    }
    this.changed();
    return res;
  }

  // ------------------------------------------------------------- everyone

  a_move(p, { district }) {
    if (!this.state.districts[district]) fail('No such district');
    if (p.district === district) fail('You are already there');
    this.cool(p, 'move', 3);
    p.district = district;
    return { message: `You head to ${this.state.districts[district].name}.` };
  }

  a_work(p) {
    this.cool(p, 'work', 30);
    const pay = this.rand(80, 160);
    p.cash += pay;
    if (p.faction === 'board') p.influence += 1;
    if (p.faction === 'civilian') this.addRep(p, 1);
    return { message: `A shift as ${p.job}: +$${pay} clean.` };
  }

  a_choose_track(p, { faction }) {
    if (!D.TRACKS.includes(faction)) fail('Pick Family, Board or Badge');
    if (p.faction === faction) fail('You already walk that road');
    if (faction === 'badge' && p.heat > 30) fail('Nobody pins a badge on someone that hot. Cool off first.');
    const first = !p.tracks.includes(faction);
    if (p.faction !== 'civilian') {
      this.addRep(p, -15);
      p.influence = Math.floor(p.influence / 2);
      for (const d of Object.values(this.state.districts)) if (d.holderId === p.id) d.holderId = null;
      for (const a of Object.values(this.state.assets)) if (a.partnerId === p.id) a.partnerId = null;
      this.news(`${p.name} has changed sides. People will remember.`, p.district);
    }
    p.faction = faction;
    p.tracks.push(faction);
    if (first) {
      if (faction === 'board') p.cash += 2500;
      if (faction === 'badge') p.influence += 25;
      if (faction === 'family') p.dirtyCash += 300;
    }
    return { message: `You're ${D.FACTIONS[faction].name} now. ${D.FACTIONS[faction].blurb}` };
  }

  a_say(p, { room, text }) {
    text = String(text ?? '').trim();
    if (!text) fail('Say something');
    if (!this.canAccessRoom(p, room)) fail('You are not in that room');
    this.cool(p, 'say', 0.7);
    this.say(room, text, p.id);
    return {};
  }

  canAccessRoom(p, room) {
    if (typeof room !== 'string') return false;
    const [kind, key] = room.split(':');
    if (kind === 'public') return !!this.state.districts[key];
    if (kind === 'faction') return p.faction === key && key !== 'civilian';
    if (kind === 'event') return !!this.state.events[key]?.roles.some((r) => r.playerId === p.id);
    return false;
  }

  roomsFor(p) {
    const rooms = Object.keys(this.state.districts).map((d) => `public:${d}`);
    if (p.faction !== 'civilian') rooms.push(`faction:${p.faction}`);
    for (const e of Object.values(this.state.events)) {
      if (e.status !== 'cancelled' && e.roles.some((r) => r.playerId === p.id)) rooms.push(`event:${e.id}`);
    }
    return rooms;
  }

  a_offer_bribe(p, { officerId, amount, caseId }) {
    const o = this.player(officerId) ?? fail('No such officer');
    if (o.faction !== 'badge') fail('That person has no badge to sell');
    if (o.id === p.id) fail('Bribing yourself is just saving');
    amount = Math.floor(Number(amount));
    if (!(amount >= 100)) fail('An envelope needs at least $100 in it');
    if (caseId && !this.state.cases[caseId]) fail('No such case');
    this.cool(p, 'bribe', 20);
    this.spendAnyCash(p, amount);
    const b = { id: this.id('b'), fromId: p.id, toId: o.id, amount, caseId: caseId || null, expiresAt: this.now() + this.cfg.bribeTtlMs };
    this.state.bribes[b.id] = b;
    this.notify(o.id, `${p.name} slid you an envelope: $${amount}${caseId ? ` about case #${caseId}` : ''}.`, 'warn');
    return { message: `Envelope delivered to ${o.name}.` };
  }

  a_bribe_judge(p, { amount }) {
    amount = Math.floor(Number(amount));
    if (!(amount >= 500)) fail('The judge does not get out of bed for less than $500');
    this.cool(p, 'bribe_judge', 60);
    this.spendAnyCash(p, amount);
    const j = this.state.officials.judge;
    j.pockets[p.id] = (j.pockets[p.id] ?? 0) + amount;
    if (this.chance(0.15)) {
      this.addHeat(p, 10);
      return { message: `${j.name} took it — but a clerk saw. (+10 heat)` };
    }
    return { message: `${j.name} will remember your generosity.` };
  }

  // ----------------------------------------------------------------- family

  a_crime(p, { kind }) {
    this.need(p, 'family');
    const c = D.CRIMES[kind] ?? fail('Unknown job');
    const d = this.state.districts[p.district];
    if (c.districts && !c.districts.includes(d.id)) fail(`Can't do that in ${d.name}`);
    if (c.needsTerritory && d.holderId !== p.id) fail(`You don't hold ${d.name}`);
    this.cool(p, `crime:${kind}`, c.cooldown);
    const gross = Math.round(this.rand(c.cash[0], c.cash[1]) * (1 - d.presence / 250));
    let cut = 0;
    const holder = d.holderId && d.holderId !== p.id ? this.player(d.holderId) : null;
    if (holder) {
      cut = Math.round(gross * d.rackets / 100);
      holder.dirtyCash += cut;
    }
    p.dirtyCash += gross - cut;
    const heat = Math.round(c.heat * (1 + d.presence / 100));
    this.addHeat(p, heat);
    this.districtHeat(d.id, c.heat / 2);
    p.stats.crimes++;
    let note = '';
    for (const cop of this.patrollersIn(d.id)) {
      if (this.chance(0.35)) {
        const cs = this.openCase(cop, 'player', p.id);
        this.addEvidence(cs, 'Surveillance Logs', 12, 'Collected', `${cop.name} on patrol`);
        this.notify(cop.id, `You saw ${p.name} working ${d.name}. Logged to case #${cs.id}.`, 'good');
        note = ' Someone with a badge was watching.';
      }
    }
    return { message: `${c.label}: +$${gross - cut} dirty${cut ? ` ($${cut} to ${holder.name})` : ''}, +${heat} heat.${note}` };
  }

  a_claim_territory(p) {
    this.need(p, 'family', 'board');
    const d = this.state.districts[p.district];
    if (d.holderId === p.id) fail('You already hold this block');
    if (p.rep < 10) fail('Nobody takes you seriously yet (need 10 rep)');
    this.cool(p, 'claim', 120);
    if (p.faction === 'family') this.spend(p, 'cash', 1500, 'clean cash');
    else this.spend(p, 'influence', 25, 'influence');
    const holder = d.holderId ? this.player(d.holderId) : null;
    this.districtHeat(d.id, 10);
    if (holder) {
      const mine = p.rep + this.rng() * 40 + (p.faction === 'family' ? 10 : p.influence / 5);
      const theirs = holder.rep + this.rng() * 40 + 10;
      this.addHeat(p, 10);
      if (mine <= theirs) {
        this.addRep(p, -3);
        this.news(`${p.name} made a play for ${d.name}. ${holder.name} held on.`, d.id);
        return { message: `${holder.name} held ${d.name}. The money's gone.` };
      }
      this.addRep(holder, -5);
      this.notify(holder.id, `${p.name} took ${d.name} from you.`, 'bad');
    }
    d.holderId = p.id;
    this.addRep(p, 5);
    this.news(`${d.name} answers to ${p.name} now.`, d.id);
    return { message: `${d.name} is yours. Rackets ${d.rackets}%, business tax ${d.businessTax}%.` };
  }

  a_launder(p, { amount, assetId }) {
    amount = Math.floor(Number(amount));
    if (!(amount >= 100)) fail('Launder at least $100');
    if (p.dirtyCash < amount) fail('You don\'t have that much dirty money');
    this.cool(p, 'launder', 45);
    let rate, via;
    if (assetId) {
      const a = this.getAsset(assetId);
      if (a.partnerId !== p.id && a.ownerId !== p.id) fail(`${a.name} doesn't wash your money`);
      if (a.dirty < 1) fail(`${a.name} keeps clean books. The owner has to open them up.`);
      const cap = 1500 * a.dirty;
      if (amount > cap) fail(`${a.name} can only move $${cap} at a time`);
      rate = a.ownerId === p.id ? 0 : a.cut / 100;
      a.trail = clamp(a.trail + amount / 150, 0, 100);
      const fee = Math.round(amount * rate);
      const owner = this.player(a.ownerId);
      if (owner) owner.cash += fee;
      if (owner && owner.id !== p.id) this.notify(owner.id, `${p.name} ran $${amount} through ${a.name}. Your cut: $${fee}.`);
      via = a.name;
    } else {
      rate = 0.4;
      via = 'a dockside fence';
    }
    p.dirtyCash -= amount;
    const clean = Math.round(amount * (1 - rate));
    p.cash += clean;
    return { message: `Washed $${amount} through ${via}: +$${clean} clean.` };
  }

  a_intimidate(p, { caseId }) {
    this.need(p, 'family');
    const c = this.getCase(caseId);
    if (!c.rumored) fail('You don\'t know anything about that case');
    if (!['building', 'trial'].includes(c.status)) fail('That case is closed');
    const w = c.witnesses.find((x) => x.status === 'cooperating') ?? fail('No cooperating witnesses to lean on');
    this.cool(p, 'intimidate', 60);
    this.addHeat(p, 10);
    if (this.chance(0.45 + p.rep / 200)) {
      w.status = 'intimidated';
      return { message: `${w.name} suddenly can't remember a thing.` };
    }
    this.addHeat(p, 10);
    this.addEvidence(c, 'Witness Tampering Report', 8, 'Collected', w.name);
    return { message: `${w.name} went straight to the cops. (+20 heat)` };
  }

  a_create_heist(p, { role = 'Driver' }) {
    this.need(p, 'family');
    const t = D.EVENT_TEMPLATES.heist;
    if (!t.roles.includes(role)) fail('No such role');
    this.cool(p, 'heist', 120);
    this.spendAnyCash(p, 300);
    const district = ['industrial', 'docks', 'riverfront'].includes(p.district) ? p.district : 'industrial';
    const e = this.createEvent('heist', { createdBy: p.id, district });
    this.seat(e, role, p);
    return { message: `Heist planned at ${e.location}. Fill the crew.`, eventId: e.id };
  }

  a_call_sitdown(p, { targetId }) {
    this.need(p, 'family');
    const t = this.player(targetId) ?? fail('No such person');
    if (t.id === p.id) fail('You can talk to yourself for free');
    this.cool(p, 'sitdown', 180);
    const e = this.createEvent('sitdown', { createdBy: p.id, district: p.district, target: { playerId: t.id, name: t.name } });
    e.title = `Sit-Down: ${p.name} & ${t.name}`;
    e.roles.find((r) => r.role === 'Guest').reservedFor = t.id;
    this.seat(e, 'Host', p);
    this.notify(t.id, `${p.name} requests a sit-down in ${this.state.districts[p.district].name}. Come alone.`, 'warn');
    return { message: `Invitation sent to ${t.name}.`, eventId: e.id };
  }

  // ------------------------------------------------------------------ board

  a_buy_asset(p, { assetId }) {
    this.need(p, 'board');
    const a = this.getAsset(assetId);
    if (a.ownerId === p.id) fail('You already own it');
    const owner = a.ownerId ? this.player(a.ownerId) : null;
    if (owner && !owner.isNpc) fail(`${owner.name} owns it. Make them an offer at a board meeting.`);
    const price = Math.round(a.value / 100 * (owner ? 1.5 : 1));
    this.spend(p, 'cash', price, 'clean cash');
    if (owner) owner.cash += price;
    a.ownerId = p.id;
    a.dirty = 0;
    a.partnerId = null;
    this.addRep(p, 2);
    this.news(`${a.name} changes hands: ${p.name} is the new owner.`, a.district);
    return { message: `Bought ${a.name} for $${price}.${a.trail > 10 ? ' The old books come with it.' : ''}` };
  }

  a_sell_asset(p, { assetId }) {
    const a = this.getAsset(assetId);
    if (a.ownerId !== p.id) fail('Not yours to sell');
    const price = Math.round(a.value / 100 * 0.7);
    p.cash += price;
    a.ownerId = null;
    a.dirty = 0;
    a.partnerId = null;
    return { message: `Sold ${a.name} to the city for $${price}.` };
  }

  a_set_dirty(p, { assetId, level }) {
    const a = this.getAsset(assetId);
    if (a.ownerId !== p.id) fail('Not your books');
    level = Math.floor(Number(level));
    if (!(level >= 0 && level <= 3)) fail('Dirty level is 0–3');
    a.dirty = level;
    return { message: `${a.name}: books set to "${['clean', 'skimming', 'laundering', 'full front'][level]}".` };
  }

  a_set_partner(p, { assetId, partnerId, cut }) {
    const a = this.getAsset(assetId);
    if (a.ownerId !== p.id) fail('Not your company');
    if (partnerId) {
      const f = this.player(partnerId) ?? fail('No such person');
      if (f.faction !== 'family') fail('Only Family money needs washing');
      a.partnerId = f.id;
      this.notify(f.id, `${p.name} will wash your money through ${a.name} (${a.cut}% cut).`, 'good');
    } else a.partnerId = null;
    if (cut !== undefined) a.cut = clamp(Math.floor(Number(cut)) || 0, 5, 50);
    return { message: partnerId ? `${a.name} now fronts for ${this.nameOf(partnerId)} at ${a.cut}%.` : `${a.name} no longer fronts for anyone.` };
  }

  a_bury_paper(p, { assetId, caseId }) {
    this.need(p, 'board');
    this.cool(p, 'bury', 45);
    if (caseId) {
      const c = this.getCase(caseId);
      if (!c.rumored) fail('You don\'t know about that case');
      if (!['building', 'trial'].includes(c.status)) fail('That case is closed');
      const order = ['Inconclusive', 'Partial', 'Collected', 'Verified'];
      const paper = c.evidence.filter((e) => /Record|Ledger|Transfer|Financial/.test(e.label) && e.status !== 'Inconclusive');
      if (!paper.length) fail('There is no paper left to bury');
      this.spend(p, 'cash', 600, 'clean cash');
      const e = paper.sort((x, y) => order.indexOf(y.status) - order.indexOf(x.status))[0];
      e.status = order[order.indexOf(e.status) - 1];
      this.addHeat(p, 3);
      return { message: `${e.label} is now "${e.status}". Shredders are running late tonight.` };
    }
    const a = this.getAsset(assetId);
    if (a.ownerId !== p.id) fail('Not your books');
    this.spend(p, 'cash', 400, 'clean cash');
    a.trail = clamp(a.trail - 15, 0, 100);
    return { message: `Cleaned up ${a.name}'s paper trail.` };
  }

  a_lobby(p) {
    this.need(p, 'board');
    this.cool(p, 'lobby', 60);
    this.spend(p, 'cash', 400, 'clean cash');
    p.influence += 6;
    return { message: `Dinner with ${this.state.officials.mayor.name}'s staff. +6 influence.` };
  }

  a_call_meeting(p, { assetId, proposal, buyerId, price }) {
    this.need(p, 'board');
    const a = this.getAsset(assetId);
    if (!a.ownerId) fail('The city owns that — just buy it');
    if (!['sell', 'report'].includes(proposal)) fail('Propose "sell" or "report"');
    let buyer = null;
    price = Math.floor(Number(price)) || Math.round(a.value / 100);
    if (proposal === 'sell') {
      buyer = this.player(buyerId) ?? fail('Who is buying?');
      if (buyer.id === a.ownerId) fail('They already own it');
    }
    this.cool(p, 'meeting', 120);
    this.spend(p, 'influence', 5);
    const e = this.createEvent('board_meeting', {
      createdBy: p.id, district: a.district,
      target: { assetId: a.id, assetName: a.name, proposal, buyerId: buyer?.id ?? null, buyerName: buyer?.name ?? null, price },
    });
    e.title = proposal === 'sell' ? `Board Meeting — Sell ${a.name} to ${buyer.name}` : `Board Meeting — Report ${a.name}`;
    this.seat(e, 'Chair', p);
    const owner = this.player(a.ownerId);
    if (owner && owner.faction === 'board' && owner.id !== p.id) {
      this.seat(e, 'Seat 2', owner);
      this.notify(owner.id, `The board is voting on your ${a.name}.`, 'warn');
    }
    return { message: 'Meeting called.', eventId: e.id };
  }

  // ------------------------------------------------------------------ badge

  a_patrol(p) {
    this.need(p, 'badge');
    this.cool(p, 'patrol', 40);
    const d = this.state.districts[p.district];
    d.presence = clamp(d.presence + 6, 0, 100);
    p.influence += 2;
    p.patrolUntil = this.now() + 120000;
    const hot = Object.values(this.state.assets).filter((a) => a.district === d.id && a.trail > 20);
    const tip = hot.length && this.chance(0.5) ? ` A bartender mentions ${this.pick(hot).name} keeps odd hours.` : '';
    return { message: `On patrol in ${d.name} for 2 minutes. +2 influence.${tip}` };
  }

  a_crackdown(p) {
    this.need(p, 'badge');
    this.cool(p, 'crackdown', 120);
    this.spend(p, 'influence', 20);
    const d = this.state.districts[p.district];
    d.presence = clamp(d.presence + 20, 0, 100);
    this.districtHeat(d.id, -10);
    this.addHeat(p, 5);
    let broke = '';
    const holder = d.holderId ? this.player(d.holderId) : null;
    if (holder && d.presence >= 70 && this.chance(0.5)) {
      d.holderId = null;
      this.addRep(holder, -5);
      this.notify(holder.id, `A police crackdown broke your hold on ${d.name}.`, 'bad');
      broke = ` ${holder.name} lost the block.`;
    }
    this.news(`Crackdown in ${d.name}: checkpoints on every corner.${broke}`, d.id);
    return { message: `Crackdown launched.${broke}` };
  }

  a_open_case(p, { targetType, targetId }) {
    this.need(p, 'badge');
    if (targetType === 'asset' && !this.state.assets[targetId]) fail('No such asset');
    const before = Object.keys(this.state.cases).length;
    this.spend(p, 'influence', 10);
    let c;
    try { c = this.openCase(p, targetType, targetId); } catch (e) { p.influence += 10; throw e; }
    if (Object.keys(this.state.cases).length === before) {
      p.influence += 10;
      return { message: `There's already an open file on ${c.targetName} (#${c.id}).`, caseId: c.id };
    }
    return { message: `Case file #${c.id} opened on ${c.targetName}.`, caseId: c.id };
  }

  workableCase(p, caseId) {
    this.need(p, 'badge');
    const c = this.getCase(caseId);
    if (c.status !== 'building') fail('That file is no longer being built');
    return c;
  }

  a_investigate(p, { caseId }) {
    const c = this.workableCase(p, caseId);
    this.cool(p, 'investigate', 45);
    const dirt = this.targetDirt(c);
    p.influence += 1;
    if (!this.chance(0.3 + dirt / 150)) return { message: 'Legwork, coffee, nothing useful.' };
    const k = this.pick(D.EVIDENCE_KINDS);
    const r = this.rng() * 100;
    const status = r < dirt * 0.5 ? 'Verified' : r < dirt ? 'Collected' : r < dirt + 30 ? 'Partial' : 'Inconclusive';
    this.addEvidence(c, k.label, k.weight, status, p.name);
    return { message: `New evidence: ${k.label} (${status}).` };
  }

  a_subpoena(p, { caseId }) {
    const c = this.workableCase(p, caseId);
    this.cool(p, 'subpoena', 30);
    this.spend(p, 'influence', 15);
    const trail = c.targetType === 'asset' ? this.state.assets[c.targetId]?.trail ?? 0 : (this.player(c.targetId)?.dirtyCash ?? 0) / 100;
    const status = trail >= 40 ? 'Verified' : trail >= 20 ? 'Collected' : trail >= 8 ? 'Partial' : 'Inconclusive';
    this.addEvidence(c, 'Financial Records', 14, status, 'Subpoena');
    return { message: `Subpoenaed records came back ${status.toLowerCase()}.` };
  }

  a_interview(p, { caseId }) {
    const c = this.workableCase(p, caseId);
    if (c.witnesses.length >= 4) fail('You\'ve talked to everyone who will talk');
    this.cool(p, 'interview', 30);
    this.spend(p, 'influence', 10);
    const name = this.pick(['a night janitor', 'a dock foreman', 'a bartender', 'a bookkeeper', 'a delivery driver', 'a neighbor']);
    if (this.chance(0.35 + this.targetDirt(c) / 200)) {
      c.witnesses.push({ id: this.id('w'), name, status: 'cooperating' });
      this.checkRumor(c);
      return { message: `${name[0].toUpperCase() + name.slice(1)} agreed to testify.` };
    }
    return { message: `${name[0].toUpperCase() + name.slice(1)} saw nothing, knows nothing.` };
  }

  a_offer_deal(p, { caseId }) {
    const c = this.workableCase(p, caseId);
    this.cool(p, 'deal', 60);
    this.addHeat(p, 10);
    const w = c.witnesses.find((x) => x.status === 'intimidated');
    if (w) {
      w.status = 'cooperating';
      return { message: `${w.name} takes the deal and remembers again. (+10 heat)` };
    }
    c.witnesses.push({ id: this.id('w'), name: 'a small-time snitch', status: 'cooperating' });
    this.addEvidence(c, 'Snitch Statement', 10, 'Verified', 'Deal');
    return { message: 'A snitch trades testimony for a lighter sentence. (+10 heat)' };
  }

  a_request_raid(p, { caseId }) {
    const c = this.workableCase(p, caseId);
    if (Object.values(this.state.events).some((e) => e.type === 'raid' && e.target?.caseId === c.id && ['open', 'live'].includes(e.status))) {
      fail('A raid on that target is already being planned');
    }
    this.spend(p, 'influence', 30);
    const e = this.createEvent('raid', { createdBy: p.id, district: c.district, target: { caseId: c.id, name: c.targetName } });
    e.title = `Raid on ${c.targetName}`;
    this.seat(e, 'Lead', p);
    this.seatJudge(e);
    return { message: 'Raid requested. Get backup.', eventId: e.id };
  }

  a_overreach(p, { caseId }) {
    const c = this.workableCase(p, caseId);
    if (c.overreach >= 2) fail('Any more and IA will be at your door');
    this.cool(p, 'overreach', 30);
    this.addHeat(p, 20);
    c.overreach++;
    this.checkRumor(c);
    return { message: 'You cut corners. The file got stronger. So did your heat. (+20 heat)' };
  }

  a_submit_da(p, { caseId }) {
    const c = this.workableCase(p, caseId);
    const s = this.strength(c);
    if (s < 35) fail(`The DA won't look at a ${s}% file (need 35%)`);
    c.status = 'trial';
    c.submittedBy = p.id;
    c.trialEndsAt = this.now() + this.cfg.trialMs;
    c.rumored = true;
    this.news(`The DA takes ${c.targetName} to trial. ${this.state.officials.judge.name} presiding.`, c.district);
    this.notify(this.caseOwnerId(c), `You're going to trial (case #${c.id}). Lawyer up — or lean on someone.`, 'bad');
    return { message: `Submitted to the DA at ${s}%. Trial in ${Math.round(this.cfg.trialMs / 1000)}s.` };
  }

  a_close_case(p, { caseId }) {
    const c = this.workableCase(p, caseId);
    c.status = 'closed';
    if (this.strength(c) >= 50) {
      this.addHeat(p, 5);
      return { message: 'You closed a strong file. People in IA noticed. (+5 heat)' };
    }
    return { message: 'File closed.' };
  }

  a_accept_bribe(p, { bribeId }) {
    const b = this.state.bribes[bribeId];
    if (!b || b.toId !== p.id) fail('No such envelope');
    delete this.state.bribes[bribeId];
    p.dirtyCash += b.amount;
    p.corruption += b.amount;
    this.addHeat(p, 5);
    const from = this.player(b.fromId);
    if (from) this.addRep(from, 2);
    let extra = '';
    const c = b.caseId ? this.state.cases[b.caseId] : null;
    if (c && ['building', 'trial'].includes(c.status)) {
      c.tampered++;
      extra = ` Case #${c.id} just got a little weaker.`;
    }
    this.notify(b.fromId, `${p.name} kept the envelope.${extra}`, 'good');
    return { message: `You pocket $${b.amount}. Nobody has to know.${extra}` };
  }

  a_report_bribe(p, { bribeId }) {
    const b = this.state.bribes[bribeId];
    if (!b || b.toId !== p.id) fail('No such envelope');
    delete this.state.bribes[bribeId];
    p.influence += 8;
    this.addRep(p, 3);
    const from = this.player(b.fromId);
    if (from) {
      this.addHeat(from, 15);
      this.addRep(from, -3);
      const c = this.openCase(p, 'player', from.id);
      this.addEvidence(c, 'Bribe Attempt', 15, 'Verified', p.name);
      this.notify(from.id, `${p.name} turned your envelope in as evidence.`, 'bad');
    }
    return { message: 'Envelope logged into evidence. +8 influence.' };
  }

  // ----------------------------------------------------------------- events

  createEvent(type, { createdBy = null, district, target = null }) {
    const t = D.EVENT_TEMPLATES[type];
    const now = this.now();
    const e = {
      id: this.id('ev'), type, title: t.title, objective: t.objective, district,
      location: type === 'heist' ? `${this.state.districts[district].name} — Pier ${this.rand(2, 40)}` : this.state.districts[district].name,
      createdBy, createdAt: now, startsAt: now + this.cfg.eventLeadMs, liveAt: 0, endsAt: 0, status: 'open',
      roles: t.roles.map((role) => ({ role, playerId: null, name: null, npc: false, ready: false })),
      payout: type === 'heist' ? this.rand(t.payout[0], t.payout[1]) : 0,
      heatIfFailed: t.heatIfFailed ?? 0, target, votes: {}, betrayal: null, result: null,
    };
    this.state.events[e.id] = e;
    this.say(`event:${e.id}`, `${e.title} planned at ${e.location}. Timer paused until all roles are filled.`);
    return e;
  }

  seat(e, role, p) {
    const r = e.roles.find((x) => x.role === role) ?? fail('No such role');
    Object.assign(r, { playerId: p.id, name: p.name, npc: p.isNpc, ready: p.isNpc });
  }

  seatJudge(e) {
    const j = this.state.officials.judge;
    Object.assign(e.roles.find((r) => r.role === 'Judge'), { playerId: null, name: j.name, npc: true, ready: true });
  }

  roleAllowed(e, role, p) {
    const f = D.EVENT_TEMPLATES[e.type].roleFaction[role.role];
    if (f === 'official') return false;
    if (role.reservedFor && role.reservedFor !== p.id) return false;
    return f === null || f === undefined || f === p.faction;
  }

  a_join_event(p, { eventId, role }) {
    const e = this.getEvent(eventId);
    if (e.status !== 'open') fail('Too late to join');
    if (e.roles.some((r) => r.playerId === p.id)) fail('You already have a role');
    const r = e.roles.find((x) => x.role === role) ?? fail('No such role');
    if (r.playerId || r.name) fail('Role taken');
    if (!this.roleAllowed(e, r, p)) fail(`That role isn't for ${D.FACTIONS[p.faction].name}`);
    this.seat(e, role, p);
    this.say(`event:${e.id}`, `${p.name} is in as ${role}.`);
    return { message: `You're the ${role}.`, eventId: e.id };
  }

  a_leave_event(p, { eventId }) {
    const e = this.getEvent(eventId);
    const r = e.roles.find((x) => x.playerId === p.id) ?? fail('You are not in it');
    if (e.status !== 'open') {
      // Walking out of a live scene is a small betrayal of its own.
      this.addRep(p, -5);
      this.addHeat(p, 5);
    }
    Object.assign(r, { playerId: null, name: null, npc: false, ready: false });
    this.say(`event:${e.id}`, `${p.name} walked away from the ${r.role} spot.`);
    if (e.roles.every((x) => !x.playerId || x.npc) && e.status === 'open') this.cancelEvent(e, 'Everyone walked.');
    return { message: 'You left.' };
  }

  a_ready_event(p, { eventId }) {
    const e = this.getEvent(eventId);
    const r = e.roles.find((x) => x.playerId === p.id) ?? fail('You are not in it');
    if (e.status !== 'open') fail('Already underway');
    r.ready = !r.ready;
    return { message: r.ready ? 'Ready.' : 'Not ready.' };
  }

  a_vote(p, { eventId, choice }) {
    const e = this.getEvent(eventId);
    if (e.status !== 'live') fail('Not in session');
    const r = e.roles.find((x) => x.playerId === p.id) ?? fail('You have no seat at this table');
    const valid = e.type === 'board_meeting' ? ['yes', 'no'] : e.type === 'sitdown' ? ['deal', 'warning', 'hit'] : [];
    if (!valid.includes(choice)) fail(`Choose ${valid.join(' / ')}`);
    if (e.type === 'sitdown' && r.role === 'Witness') fail('Witnesses watch. That\'s the job.');
    e.votes[p.id] = choice;
    if (e.type === 'board_meeting') this.say(`event:${e.id}`, `${p.name} votes ${choice.toUpperCase()}.`);
    this.maybeResolveEarly(e);
    return { message: `You chose ${choice}.` };
  }

  a_betray(p, { eventId, how }) {
    const e = this.getEvent(eventId);
    if (e.type !== 'heist' || e.status !== 'live') fail('Nothing to betray right now');
    const r = e.roles.find((x) => x.playerId === p.id) ?? fail('You are not on this crew');
    if (e.betrayal) fail('Someone beat you to it');
    if (how === 'run' && r.role !== 'Fence') fail('Only the Fence is holding the goods');
    if (!['run', 'snitch'].includes(how)) fail('Run or snitch?');
    e.betrayal = { by: p.id, how };
    this.resolveEvent(e);
    return { message: how === 'run' ? 'You ran with the take.' : 'You made a call.' };
  }

  cancelEvent(e, why) {
    e.status = 'cancelled';
    e.result = { summary: why };
    this.say(`event:${e.id}`, `Called off: ${why}`);
  }

  fillWithNpcs(e) {
    const s = this.state;
    for (const r of e.roles) {
      if (r.playerId || r.name) continue;
      if (r.reservedFor) {
        const g = this.player(r.reservedFor);
        if (g?.isNpc) this.seat(e, r.role, g);
        continue;
      }
      const taken = new Set(e.roles.map((x) => x.playerId));
      const pool = Object.values(s.players).filter((p) => p.isNpc && !taken.has(p.id) && p.jailedUntil <= this.now() && this.roleAllowed(e, r, p));
      if (!pool.length) continue;
      const npc = this.pick(pool);
      this.seat(e, r.role, npc);
      this.say(`event:${e.id}`, `${npc.name} takes the ${r.role} spot.`, npc.id);
    }
  }

  goLive(e) {
    e.status = 'live';
    e.liveAt = this.now();
    e.endsAt = e.liveAt + this.cfg.eventLiveMs;
    this.say(`event:${e.id}`, `${e.title} is LIVE.`);
    for (const r of e.roles) this.notify(r.playerId, `${e.title} just went live.`, 'warn');
    if (e.type === 'board_meeting' || e.type === 'sitdown') {
      for (const r of e.roles) {
        if (!r.npc || !r.playerId) continue;
        const npc = this.player(r.playerId);
        if (e.type === 'board_meeting') {
          const a = this.state.assets[e.target.assetId];
          const owner = a?.ownerId === npc.id;
          const yes = e.target.proposal === 'report' ? !owner && this.chance(0.3 + (a?.dirty ?? 0) * 0.1) : owner ? this.chance(0.3) : this.chance(0.5);
          e.votes[npc.id] = yes ? 'yes' : 'no';
        } else if (r.role !== 'Witness') {
          e.votes[npc.id] = this.chance(0.1) ? 'hit' : this.chance(0.5) ? 'warning' : 'deal';
        }
      }
      this.maybeResolveEarly(e);
    }
  }

  maybeResolveEarly(e) {
    const voters = e.roles.filter((r) => r.playerId && !(e.type === 'sitdown' && r.role === 'Witness'));
    if (e.status === 'live' && voters.every((r) => e.votes[r.playerId])) this.resolveEvent(e);
  }

  resolveEvent(e) {
    if (e.status === 'resolved') return;
    e.status = 'resolved';
    const fn = { heist: this.resolveHeist, raid: this.resolveRaid, board_meeting: this.resolveMeeting, sitdown: this.resolveSitdown }[e.type];
    e.result = fn.call(this, e);
    this.say(`event:${e.id}`, e.result.summary);
    for (const r of e.roles) this.notify(r.playerId, `${e.title}: ${e.result.summary}`, e.result.ok ? 'good' : 'bad');
  }

  resolveHeist(e) {
    const d = this.state.districts[e.district];
    const crew = e.roles.filter((r) => r.playerId).map((r) => ({ role: r.role, p: this.player(r.playerId) }));
    const cops = this.patrollersIn(e.district);
    const cuts = D.EVENT_TEMPLATES.heist.cuts;
    this.news(`Sirens near ${e.location}.`, e.district);

    if (e.betrayal?.how === 'run') {
      const f = this.player(e.betrayal.by);
      f.dirtyCash += e.payout;
      this.betrayed(f);
      for (const { p } of crew) if (p.id !== f.id) this.addHeat(p, 10);
      this.news(`${f.name} ran off with the take from ${e.location}.`, e.district);
      return { ok: false, summary: `${f.name} ran with the whole $${e.payout}. The rest of the crew is holding the bag.` };
    }
    if (e.betrayal?.how === 'snitch') {
      const rat = this.player(e.betrayal.by);
      this.betrayed(rat);
      const officer = rat.faction === 'badge' ? rat : this.pick(Object.values(this.state.players).filter((p) => p.faction === 'badge'));
      for (const { p } of crew) {
        if (p.id === rat.id) continue;
        this.addHeat(p, e.heatIfFailed);
        if (officer && officer.id !== p.id) this.addEvidence(this.openCase(officer, 'player', p.id), 'Snitch Statement', 18, 'Verified', rat.name);
      }
      if (rat.faction === 'badge') { rat.influence += 15; this.addRep(rat, 6); }
      else rat.cash += 1000;
      this.districtHeat(e.district, 15);
      return { ok: false, summary: 'The cops were waiting. Someone talked.' };
    }

    const humans = crew.filter(({ p }) => !p.isNpc);
    let odds = 0.6 + humans.reduce((s, { p }) => s + clamp(p.rep, 0, 40) / 800, 0) - d.presence / 300 - cops.length * 0.12;
    odds = clamp(odds, 0.1, 0.92);
    if (this.chance(odds)) {
      for (const { role, p } of crew) {
        p.dirtyCash += Math.round(e.payout * cuts[role] / 100);
        this.addHeat(p, 8);
        this.addRep(p, 3);
        p.stats.heists++;
      }
      this.districtHeat(e.district, 8);
      return { ok: true, summary: `Clean getaway. $${e.payout} split by role.`, odds };
    }
    for (const { p } of crew) {
      this.addHeat(p, e.heatIfFailed);
      this.addRep(p, -1);
      for (const cop of cops) {
        if (cop.id !== p.id) this.addEvidence(this.openCase(cop, 'player', p.id), 'Surveillance Logs', 12, 'Collected', `${e.title}`);
      }
    }
    this.districtHeat(e.district, 15);
    return { ok: false, summary: `The truck left empty. Everyone eats +${e.heatIfFailed} heat.`, odds };
  }

  betrayed(p) {
    // Betrayal is cheap the first time and expensive after that.
    this.addRep(p, p.betrayals === 0 ? -10 : -30 * p.betrayals);
    p.betrayals++;
  }

  resolveRaid(e) {
    const c = this.state.cases[e.target.caseId];
    const lead = this.player(e.createdBy);
    const officers = e.roles.filter((r) => r.playerId).map((r) => this.player(r.playerId));
    if (!c || c.status !== 'building') return { ok: false, summary: 'The case was closed before the door came down.' };
    const ownerId = this.caseOwnerId(c);
    const owner = this.player(ownerId);
    const j = this.state.officials.judge;
    const pocket = ownerId ? j.pockets[ownerId] ?? 0 : 0;
    if (this.chance(j.corruption * 0.3 + Math.min(0.6, pocket / 3000))) {
      if (lead) this.addHeat(lead, 10);
      return { ok: false, summary: `${j.name} refused to sign the warrant. The raid was called off at the door.` };
    }
    const dirt = this.targetDirt(c);
    const backup = officers.length - 1;
    if (dirt >= 15 || this.chance(0.2 + backup * 0.1)) {
      this.addEvidence(c, 'Surveillance Logs', 12, 'Verified', 'Raid');
      this.addEvidence(c, 'Financial Records', 14, dirt > 50 ? 'Verified' : 'Collected', 'Raid');
      if (owner) {
        const seized = Math.round(owner.dirtyCash * 0.3);
        owner.dirtyCash -= seized;
        this.addHeat(owner, 15);
        this.notify(owner.id, `The Badge raided ${c.targetName} and seized $${seized}.`, 'bad');
      }
      if (c.targetType === 'asset') this.state.assets[c.targetId].dirty = 0;
      for (const o of officers) { o.influence += 8; this.addRep(o, 4); }
      this.news(`Police raid ${c.targetName}. Boxes of paper carried out.`, e.district);
      return { ok: true, summary: `Warrant served. Evidence seized from ${c.targetName}.` };
    }
    if (lead) { this.addHeat(lead, 15); this.addRep(lead, -4); }
    if (owner) this.addRep(owner, 4);
    this.news(`A raid on ${c.targetName} turned up nothing. Their lawyers are smiling.`, e.district);
    return { ok: false, summary: 'Nothing found. The lead eats +15 heat.' };
  }

  resolveMeeting(e) {
    const a = this.state.assets[e.target.assetId];
    const votes = Object.values(e.votes);
    const yes = votes.filter((v) => v === 'yes').length;
    const no = votes.length - yes;
    if (!a || yes <= no) return { ok: false, summary: `Motion fails ${yes}–${no}.` };
    if (e.target.proposal === 'sell') {
      const buyer = this.player(e.target.buyerId);
      const seller = this.player(a.ownerId);
      if (!buyer || buyer.cash + buyer.dirtyCash < e.target.price) return { ok: false, summary: `Motion passes ${yes}–${no}, but ${e.target.buyerName} can't cover $${e.target.price}.` };
      this.spendAnyCash(buyer, e.target.price);
      if (seller) seller.cash += e.target.price;
      a.ownerId = buyer.id;
      a.partnerId = null;
      this.news(`${a.name} sold to ${buyer.name} by board vote.`, a.district);
      return { ok: true, summary: `Motion passes ${yes}–${no}. ${a.name} now belongs to ${buyer.name}.` };
    }
    const cops = Object.values(this.state.players).filter((p) => p.faction === 'badge');
    const officer = cops.find((p) => !p.isNpc && p.online) ?? cops[0];
    if (!officer) return { ok: false, summary: 'Motion passes, but nobody at the precinct picks up.' };
    const c = this.openCase(officer, 'asset', a.id);
    this.addEvidence(c, 'Insider Testimony', 20, 'Verified', 'Board');
    this.addEvidence(c, 'Shipping Ledger Anomaly', 16, a.trail >= 30 ? 'Verified' : 'Partial', 'Board');
    this.notify(officer.id, `The board handed you ${a.name}'s books. Case #${c.id}.`, 'good');
    return { ok: true, summary: `Motion passes ${yes}–${no}. The books go to the Badge.` };
  }

  resolveSitdown(e) {
    const host = this.player(e.roles.find((r) => r.role === 'Host').playerId);
    const guestRole = e.roles.find((r) => r.role === 'Guest');
    const guest = this.player(guestRole.playerId);
    const witness = this.player(e.roles.find((r) => r.role === 'Witness').playerId);
    if (!host || !guest) return { ok: false, summary: 'Somebody didn\'t show.' };
    const hv = e.votes[host.id] ?? 'warning';
    const gv = e.votes[guest.id] ?? 'deal';
    const hit = (killer, victim) => {
      this.loseLife(victim, `${killer.name} settled things at a sit-down`);
      this.addHeat(killer, 30);
      this.addRep(killer, 6);
      this.districtHeat(e.district, 20);
      if (witness?.faction === 'badge') this.addEvidence(this.openCase(witness, 'player', killer.id), 'Eyewitness Statement', 25, 'Verified', witness.name);
      this.news(`A body turned up in ${this.state.districts[e.district].name}.`, e.district);
      return { ok: true, summary: `It ended with a body. ${victim.name} loses a life.` };
    };
    if (hv === 'hit' && gv === 'hit') {
      const hostWins = this.chance(0.5 + (host.rep - guest.rep) / 200);
      return hostWins ? hit(host, guest) : hit(guest, host);
    }
    if (hv === 'hit') return hit(host, guest);
    if (gv === 'hit') return hit(guest, host);
    if (hv === 'deal' && gv === 'deal') {
      for (const p of [host, guest]) { this.addRep(p, 5); p.influence += 5; }
      return { ok: true, summary: 'Hands shaken. A deal is a deal.' };
    }
    if (hv === 'warning' && gv === 'warning') return { ok: false, summary: 'Two warnings. Nobody blinked. This isn\'t over.' };
    const warner = hv === 'warning' ? host : guest;
    const other = warner === host ? guest : host;
    this.addRep(warner, 4);
    this.addRep(other, -3);
    return { ok: true, summary: `${warner.name} delivered a warning. ${other.name} heard it.` };
  }

  loseLife(p, why) {
    p.lives--;
    this.notify(p.id, `You lost a life: ${why}.`, 'bad');
    if (p.lives > 0) return;
    // Burned: start over as a civilian, but reputation sticks.
    for (const d of Object.values(this.state.districts)) if (d.holderId === p.id) d.holderId = null;
    Object.assign(p, { lives: 3, cash: 500, dirtyCash: 0, heat: 0, influence: 5, faction: p.isNpc ? p.faction : 'civilian' });
    if (!p.isNpc) this.news(`${p.name} is out of the life. Starting over, same name, same reputation.`, p.district);
  }

  // ------------------------------------------------------------------ trials

  resolveTrial(c) {
    const j = this.state.officials.judge;
    const ownerId = this.caseOwnerId(c);
    const owner = this.player(ownerId);
    const pocket = ownerId ? j.pockets[ownerId] ?? 0 : 0;
    const strength = this.strength(c) - Math.min(20, pocket / 100);
    const bar = 50 + this.rng() * 20 + j.corruption * 10;
    const officer = this.player(c.submittedBy ?? c.officerId);
    if (strength >= bar) {
      c.status = 'convicted';
      if (owner) {
        owner.dirtyCash = 0;
        owner.cash = Math.round(owner.cash * 0.7);
        owner.heat = 0;
        owner.jailedUntil = this.now() + this.cfg.jailMs;
        owner.stats.timesConvicted++;
        this.loseLife(owner, `convicted (case #${c.id})`);
      }
      if (c.targetType === 'asset') Object.assign(this.state.assets[c.targetId], { ownerId: null, dirty: 0, trail: 0, partnerId: null });
      if (officer) { officer.influence += 20; this.addRep(officer, 10); officer.stats.convictions++; }
      this.state.districts[c.district].presence = clamp(this.state.districts[c.district].presence + 15, 0, 100);
      this.news(`GUILTY. ${c.targetName} goes down. ${c.targetType === 'asset' ? 'The city seizes the property.' : ''}`, c.district);
    } else {
      c.status = 'acquitted';
      if (officer) {
        officer.influence = Math.max(0, officer.influence - 10);
        this.addRep(officer, -5);
        if (c.overreach) this.addHeat(officer, 15 * c.overreach);
      }
      if (owner) this.addRep(owner, 5);
      this.news(`Not guilty. ${c.targetName} walks out of ${j.name}'s courtroom.`, c.district);
    }
    this.notify(officer?.id, `Case #${c.id}: ${c.status.toUpperCase()}.`, c.status === 'convicted' ? 'good' : 'bad');
  }

  // -------------------------------------------------------------------- tick

  tick() {
    const s = this.state;
    const t = this.now();
    this.tickCount++;

    // Businesses tick income; dirty books leave a paper trail; territory takes tax.
    for (const a of Object.values(s.assets)) {
      const owner = a.ownerId ? this.player(a.ownerId) : null;
      if (!owner) continue;
      const d = s.districts[a.district];
      const gross = a.income * (1 + a.dirty * 0.5);
      const holder = d.holderId && d.holderId !== owner.id ? this.player(d.holderId) : null;
      const tax = holder ? gross * d.businessTax / 100 : 0;
      owner.cash += Math.round(gross - tax);
      if (holder) holder.dirtyCash += Math.round(tax);
      a.trail = clamp(a.trail + a.dirty * 0.15, 0, 100);
    }

    for (const p of Object.values(s.players)) {
      p.heat = clamp(Math.round((p.heat - this.cfg.heatDecay) * 10) / 10, 0, 100);
    }
    for (const d of Object.values(s.districts)) {
      d.heat = clamp(Math.round((d.heat + (d.baseHeat - d.heat) * 0.03) * 10) / 10, 0, 100);
      if (this.tickCount % 6 === 0) d.presence = clamp(d.presence + Math.sign(20 - d.presence), 0, 100);
    }

    for (const e of Object.values(s.events)) {
      if (e.status === 'open') {
        if (t >= e.createdAt + this.cfg.npcFillMs) this.fillWithNpcs(e);
        const optional = D.EVENT_TEMPLATES[e.type].optional ?? [];
        const seated = e.roles.filter((r) => r.playerId || r.name);
        const allSeated = seated.length === e.roles.length;
        const filled = e.roles.every((r) => r.playerId || r.name || optional.includes(r.role));
        const ready = filled && seated.every((r) => r.ready) && (allSeated || t >= e.createdAt + this.cfg.npcFillMs);
        if (ready || (filled && t >= e.startsAt)) this.goLive(e);
        else if (!filled && t >= e.startsAt + this.cfg.eventAbandonMs) this.cancelEvent(e, 'Not enough people showed up.');
        else if (!filled && t >= e.startsAt) e.startsAt = t; // timer paused until roles are filled
      } else if (e.status === 'live' && t >= e.endsAt) {
        this.resolveEvent(e);
      }
    }
    // Forget old events.
    for (const e of Object.values(s.events)) {
      if (['resolved', 'cancelled'].includes(e.status) && t - (e.endsAt || e.startsAt) > 10 * 60000) {
        delete s.events[e.id];
        delete s.chat[`event:${e.id}`];
      }
    }

    for (const c of Object.values(s.cases)) {
      if (c.status === 'trial' && t >= c.trialEndsAt) this.resolveTrial(c);
    }

    for (const b of Object.values(s.bribes)) {
      if (t < b.expiresAt) continue;
      delete s.bribes[b.id];
      const from = this.player(b.fromId);
      if (from) { from.dirtyCash += b.amount; this.notify(from.id, `${this.nameOf(b.toId)} never picked up the envelope. Money returned.`); }
    }

    if (this.tickCount % this.cfg.directorEveryTicks === 0) runDirector(this);

    if (t - s.seasonStartedAt >= this.cfg.seasonMs) this.endSeason();
    this.changed();
  }

  endSeason() {
    const s = this.state;
    s.season++;
    s.seasonStartedAt = this.now();
    this.shuffleOfficials();
    for (const d of Object.values(s.districts)) { d.holderId = null; d.heat = d.baseHeat; d.presence = 20; }
    s.districts.suburbs.presence = 70;
    for (const p of Object.values(s.players)) { p.heat = Math.round(p.heat / 2); p.influence = Math.round(p.influence / 2); }
    for (const c of Object.values(s.cases)) if (c.status === 'building') c.status = 'closed';
    this.news(`Season ${s.season}: ${s.officials.mayor.name} takes office. ${s.officials.commissioner.name} runs the police. Every block is up for grabs.`);
    for (const d of Object.keys(s.districts)) this.say(`public:${d}`, `Season ${s.season} begins. New mayor, new commissioner, old grudges.`);
  }

  // -------------------------------------------------------------------- view

  clock() {
    const s = this.state;
    const el = this.now() - s.createdAt;
    const day = Math.floor(el / this.cfg.dayMs) + 1;
    const mins = Math.floor((el % this.cfg.dayMs) / this.cfg.dayMs * 1440);
    return { day, hour: Math.floor(mins / 60), minute: mins % 60 };
  }

  publicPlayer(p) {
    return {
      id: p.id, name: p.name, faction: p.faction, job: p.job, district: p.district, rep: p.rep,
      npc: p.isNpc, online: p.isNpc || p.online, jailed: p.jailedUntil > this.now(),
      heatBand: p.heat >= 60 ? 'HIGH' : p.heat >= 30 ? 'MED' : 'LOW',
    };
  }

  caseView(c, full) {
    const base = {
      id: c.id, targetType: c.targetType, targetId: c.targetId, targetName: c.targetName, district: c.district,
      status: c.status, strength: this.strength(c), officer: this.nameOf(c.officerId), rumored: c.rumored,
      trialEndsAt: c.trialEndsAt,
    };
    if (!full) return { ...base, witnesses: c.witnesses.map((w) => ({ status: w.status })) };
    const ownerId = this.caseOwnerId(c);
    return {
      ...base, officerId: c.officerId, evidence: c.evidence, witnesses: c.witnesses, overreach: c.overreach, tampered: c.tampered,
      risks: {
        intimidation: this.player(ownerId)?.faction === 'family' ? 'HIGH' : 'LOW',
        snitch: c.witnesses.length >= 2 ? 'MEDIUM' : 'LOW',
        political: (this.state.officials.judge.pockets[ownerId] ?? 0) > 1000 ? 'HIGH' : 'LOW',
      },
    };
  }

  viewFor(pid) {
    const s = this.state;
    const me = this.player(pid);
    if (!me) return null;
    const t = this.now();
    const districts = Object.values(s.districts).map((d) => ({
      id: d.id, name: d.name, heat: Math.round(d.heat), presence: d.presence, rackets: d.rackets, businessTax: d.businessTax, skim: d.skim,
      control: this.controllerOf(d), holderId: d.holderId, holder: d.holderId ? this.nameOf(d.holderId) : null,
    }));
    const suspected = new Set(Object.values(s.cases).filter((c) => c.rumored && c.targetType === 'asset' && ['building', 'trial'].includes(c.status)).map((c) => c.targetId));
    const assets = Object.values(s.assets).map((a) => {
      const mine = a.ownerId === me.id;
      return {
        id: a.id, name: a.name, type: a.type, district: a.district, value: a.value, income: a.income,
        ownerId: a.ownerId, owner: a.ownerId ? this.nameOf(a.ownerId) : 'For sale',
        price: Math.round(a.value / 100 * (a.ownerId ? 1.5 : 1)),
        suspected: suspected.has(a.id),
        mine, dirty: mine ? a.dirty : undefined, trail: mine ? Math.round(a.trail) : undefined,
        partnerId: mine || a.partnerId === me.id ? a.partnerId : undefined,
        partner: mine && a.partnerId ? this.nameOf(a.partnerId) : undefined,
        cut: a.cut, frontsForMe: a.partnerId === me.id,
      };
    });
    const events = Object.values(s.events).map((e) => ({
      id: e.id, type: e.type, title: e.title, objective: e.objective, district: e.district, location: e.location,
      status: e.status, startsAt: e.startsAt, liveAt: e.liveAt, endsAt: e.endsAt, payout: e.payout, heatIfFailed: e.heatIfFailed,
      target: e.target, result: e.result, cuts: e.type === 'heist' ? D.EVENT_TEMPLATES.heist.cuts : null,
      roles: e.roles.map((r) => ({
        role: r.role, playerId: r.playerId, name: r.name, npc: r.npc, ready: r.ready,
        open: !r.playerId && !r.name, canTake: !r.playerId && !r.name && this.roleAllowed(e, r, me),
      })),
      votes: e.type === 'board_meeting' ? Object.values(e.votes).reduce((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {}) : undefined,
      myVote: e.votes[me.id],
      mine: e.roles.some((r) => r.playerId === me.id),
    }));
    const isBadge = me.faction === 'badge';
    const cases = Object.values(s.cases)
      .filter((c) => (isBadge && c.targetId !== me.id) || c.rumored || c.status === 'trial')
      .filter((c) => ['building', 'trial'].includes(c.status) || t - c.createdAt < 30 * 60000)
      .map((c) => this.caseView(c, isBadge && c.targetId !== me.id));
    const bribes = Object.values(s.bribes).filter((b) => b.toId === me.id).map((b) => ({ ...b, from: this.nameOf(b.fromId) }));
    const cooldowns = {};
    for (const [k, v] of Object.entries(me.cooldowns)) if (v > t) cooldowns[k] = v;

    return {
      now: t,
      clock: this.clock(),
      season: s.season,
      seasonEndsAt: s.seasonStartedAt + this.cfg.seasonMs,
      officials: { mayor: s.officials.mayor.name, commissioner: s.officials.commissioner.name, judge: s.officials.judge.name },
      me: {
        id: me.id, name: me.name, faction: me.faction, job: me.job, cash: me.cash, dirtyCash: me.dirtyCash,
        heat: Math.round(me.heat), influence: me.influence, rep: me.rep, lives: me.lives, district: me.district,
        betrayals: me.betrayals, jailedUntil: me.jailedUntil, patrolUntil: me.patrolUntil, tracks: me.tracks,
        stats: me.stats, cooldowns, judgePocket: s.officials.judge.pockets[me.id] ?? 0,
      },
      districts, assets, events, cases, bribes,
      players: Object.values(s.players).map((p) => this.publicPlayer(p)),
      rooms: this.roomsFor(me),
      feed: s.feed.slice(0, 15),
      crimes: D.CRIMES,
    };
  }

  chatHistoryFor(pid) {
    const p = this.player(pid);
    return this.roomsFor(p).flatMap((room) => this.state.chat[room] ?? []);
  }

  serialize() { return JSON.stringify(this.state); }
}
