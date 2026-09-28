import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, GameError } from '../server/game.js';

// Deterministic clock + rng.
function setup({ rng = 0.5 } = {}) {
  let t = 1_000_000;
  const clock = { advance: (ms) => { t += ms; } };
  const r = typeof rng === 'function' ? rng : () => rng;
  const game = new Game({ now: () => t, rng: r, config: { directorEveryTicks: 1e9 } });
  return { game, clock };
}
const npc = (game, key) => Object.values(game.state.players).find((p) => p.npcKey === key);

test('new world has districts, assets, NPCs and territory', () => {
  const { game } = setup();
  assert.equal(Object.keys(game.state.districts).length, 5);
  assert.ok(Object.keys(game.state.assets).length >= 8);
  assert.equal(game.state.districts.docks.holderId, npc(game, 'russo').id);
  assert.equal(game.controllerOf(game.state.districts.suburbs), 'badge');
});

test('players start as civilians and choose a track', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Nico' });
  assert.equal(p.faction, 'civilian');
  game.act(p.id, 'choose_track', { faction: 'board' });
  assert.equal(p.faction, 'board');
  assert.equal(p.cash, 1200 + 2500);
  assert.throws(() => game.createPlayer({ name: 'nico' }), GameError, 'names are unique');
});

test('switching sides costs reputation and halves influence', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Turncoat' });
  game.act(p.id, 'choose_track', { faction: 'badge' });
  const inf = p.influence;
  game.act(p.id, 'choose_track', { faction: 'family' });
  assert.equal(p.rep, -15);
  assert.equal(p.influence, Math.floor(inf / 2));
});

test('hot players cannot join the Badge', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Hot' });
  p.heat = 50;
  assert.throws(() => game.act(p.id, 'choose_track', { faction: 'badge' }), /Cool off/);
});

test('crime pays dirty cash, raises heat, and pays the block holder a cut', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Sal', district: 'docks' });
  game.act(p.id, 'choose_track', { faction: 'family' });
  const russo = npc(game, 'russo');
  const before = russo.dirtyCash;
  const dirtyBefore = p.dirtyCash;
  game.act(p.id, 'crime', { kind: 'smuggle' });
  assert.ok(p.dirtyCash > dirtyBefore);
  assert.ok(p.heat > 0);
  assert.ok(russo.dirtyCash > before, 'holder gets racket cut');
  assert.throws(() => game.act(p.id, 'crime', { kind: 'smuggle' }), /cooldown/);
});

test('smuggling is only possible near the water', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Sal', district: 'suburbs' });
  game.act(p.id, 'choose_track', { faction: 'family' });
  assert.throws(() => game.act(p.id, 'crime', { kind: 'smuggle' }), /Can't do that/);
});

test('only the right faction can take faction actions', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Civ' });
  assert.throws(() => game.act(p.id, 'crime', { kind: 'shakedown' }), /Only Family/);
  assert.throws(() => game.act(p.id, 'patrol'), /Only Badge/);
});

test('board buys assets, cooks the books, and fronts for a family', () => {
  const { game, clock } = setup();
  const b = game.createPlayer({ name: 'Ava' });
  game.act(b.id, 'choose_track', { faction: 'board' });
  game.act(b.id, 'buy_asset', { assetId: 'elm-laundromat' });
  const a = game.state.assets['elm-laundromat'];
  assert.equal(a.ownerId, b.id);

  const f = game.createPlayer({ name: 'Frankie' });
  game.act(f.id, 'choose_track', { faction: 'family' });
  f.dirtyCash = 2000;
  game.act(b.id, 'set_partner', { assetId: a.id, partnerId: f.id, cut: 20 });
  assert.throws(() => game.act(f.id, 'launder', { amount: 1000, assetId: a.id }), /clean books/);
  game.act(b.id, 'set_dirty', { assetId: a.id, level: 2 });
  const cashB = b.cash;
  game.act(f.id, 'launder', { amount: 1000, assetId: a.id });
  assert.equal(f.dirtyCash, 1000);
  assert.equal(f.cash, 1200 + 800);
  assert.equal(b.cash, cashB + 200);
  assert.ok(a.trail > 0, 'laundering leaves a paper trail');

  const trail = a.trail;
  clock.advance(5000);
  game.tick();
  assert.ok(a.trail > trail, 'dirty books grow the trail every tick');
});

test('badge builds a case, submits to the DA, and a strong file convicts', () => {
  const { game, clock } = setup({ rng: 0.01 });
  const cop = game.createPlayer({ name: 'Det. Lane' });
  game.act(cop.id, 'choose_track', { faction: 'badge' });
  cop.influence = 200;
  const { caseId } = game.act(cop.id, 'open_case', { targetType: 'asset', targetId: 'marcone-construction' });
  const c = game.state.cases[caseId];
  assert.throws(() => game.act(cop.id, 'submit_da', { caseId }), /won't look/);
  game.act(cop.id, 'subpoena', { caseId });
  game.act(cop.id, 'investigate', { caseId });
  game.act(cop.id, 'interview', { caseId });
  game.act(cop.id, 'overreach', { caseId });
  clock.advance(60000);
  game.act(cop.id, 'investigate', { caseId });
  game.act(cop.id, 'overreach', { caseId });
  assert.ok(c.rumored, 'strong cases leak to the street');
  const s = game.strength(c);
  assert.ok(s >= 35, `strength ${s}`);
  game.act(cop.id, 'submit_da', { caseId });
  assert.equal(c.status, 'trial');
  clock.advance(game.cfg.trialMs + 1);
  game.tick();
  assert.equal(c.status, 'convicted');
  assert.equal(game.state.assets['marcone-construction'].ownerId, null, 'property is seized');
  assert.equal(npc(game, 'marcone').lives, 2);
});

test('acquittal after overreach burns the officer', () => {
  const { game, clock } = setup({ rng: 0.99 });
  const cop = game.createPlayer({ name: 'Det. Rash' });
  game.act(cop.id, 'choose_track', { faction: 'badge' });
  const { caseId } = game.act(cop.id, 'open_case', { targetType: 'asset', targetId: 'rivergate-tower' });
  const c = game.state.cases[caseId];
  c.evidence.push({ id: 'x', label: 'Financial Records', weight: 30, status: 'Verified', source: '' });
  game.act(cop.id, 'overreach', { caseId });
  game.act(cop.id, 'submit_da', { caseId });
  const heat = cop.heat;
  clock.advance(game.cfg.trialMs + 1);
  game.tick();
  assert.equal(c.status, 'acquitted');
  assert.ok(cop.heat > heat - 1);
});

test('witness intimidation and burying paper weaken a case', () => {
  const { game } = setup({ rng: 0.01 });
  const cop = game.createPlayer({ name: 'Det. A' });
  game.act(cop.id, 'choose_track', { faction: 'badge' });
  cop.influence = 100;
  const { caseId } = game.act(cop.id, 'open_case', { targetType: 'asset', targetId: 'velvet-room' });
  const c = game.state.cases[caseId];
  c.witnesses.push({ id: 'w1', name: 'a bartender', status: 'cooperating' });
  c.evidence.push({ id: 'e1', label: 'Financial Records', weight: 30, status: 'Verified', source: '' });
  game.checkRumor(c);
  assert.ok(c.rumored);
  const before = game.strength(c);

  const f = game.createPlayer({ name: 'Muscle' });
  game.act(f.id, 'choose_track', { faction: 'family' });
  game.act(f.id, 'intimidate', { caseId });
  assert.equal(c.witnesses[0].status, 'intimidated');

  const b = game.createPlayer({ name: 'Shredder' });
  game.act(b.id, 'choose_track', { faction: 'board' });
  game.act(b.id, 'bury_paper', { caseId });
  assert.equal(c.evidence[0].status, 'Collected');
  assert.ok(game.strength(c) < before);
});

test('envelopes: accepting weakens the case, reporting burns the briber', () => {
  const { game } = setup();
  const cop = game.createPlayer({ name: 'Det. Bent' });
  game.act(cop.id, 'choose_track', { faction: 'badge' });
  const { caseId } = game.act(cop.id, 'open_case', { targetType: 'asset', targetId: 'velvet-room' });
  const f = game.createPlayer({ name: 'Payer' });
  game.act(f.id, 'choose_track', { faction: 'family' });
  game.act(f.id, 'offer_bribe', { officerId: cop.id, amount: 300, caseId });
  const [b1] = Object.keys(game.state.bribes);
  game.act(cop.id, 'accept_bribe', { bribeId: b1 });
  assert.equal(cop.dirtyCash, 300);
  assert.equal(game.state.cases[caseId].tampered, 1);

  const clean = game.createPlayer({ name: 'Det. Clean' });
  game.act(clean.id, 'choose_track', { faction: 'badge' });
  f.cooldowns = {};
  game.act(f.id, 'offer_bribe', { officerId: clean.id, amount: 200 });
  const [b2] = Object.keys(game.state.bribes);
  const heat = f.heat;
  game.act(clean.id, 'report_bribe', { bribeId: b2 });
  assert.equal(f.heat, heat + 15);
  const fileOnPayer = Object.values(game.state.cases).find((c) => c.targetId === f.id);
  assert.ok(fileOnPayer.evidence.some((e) => e.label === 'Bribe Attempt'));
});

test('unclaimed envelopes are refunded', () => {
  const { game, clock } = setup();
  const cop = game.createPlayer({ name: 'Det. Slow' });
  game.act(cop.id, 'choose_track', { faction: 'badge' });
  const f = game.createPlayer({ name: 'Payer' });
  f.dirtyCash = 500;
  game.act(f.id, 'offer_bribe', { officerId: cop.id, amount: 500 });
  assert.equal(f.dirtyCash, 0);
  clock.advance(game.cfg.bribeTtlMs + 1);
  game.tick();
  assert.equal(f.dirtyCash, 500);
});

test('heist: timer waits for roles, NPCs fill in, and success pays by role', () => {
  const { game, clock } = setup({ rng: 0.2 });
  const p = game.createPlayer({ name: 'Wheels', district: 'industrial' });
  game.act(p.id, 'choose_track', { faction: 'family' });
  const { eventId } = game.act(p.id, 'create_heist', { role: 'Driver' });
  const e = game.state.events[eventId];
  assert.equal(e.status, 'open');
  game.tick();
  assert.equal(e.status, 'open', 'still waiting on the crew');
  clock.advance(game.cfg.npcFillMs + 1);
  game.tick();
  assert.ok(e.roles.every((r) => r.playerId), 'NPCs filled the empty roles');
  game.act(p.id, 'ready_event', { eventId });
  game.tick();
  assert.equal(e.status, 'live');
  const dirty = p.dirtyCash;
  clock.advance(game.cfg.eventLiveMs + 1);
  game.tick();
  assert.equal(e.status, 'resolved');
  assert.ok(e.result.ok, e.result.summary);
  assert.equal(p.dirtyCash - dirty, Math.round(e.payout * 0.2));
});

test('a fence who runs takes everything and pays in reputation', () => {
  const { game, clock } = setup({ rng: 0.2 });
  const boss = game.createPlayer({ name: 'Boss', district: 'docks' });
  const fence = game.createPlayer({ name: 'Rat', district: 'docks' });
  for (const p of [boss, fence]) game.act(p.id, 'choose_track', { faction: 'family' });
  const { eventId } = game.act(boss.id, 'create_heist', { role: 'Driver' });
  game.act(fence.id, 'join_event', { eventId, role: 'Fence' });
  clock.advance(game.cfg.npcFillMs + 1);
  game.tick();
  game.act(boss.id, 'ready_event', { eventId });
  game.act(fence.id, 'ready_event', { eventId });
  game.tick();
  const e = game.state.events[eventId];
  assert.equal(e.status, 'live');
  const before = fence.dirtyCash;
  game.act(fence.id, 'betray', { eventId, how: 'run' });
  assert.equal(fence.dirtyCash - before, e.payout);
  assert.equal(fence.rep, -10);
  assert.equal(fence.betrayals, 1);
});

test('board meeting vote sells an asset', () => {
  const { game, clock } = setup({ rng: 0.1 });
  const b = game.createPlayer({ name: 'Chair' });
  game.act(b.id, 'choose_track', { faction: 'board' });
  b.influence = 50;
  const f = game.createPlayer({ name: 'Buyer' });
  game.act(f.id, 'choose_track', { faction: 'family' });
  f.cash = 10000;
  const { eventId } = game.act(b.id, 'call_meeting', { assetId: 'velvet-room', proposal: 'sell', buyerId: f.id, price: 5000 });
  clock.advance(game.cfg.npcFillMs + 1);
  game.tick();
  game.act(b.id, 'ready_event', { eventId });
  game.tick();
  const e = game.state.events[eventId];
  assert.equal(e.status, 'live');
  game.act(b.id, 'vote', { eventId, choice: 'yes' });
  assert.equal(e.status, 'resolved', e.result?.summary);
  assert.equal(game.state.assets['velvet-room'].ownerId, f.id);
});

test('sit-down that ends in a hit costs the guest a life', () => {
  const { game, clock } = setup({ rng: 0.9 });
  const host = game.createPlayer({ name: 'Host' });
  const guest = game.createPlayer({ name: 'Guest' });
  game.act(host.id, 'choose_track', { faction: 'family' });
  const { eventId } = game.act(host.id, 'call_sitdown', { targetId: guest.id });
  game.act(guest.id, 'join_event', { eventId, role: 'Guest' });
  clock.advance(game.cfg.npcFillMs + 1);
  game.tick();
  game.act(host.id, 'ready_event', { eventId });
  game.act(guest.id, 'ready_event', { eventId });
  game.tick();
  game.act(host.id, 'vote', { eventId, choice: 'hit' });
  game.act(guest.id, 'vote', { eventId, choice: 'deal' });
  assert.equal(guest.lives, 2);
  assert.ok(host.heat >= 30);
});

test('reserved guest seat cannot be taken by someone else', () => {
  const { game } = setup();
  const host = game.createPlayer({ name: 'Host' });
  const guest = game.createPlayer({ name: 'Guest' });
  const other = game.createPlayer({ name: 'Other' });
  game.act(host.id, 'choose_track', { faction: 'family' });
  const { eventId } = game.act(host.id, 'call_sitdown', { targetId: guest.id });
  assert.throws(() => game.act(other.id, 'join_event', { eventId, role: 'Guest' }), /isn't for/);
});

test('territory: claiming an empty block, then contesting it', () => {
  const { game } = setup({ rng: 0.5 });
  const p = game.createPlayer({ name: 'Upstart', district: 'industrial' });
  game.act(p.id, 'choose_track', { faction: 'family' });
  assert.throws(() => game.act(p.id, 'claim_territory'), /need 10 rep/);
  p.rep = 20;
  p.cash = 5000;
  game.act(p.id, 'claim_territory');
  assert.equal(game.state.districts.industrial.holderId, p.id);
  game.act(p.id, 'crime', { kind: 'protection' });
});

test('owners pay business tax to the block holder each tick', () => {
  const { game, clock } = setup();
  const lena = npc(game, 'lena');
  const holder = game.createPlayer({ name: 'Taxman', district: 'riverfront' });
  game.state.districts.riverfront.holderId = holder.id;
  const russo = npc(game, 'russo');
  const cash = russo.cash;
  clock.advance(5000);
  game.tick();
  assert.ok(holder.dirtyCash > 0);
  assert.ok(russo.cash > cash);
  assert.ok(lena.cash > 6000);
});

test('jailed players can only chat and move', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Con' });
  p.jailedUntil = game.now() + 1000;
  assert.throws(() => game.act(p.id, 'work'), /doing time/);
  game.act(p.id, 'say', { room: 'public:downtown', text: 'I was framed.' });
});

test('chat room access follows faction and event membership', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Civ' });
  assert.ok(game.canAccessRoom(p, 'public:docks'));
  assert.ok(!game.canAccessRoom(p, 'faction:family'));
  assert.throws(() => game.act(p.id, 'say', { room: 'faction:badge', text: 'hi' }), /not in that room/);
  game.act(p.id, 'choose_track', { faction: 'badge' });
  assert.ok(game.canAccessRoom(p, 'faction:badge'));
});

test('losing the last life starts you over but keeps reputation', () => {
  const { game } = setup();
  const p = game.createPlayer({ name: 'Unlucky' });
  game.act(p.id, 'choose_track', { faction: 'family' });
  p.rep = 42;
  p.lives = 1;
  game.loseLife(p, 'test');
  assert.equal(p.faction, 'civilian');
  assert.equal(p.lives, 3);
  assert.equal(p.rep, 42);
});

test('season end resets blocks and officials, keeps companies and rep', () => {
  const { game, clock } = setup();
  const b = game.createPlayer({ name: 'Mogul' });
  game.act(b.id, 'choose_track', { faction: 'board' });
  game.act(b.id, 'buy_asset', { assetId: 'elm-laundromat' });
  b.rep = 30;
  clock.advance(game.cfg.seasonMs + 1);
  game.tick();
  assert.equal(game.state.season, 2);
  assert.equal(game.state.districts.docks.holderId, null);
  assert.equal(game.state.assets['elm-laundromat'].ownerId, b.id);
  assert.equal(b.rep, 30);
});

test('view hides books and case files from the wrong people', () => {
  const { game } = setup();
  const b = game.createPlayer({ name: 'Owner' });
  game.act(b.id, 'choose_track', { faction: 'board' });
  game.act(b.id, 'buy_asset', { assetId: 'elm-laundromat' });
  const cop = game.createPlayer({ name: 'Det. V' });
  game.act(cop.id, 'choose_track', { faction: 'badge' });
  game.act(cop.id, 'open_case', { targetType: 'asset', targetId: 'elm-laundromat' });
  const civ = game.createPlayer({ name: 'Nobody' });

  const ownerView = game.viewFor(b.id);
  assert.equal(ownerView.assets.find((a) => a.id === 'elm-laundromat').dirty, 0);
  assert.equal(ownerView.cases.length, 0, 'unrumored cases are invisible to the target');
  const civView = game.viewFor(civ.id);
  assert.equal(civView.assets.find((a) => a.id === 'elm-laundromat').dirty, undefined);
  const copView = game.viewFor(cop.id);
  assert.ok(copView.cases[0].evidence, 'badge sees the full file');
  assert.ok(!('token' in civView.players[0]), 'tokens never leak');
});

test('NPC director keeps events flowing and the city talking', () => {
  let t = 0;
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const game = new Game({ now: () => t, rng, config: { directorEveryTicks: 1 } });
  const chats = [];
  game.on((ev) => { if (ev.type === 'chat') chats.push(ev.msg); });
  for (let i = 0; i < 200; i++) { t += 5000; game.tick(); }
  const events = Object.values(game.state.events);
  assert.ok(events.length > 0, 'events spawned');
  assert.ok(events.some((e) => e.status === 'resolved') || Object.values(game.state.events).length >= 2);
  assert.ok(chats.some((m) => !m.system), 'NPCs chatted');
  // serialization round-trips
  const copy = new Game({ now: () => t, rng, state: JSON.parse(game.serialize()) });
  copy.tick();
});
