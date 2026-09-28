// The NPC director keeps the city moving when few humans are online:
// ambient in-character chatter, NPC crews working rackets, NPC detectives
// building files on hot players, NPC officers deciding on envelopes, and a
// steady supply of live events for people to drop into.

import { CHATTER, CRIMES } from './data.js';
import { clamp } from './game.js';

export function runDirector(game) {
  const s = game.state;
  const t = game.now();
  const npcs = Object.values(s.players).filter((p) => p.isNpc && p.jailedUntil <= t);
  const humans = Object.values(s.players).filter((p) => !p.isNpc);
  const byFaction = (f) => npcs.filter((p) => p.faction === f);

  // Ambient chatter, more of it when the city is quiet.
  const online = humans.filter((p) => p.online).length;
  if (npcs.length && game.chance(online < 4 ? 0.45 : 0.2)) {
    const n = game.pick(npcs);
    const d = s.districts[n.district];
    const line = game.pick(CHATTER[n.faction] ?? CHATTER.family).replace('{district}', d.name).replace('{name}', n.name);
    game.say(`public:${n.district}`, line, n.id);
  }

  // NPCs drift between districts.
  if (npcs.length && game.chance(0.25)) {
    const n = game.pick(npcs);
    n.district = game.pick(Object.keys(s.districts));
  }

  // Family NPCs work rackets: cash, heat, and district heat.
  for (const n of byFaction('family')) {
    if (!game.chance(0.2)) continue;
    const kind = game.pick(Object.keys(CRIMES).filter((k) => !CRIMES[k].needsTerritory));
    const c = CRIMES[kind];
    if (c.districts && !c.districts.includes(n.district)) continue;
    n.dirtyCash += game.rand(c.cash[0], c.cash[1]);
    game.addHeat(n, c.heat);
    game.districtHeat(n.district, c.heat / 6);
  }

  // NPC detectives: open files on the hottest players and work them.
  const cops = byFaction('badge');
  if (cops.length) {
    const hot = Object.values(s.players)
      .filter((p) => p.faction !== 'badge' && p.heat >= 50 && !Object.values(s.cases).some((c) => c.targetId === p.id && ['building', 'trial'].includes(c.status)))
      .sort((a, b) => b.heat - a.heat)[0];
    if (hot && game.chance(0.35)) {
      const cop = game.pick(cops);
      const c = game.openCase(cop, 'player', hot.id);
      game.say(`faction:badge`, `Opened a file on ${hot.name}. Heat like that doesn't come from nowhere.`, cop.id);
      c.notes = 'Opened by NPC detective.';
    }
    for (const c of Object.values(s.cases)) {
      const cop = s.players[c.officerId];
      if (!cop?.isNpc || c.status !== 'building' || !game.chance(0.3)) continue;
      const dirt = game.targetDirt(c);
      if (game.chance(0.25 + dirt / 200)) {
        const status = game.chance(dirt / 100) ? 'Collected' : 'Partial';
        game.addEvidence(c, game.pick(['Surveillance Logs', 'Warehouse Photo', 'Bank Transfer Record']), 11, status, cop.name);
      }
      const str = game.strength(c);
      if (str >= 60 && game.chance(0.5)) {
        c.status = 'trial';
        c.submittedBy = cop.id;
        c.trialEndsAt = t + game.cfg.trialMs;
        c.rumored = true;
        game.news(`The DA takes ${c.targetName} to trial on ${cop.name}'s file.`, c.district);
        game.notify(game.caseOwnerId(c), `You're going to trial (case #${c.id}).`, 'bad');
      } else if (t - c.createdAt > 20 * 60000 && str < 30) {
        c.status = 'closed';
      }
    }
  }

  // NPC officers decide on envelopes.
  for (const b of Object.values(s.bribes)) {
    const cop = s.players[b.toId];
    if (!cop?.isNpc || t - (b.expiresAt - game.cfg.bribeTtlMs) < 8000) continue;
    const temptation = clamp(cop.corruption + b.amount / 5000, 0, 0.95);
    try {
      game.act(cop.id, game.chance(temptation) ? 'accept_bribe' : 'report_bribe', { bribeId: b.id });
    } catch { /* already handled */ }
  }

  // Keep a couple of live windows open so there is always something to join.
  const active = Object.values(s.events).filter((e) => ['open', 'live'].includes(e.status));
  if (active.length < game.cfg.minOpenEvents) spawnEvent(game, npcs, byFaction);
}

function spawnEvent(game, npcs, byFaction) {
  const s = game.state;
  const roll = game.rng();
  const fam = byFaction('family');
  const board = byFaction('board');
  const cops = byFaction('badge');

  if (roll < 0.5 && fam.length) {
    const boss = game.pick(fam);
    const district = game.pick(['industrial', 'docks', 'riverfront']);
    const e = game.createEvent('heist', { createdBy: boss.id, district });
    game.seat(e, game.pick(['Driver', 'Muscle', 'Lookout']), boss);
    game.say(`faction:family`, `Got a job at ${e.location}. Need hands.`, boss.id);
    return;
  }
  if (roll < 0.75 && cops.length) {
    // Raid the dirtiest NPC-held front (never a human's by NPC fiat).
    const target = Object.values(s.assets)
      .filter((a) => a.ownerId && s.players[a.ownerId]?.isNpc && a.dirty > 0)
      .sort((a, b) => b.trail - a.trail)[0];
    if (target) {
      const cop = game.pick(cops);
      const c = game.openCase(cop, 'asset', target.id);
      if (Object.values(s.events).some((e) => e.type === 'raid' && e.target?.caseId === c.id && ['open', 'live'].includes(e.status))) return;
      const e = game.createEvent('raid', { createdBy: cop.id, district: target.district, target: { caseId: c.id, name: c.targetName } });
      e.title = `Raid on ${c.targetName}`;
      game.seat(e, 'Lead', cop);
      game.seatJudge(e);
      game.say(`faction:badge`, `Putting together a raid on ${target.name}. Need backup.`, cop.id);
      return;
    }
  }
  if (board.length >= 1) {
    const chair = game.pick(board);
    const a = Object.values(s.assets).find((x) => x.ownerId && x.ownerId !== chair.id && s.players[x.ownerId]?.isNpc);
    if (!a) return;
    const buyer = game.pick(fam.length ? fam : npcs);
    const proposal = game.chance(0.6) ? 'sell' : 'report';
    const e = game.createEvent('board_meeting', {
      createdBy: chair.id, district: a.district,
      target: { assetId: a.id, assetName: a.name, proposal, buyerId: buyer.id, buyerName: buyer.name, price: Math.round(a.value / 100) },
    });
    e.title = proposal === 'sell' ? `Board Meeting — Sell ${a.name} to ${buyer.name}` : `Board Meeting — Report ${a.name}`;
    game.seat(e, 'Chair', chair);
  }
}
