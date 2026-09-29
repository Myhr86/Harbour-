// Tiny utility AI for the rival factions: each day each rival scores
// expand / raid / fortify / parley (plus the Company's "fund the navy")
// and does the best one. Readable goals, no runtime LLM.
import type { DistrictId, FactionId, GameState } from './types';
import { DISTRICTS, DISTRICT_ORDER } from './content/districts';
import { FACTIONS, RIVALS } from './content/factions';
import { chance, int, next } from './rng';
import { clamp, crewLts, note, ownedBy } from './helpers';

export const COMPANY_DOCKS_DAY = 10;

type Move =
  | { kind: 'expand'; target: DistrictId }
  | { kind: 'raid'; target: DistrictId }
  | { kind: 'fortify'; target: DistrictId }
  | { kind: 'parley' }
  | { kind: 'fundNavy' };

function neighbours(s: GameState, f: FactionId): Set<DistrictId> {
  const out = new Set<DistrictId>();
  for (const d of ownedBy(s, f)) for (const a of DISTRICTS[d].adj) if (s.districts[a].owner !== f) out.add(a);
  return out;
}

function jitter(s: GameState): number {
  return 0.7 + next(s) * 0.6;
}

/** Faction preference for particular districts (their "readable goals"). */
function desire(f: FactionId, d: DistrictId): number {
  if (f === 'knives' && (d === 'alley' || d === 'shipyard')) return 1.5;
  if (f === 'hart' && d === 'salt') return 1.8;
  if (f === 'company' && (d === 'docks' || d === 'salt' || d === 'fort')) return 1.5;
  return 1;
}

export function runAI(s: GameState): void {
  let raidsOnPlayer = 0;
  const maxRaids = ownedBy(s, 'player').length >= 3 ? 2 : 1;
  for (const fid of RIVALS) {
    const f = s.factions[fid];
    const def = FACTIONS[fid];
    const mine = ownedBy(s, fid);
    // Upkeep and growth.
    f.strength = clamp(f.strength + 1 + mine.length, 0, 90);
    f.treasury += fid === 'company' ? 70 : 25 * mine.length;
    if (f.truceDays > 0) f.truceDays--;

    const options: { move: Move; score: number }[] = [];
    const near = neighbours(s, fid);
    const candidates = fid === 'company' ? DISTRICT_ORDER.filter((d) => s.districts[d].owner === 'neutral') : [...near];
    for (const d of candidates) {
      const dist = s.districts[d];
      if (dist.owner === 'neutral') {
        // The island sizes you up for a few days before anyone grabs free ground,
        // and the Company holds off on the Docks until it has the navy's backing.
        if (s.day <= 3) continue;
        if (fid === 'company' && d === 'docks' && s.day < COMPANY_DOCKS_DAY) continue;
        if (fid === 'company' && f.treasury < 250) continue;
        options.push({
          move: { kind: 'expand', target: d },
          score: def.weights.expand * (DISTRICTS[d].baseIncome / 80) * desire(fid, d) * (f.strength / 50) * jitter(s),
        });
      }
    }
    for (const d of near) {
      const dist = s.districts[d];
      if (dist.owner === 'neutral' || dist.owner === fid) continue;
      if (fid === 'company' && d === 'docks' && s.day < COMPANY_DOCKS_DAY) continue;
      if (dist.owner === 'player') {
        if (s.day < 4 || f.truceDays > 0 || raidsOnPlayer >= maxRaids) continue;
      }
      const intimidation = dist.owner === 'player' ? 1 - s.res.infamy / 200 : 1;
      const grudge = dist.owner === 'player' ? (1 + Math.max(0, -f.attitude) / 100) * (ownedBy(s, 'player').length >= 3 ? 1.6 : 1) : 1;
      options.push({
        move: { kind: 'raid', target: d },
        score:
          def.weights.raid *
          (DISTRICTS[d].baseIncome / 80) *
          desire(fid, d) *
          (f.strength / (40 + dist.fort * 12)) *
          intimidation *
          grudge *
          jitter(s),
      });
    }
    if (mine.length) {
      const weakest = mine.slice().sort((a, b) => s.districts[a].fort - s.districts[b].fort)[0];
      if (s.districts[weakest].fort < 4)
        options.push({ move: { kind: 'fortify', target: weakest }, score: def.weights.fortify * (s.districts[weakest].fort < 2 ? 1.2 : 0.5) * jitter(s) });
    }
    options.push({ move: { kind: 'parley' }, score: def.weights.parley * 0.6 * jitter(s) });
    if (fid === 'company') options.push({ move: { kind: 'fundNavy' }, score: 0.5 + (s.res.infamy / 40) * jitter(s) - f.attitude / 100 });

    options.sort((a, b) => b.score - a.score);
    const best = options[0]?.move;
    if (!best) continue;
    switch (best.kind) {
      case 'expand': {
        const dist = s.districts[best.target];
        if (fid === 'company') {
          f.treasury -= 250;
          dist.owner = 'company';
          dist.fort = 2;
          f.lastMove = `bought ${DISTRICTS[best.target].name}`;
          note(s, `The Charter Company buys up ${DISTRICTS[best.target].name}. Clerks with ledgers everywhere.`, 'bad');
        } else if (chance(s, 45 + f.strength / 2 - dist.fort * 10)) {
          dist.owner = fid;
          dist.fort = 1;
          f.lastMove = `seized ${DISTRICTS[best.target].name}`;
          note(s, `${def.name} seize ${DISTRICTS[best.target].name}.`, 'bad');
        } else {
          f.strength = clamp(f.strength - 3, 0, 100);
          f.lastMove = `failed to take ${DISTRICTS[best.target].name}`;
        }
        break;
      }
      case 'raid': {
        const dist = s.districts[best.target];
        if (dist.owner === 'player') {
          raidsOnPlayer++;
          s.pendingEvents.push({ id: 'raid', data: { faction: fid, district: best.target, guard: dist.guardedBy ?? '' } });
          f.lastMove = `raiding ${DISTRICTS[best.target].name}`;
          note(s, `Word on the street: ${def.name} are coming for ${DISTRICTS[best.target].name} at dawn.`, 'bad');
        } else {
          const defender = s.factions[dist.owner];
          const atk = f.strength + int(s, 0, 30);
          const dfn = defender.strength * 0.8 + dist.fort * 15 + int(s, 0, 30);
          if (atk > dfn) {
            const loser = dist.owner;
            dist.owner = fid;
            dist.fort = 1;
            defender.strength = clamp(defender.strength - 8, 0, 100);
            f.strength = clamp(f.strength - 3, 0, 100);
            f.lastMove = `took ${DISTRICTS[best.target].name}`;
            note(s, `${def.name} drive ${FACTIONS[loser].name} out of ${DISTRICTS[best.target].name}.`, 'neutral');
          } else {
            f.strength = clamp(f.strength - 6, 0, 100);
            dist.fort = Math.max(0, dist.fort - 1);
            f.lastMove = `raided ${DISTRICTS[best.target].name}`;
            note(s, `${def.name} raid ${FACTIONS[dist.owner].name} in ${DISTRICTS[best.target].name} and are thrown back.`, 'neutral');
          }
        }
        break;
      }
      case 'fortify':
        s.districts[best.target].fort = clamp(s.districts[best.target].fort + 1, 0, 5);
        f.lastMove = `fortified ${DISTRICTS[best.target].name}`;
        break;
      case 'parley': {
        f.attitude = clamp(f.attitude + 4, -100, 100);
        f.lastMove = 'sent envoys';
        if (fid === 'hart') {
          // Hart poaches unhappy officers.
          const target = crewLts(s)
            .filter((l) => l.status === 'active' && l.loyalty < 35)
            .sort((a, b) => a.loyalty - b.loyalty)[0];
          if (target && !s.pendingEvents.some((e) => e.id === 'hartBribe')) {
            s.pendingEvents.push({ id: 'hartBribe', data: { lt: target.id } });
            f.lastMove = 'courting your officers';
          }
        }
        break;
      }
      case 'fundNavy':
        f.treasury -= 80;
        s.clocks.navyAlert = clamp(s.clocks.navyAlert + 8, 0, 100);
        f.lastMove = 'funded a navy patrol';
        note(s, 'The Company pays for another navy patrol. Navy alert +8.', 'bad');
        break;
    }
  }
}
