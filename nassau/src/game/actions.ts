// Player orders. Each active lieutenant can lead one order per day.
import type { BuildingId, DistrictId, GameState, LtId, OrderKind, ParleyKind } from './types';
import { DISTRICTS } from './content/districts';
import { BUILDINGS } from './content/buildings';
import { FACTIONS } from './content/factions';
import { LIEUTENANTS } from './content/lieutenants';
import { chance, int } from './rng';
import {
  addHeat,
  addPardon,
  adjustLoyalty,
  clamp,
  hasBuilding,
  isBlockaded,
  ltShort,
  note,
  playerDistricts,
  playerHasBuilding,
  react,
} from './helpers';
import { seizeSetup } from './encounters';

export interface OrderParams {
  kind: OrderKind;
  district: DistrictId;
  lt: LtId;
  building?: BuildingId;
  parley?: ParleyKind;
}

export interface OrderInfo {
  kind: OrderKind;
  label: string;
  hint: string;
  cost: string;
  ok: boolean;
  reason?: string;
}

export const ORDER_LABELS: Record<OrderKind, { label: string; hint: string }> = {
  protect: { label: 'Protect Lane', hint: 'Assign guards · deter rivals' },
  smuggle: { label: 'Smuggle', hint: 'Move goods quietly · works in a blockade' },
  wreck: { label: 'Wreck', hint: 'False lights on the reef · big payout, big infamy' },
  parley: { label: 'Parley', hint: 'Truce, buy out, or talk down the navy' },
  muscle: { label: 'Muscle In', hint: 'Street brawl to seize the district' },
  build: { label: 'Build', hint: 'Found a business in a free slot' },
  repair: { label: 'Repair', hint: 'Fix storm damage and ships' },
  batten: { label: 'Batten Down', hint: 'Storm-proof buildings · dock ships' },
  rally: { label: 'Rally Crew', hint: 'Rum and coin for morale and recruits' },
};

export const BATTEN_COST = 30;
export const RALLY_COST = { doubloons: 50, rum: 20 };

function stat(lt: LtId, k: keyof (typeof LIEUTENANTS)['hawkins']['stats']): number {
  return LIEUTENANTS[lt].stats[k];
}

export function availableShip(s: GameState) {
  const ships = s.ships.filter((sh) => !sh.damaged && !sh.atSea);
  ships.sort((a, b) => (a.kind === 'brig' ? -1 : 1) - (b.kind === 'brig' ? -1 : 1));
  return ships[0];
}

export function adjacentToPlayer(s: GameState, d: DistrictId): boolean {
  const mine = playerDistricts(s);
  if (!mine.length) return true;
  return DISTRICTS[d].adj.some((a) => s.districts[a].owner === 'player');
}

export function repairCost(s: GameState, d: DistrictId): number {
  const dmgB = s.districts[d].slots.filter((sl) => sl && sl.damaged).length;
  const dmgShips = DISTRICTS[d].coastal && playerHasBuilding(s, 'berth') ? s.ships.filter((sh) => sh.damaged).length : 0;
  return dmgB * 60 + dmgShips * 80;
}

export function buyCost(s: GameState, d: DistrictId, lt?: LtId): number {
  const dist = s.districts[d];
  const base = dist.owner === 'neutral' ? 160 + dist.fort * 40 : 260 + dist.fort * 60 + s.factions[dist.owner].strength * 2;
  const disc = lt ? stat(lt, 'parley') * 0.05 : 0;
  return Math.round(base * (1 - disc));
}

export function buildCost(b: BuildingId, lt?: LtId): number {
  return Math.round(BUILDINGS[b].cost * (1 - (lt ? stat(lt, 'trade') * 0.04 : 0)));
}

export function parleyNavyCost(): number {
  return 60;
}

/** Which orders can be issued in a district (before choosing a lieutenant). */
export function orderOptions(s: GameState, d: DistrictId): OrderInfo[] {
  const dist = s.districts[d];
  const def = DISTRICTS[d];
  const mine = dist.owner === 'player';
  const out: OrderInfo[] = [];
  const push = (kind: OrderKind, ok: boolean, cost: string, reason?: string) =>
    out.push({ kind, ...ORDER_LABELS[kind], cost, ok, reason });
  const money = s.res.doubloons;

  if (mine) {
    push('protect', dist.fort < 5, 'free', dist.fort >= 5 ? 'Fortification is maxed' : undefined);
    const ship = availableShip(s);
    push('smuggle', !!ship, 'a ship', ship ? undefined : 'No seaworthy ship in harbour');
    push('wreck', def.coastal, 'free', def.coastal ? undefined : 'Needs a coastal district');
    const free = dist.slots.some((sl) => !sl);
    push('build', free, 'varies', free ? undefined : 'No free building slot');
    const rc = repairCost(s, d);
    push('repair', rc > 0 && money >= rc, `${rc}`, rc === 0 ? 'Nothing here needs repair' : money < rc ? 'Not enough doubloons' : undefined);
    push('batten', !dist.battened && money >= BATTEN_COST, `${BATTEN_COST}`, dist.battened ? 'Already battened' : money < BATTEN_COST ? 'Not enough doubloons' : undefined);
    const canRally = money >= RALLY_COST.doubloons && s.res.rum >= RALLY_COST.rum;
    push('rally', canRally, `${RALLY_COST.doubloons} · ${RALLY_COST.rum} rum`, canRally ? undefined : 'Needs 50 doubloons and 20 rum');
    push('parley', true, `${parleyNavyCost()}`, undefined);
  } else {
    const adj = adjacentToPlayer(s, d);
    const fresh = s.brawlDay !== s.day;
    push('muscle', adj && fresh, 'a fight', !adj ? 'Must border one of your districts' : !fresh ? 'The crew can only be roused for one brawl a day' : undefined);
    push('parley', true, 'varies', undefined);
  }
  return out;
}

/** Parley sub-options for a district. */
export function parleyOptions(s: GameState, d: DistrictId): { kind: ParleyKind; label: string; ok: boolean; reason?: string }[] {
  const owner = s.districts[d].owner;
  const out: { kind: ParleyKind; label: string; ok: boolean; reason?: string }[] = [];
  if (owner !== 'player') {
    if (owner !== 'neutral') {
      const f = s.factions[owner];
      out.push({ kind: 'truce', label: `Seek a truce with ${FACTIONS[owner].name}`, ok: f.truceDays <= 0, reason: f.truceDays > 0 ? 'Already under truce' : undefined });
    }
    out.push({ kind: 'buy', label: `Buy out ${DISTRICTS[d].name}`, ok: adjacentToPlayer(s, d), reason: adjacentToPlayer(s, d) ? undefined : 'Must border one of your districts' });
  }
  out.push({
    kind: 'navy',
    label: isBlockaded(s) ? 'Talk the navy into lifting the blockade' : 'Talk down the Governor’s Navy',
    ok: s.res.doubloons >= parleyNavyCost(),
    reason: s.res.doubloons >= parleyNavyCost() ? undefined : 'Needs 60 doubloons for the bribe-bottle',
  });
  return out;
}

/** Success chance (0..100) of an order led by a lieutenant; null when not a gamble. */
export function orderChance(s: GameState, p: OrderParams): number | null {
  const dist = s.districts[p.district];
  const chapel = playerHasBuilding(s, 'chapel') ? 10 : 0;
  switch (p.kind) {
    case 'smuggle': {
      const lookout = playerHasBuilding(s, 'lookout') ? 8 : 0;
      return clamp(Math.round(68 + stat(p.lt, 'sea') * 5 - dist.heat / 5 - (isBlockaded(s) ? 20 : 0) + lookout), 10, 95);
    }
    case 'wreck':
      return clamp(Math.round(62 + stat(p.lt, 'sea') * 5 - dist.heat / 6), 10, 95);
    case 'parley': {
      if (p.parley === 'navy') {
        const thorne = p.lt === 'thorne' ? 15 : 0;
        return clamp(Math.round(22 + stat(p.lt, 'parley') * 10 + chapel + thorne - s.res.infamy / 5 - (isBlockaded(s) ? 10 : 0)), 5, 95);
      }
      const owner = dist.owner;
      if (owner === 'neutral') return 100;
      const f = s.factions[owner];
      if (p.parley === 'truce') return clamp(Math.round(25 + stat(p.lt, 'parley') * 10 + f.attitude / 3 + chapel), 5, 95);
      return clamp(Math.round(10 + stat(p.lt, 'parley') * 10 + f.attitude / 3 - dist.fort * 5 + chapel - f.strength / 10), 5, 90);
    }
    default:
      return null;
  }
}

export interface OrderResult {
  ok: boolean;
  text: string;
  combat?: boolean;
}

function viceCheck(s: GameState, p: OrderParams): void {
  if (p.lt === 'thorne' && hasBuilding(s, p.district, 'vicehall', true)) {
    addHeat(s, p.district, 10);
    addPardon(s, -3);
    adjustLoyalty(s, 'thorne', 3);
    note(s, `Father Thorne “ministers” at the vice hall on ${DISTRICTS[p.district].name}. Scandal: +10 heat, −3 pardon.`, 'bad');
    react(s, 'vice', ['thorne', 'hawkins']);
  }
}

export function issueOrder(s: GameState, p: OrderParams): OrderResult {
  const lt = s.lts[p.lt];
  if (lt.status !== 'active' || lt.orderedToday) return { ok: false, text: `${ltShort(p.lt)} is not available.` };
  const opt = orderOptions(s, p.district).find((o) => o.kind === p.kind);
  if (!opt || !opt.ok) return { ok: false, text: opt?.reason ?? 'That order is not possible here.' };

  // Disloyal lieutenants may refuse.
  if (lt.loyalty < 25 && chance(s, 40 - lt.loyalty)) {
    lt.orderedToday = true;
    const t = `${ltShort(p.lt)} refuses the order and goes drinking with Hart’s people.`;
    note(s, t, 'bad');
    return { ok: false, text: t };
  }

  lt.orderedToday = true;
  lt.idleDays = 0;
  const dist = s.districts[p.district];
  const def = DISTRICTS[p.district];
  const who = ltShort(p.lt);
  let text = '';
  let tone: 'good' | 'bad' | 'neutral' = 'neutral';

  switch (p.kind) {
    case 'protect': {
      const add = stat(p.lt, 'melee') >= 4 ? 2 : 1;
      dist.fort = clamp(dist.fort + add, 0, 5);
      dist.heat = clamp(dist.heat - 8, 0, 100);
      dist.guardedBy = p.lt;
      text = `${who} posts guards on ${def.name}. Fortification ${dist.fort}, heat cools.`;
      tone = 'good';
      break;
    }
    case 'smuggle': {
      const ship = availableShip(s)!;
      const pct = orderChance(s, p)!;
      ship.atSea = true;
      ship.secured = false;
      ship.seaLeader = p.lt;
      s.stats.smuggles++;
      if (chance(s, pct)) {
        const mult =
          (ship.kind === 'brig' ? 1.6 : 1) *
          (isBlockaded(s) ? 1.8 : 1) *
          (playerHasBuilding(s, 'warehouse') ? 1.4 : 1) *
          (s.districts.docks.owner === 'player' ? 1.2 : 1) *
          (1 + stat(p.lt, 'trade') * 0.06);
        const pay = Math.round(110 * mult);
        s.res.doubloons += pay;
        s.res.rum += 12;
        addHeat(s, p.district, 6);
        text = `${who} runs the ${ship.name} through ${isBlockaded(s) ? 'the blockade' : 'the cays'}: +${pay} doubloons, +12 rum.`;
        tone = 'good';
      } else {
        s.res.doubloons -= 50;
        addHeat(s, p.district, 12);
        s.clocks.navyAlert = clamp(s.clocks.navyAlert + 6, 0, 100);
        addPardon(s, -3);
        if (isBlockaded(s) && chance(s, 35)) {
          s.ships = s.ships.filter((sh) => sh !== ship);
          text = `The navy runs down the ${ship.name}! Ship seized, 50 doubloons in fines.`;
        } else {
          ship.damaged = true;
          text = `A patrol chases the ${ship.name} onto a sandbar. Cargo dumped, hull damaged, −50 doubloons.`;
        }
        tone = 'bad';
      }
      break;
    }
    case 'wreck': {
      const pct = orderChance(s, p)!;
      s.stats.wrecks++;
      if (chance(s, pct)) {
        const mult = (hasBuilding(s, p.district, 'berth') ? 1.5 : 1) * (s.clocks.flotsamDays > 0 ? 1.5 : 1);
        const pay = Math.round(200 * mult);
        s.res.doubloons += pay;
        s.res.infamy = clamp(s.res.infamy + 8, 0, 100);
        addPardon(s, -6);
        s.factions.company.attitude = clamp(s.factions.company.attitude - 15, -100, 100);
        s.clocks.navyAlert = clamp(s.clocks.navyAlert + 10, 0, 100);
        addHeat(s, p.district, 14);
        text = `False lights on the reef. A Company merchantman breaks up: +${pay} doubloons, +8 infamy. The Company is furious.`;
        tone = 'good';
      } else {
        s.res.crew = Math.max(0, s.res.crew - 2);
        addHeat(s, p.district, 8);
        text = `The merchantman sees the reef in time. Two hands drown in the surf.`;
        tone = 'bad';
      }
      react(s, 'wreck');
      break;
    }
    case 'parley': {
      const kind = p.parley ?? 'navy';
      const pct = orderChance(s, { ...p, parley: kind })!;
      if (kind === 'navy') {
        s.res.doubloons -= parleyNavyCost();
        if (chance(s, pct)) {
          if (isBlockaded(s)) {
            const cut = p.lt === 'thorne' ? 3 : 2;
            s.clocks.blockadeDays = Math.max(0, s.clocks.blockadeDays - cut);
            text = `${who} shares a bottle with the commodore. The blockade loosens by ${cut} days.`;
          } else {
            const cut = p.lt === 'thorne' ? 35 : 25;
            s.clocks.navyAlert = clamp(s.clocks.navyAlert - cut, 0, 100);
            text = `${who} talks the navy down a step. Navy alert −${cut}.`;
          }
          const g = addPardon(s, 6);
          text += ` Pardon +${g}.`;
          tone = 'good';
          react(s, 'navyParley');
        } else {
          s.clocks.navyAlert = clamp(s.clocks.navyAlert + 8, 0, 100);
          text = `The commodore takes the bottle and ${who}’s hat, and promises nothing. Navy alert +8.`;
          tone = 'bad';
        }
      } else if (kind === 'truce') {
        const f = s.factions[dist.owner];
        if (chance(s, pct)) {
          f.truceDays = 6;
          f.attitude = clamp(f.attitude + 20, -100, 100);
          text = `${who} seals a six-day truce with ${FACTIONS[dist.owner].name}.`;
          tone = 'good';
          react(s, 'deal');
        } else {
          f.attitude = clamp(f.attitude - 5, -100, 100);
          s.res.doubloons -= 30;
          text = `${FACTIONS[dist.owner].name} drink ${who}’s rum and laugh at the offer.`;
          tone = 'bad';
        }
      } else {
        const cost = buyCost(s, p.district, p.lt);
        if (s.res.doubloons < cost) {
          text = `${who} cannot afford the ${cost} doubloons they want for ${def.name}.`;
          tone = 'bad';
        } else if (chance(s, pct)) {
          const prev = dist.owner;
          s.res.doubloons -= cost;
          if (prev !== 'neutral') s.factions[prev].strength = clamp(s.factions[prev].strength - 6, 0, 100);
          dist.owner = 'player';
          dist.fort = Math.max(1, dist.fort - 1);
          text = `${who} buys out ${def.name} for ${cost} doubloons. Not a drop of blood spilled.`;
          tone = 'good';
          react(s, 'deal');
        } else {
          s.res.doubloons -= 20;
          text = `${FACTIONS[dist.owner].name} refuse to sell ${def.name}. ${who} spent 20 on drinks trying.`;
          tone = 'bad';
        }
      }
      break;
    }
    case 'muscle': {
      s.pendingCombat = seizeSetup(s, p.district, p.lt);
      s.brawlDay = s.day;
      text = `${who} rounds up the hands for a brawl in ${def.name}.`;
      note(s, text, 'neutral');
      return { ok: true, text, combat: true };
    }
    case 'build': {
      const b = p.building!;
      const cost = buildCost(b, p.lt);
      const slot = dist.slots.findIndex((sl) => !sl);
      if (slot < 0 || s.res.doubloons < cost) return { ok: false, text: 'Cannot build that.' };
      s.res.doubloons -= cost;
      dist.slots[slot] = { id: b, damaged: false };
      if (b === 'lookout') dist.fort = clamp(dist.fort + 1, 0, 5);
      if (b === 'warehouse') s.res.rum += 25;
      text = `${who} opens a ${BUILDINGS[b].name} on ${def.name} for ${cost} doubloons.`;
      tone = 'good';
      break;
    }
    case 'repair': {
      const cost = repairCost(s, p.district);
      s.res.doubloons -= cost;
      for (const sl of dist.slots) if (sl) sl.damaged = false;
      if (def.coastal && playerHasBuilding(s, 'berth')) for (const sh of s.ships) sh.damaged = false;
      text = `${who} gets the carpenters working on ${def.name}. Repairs done for ${cost}.`;
      tone = 'good';
      break;
    }
    case 'batten': {
      s.res.doubloons -= BATTEN_COST;
      dist.battened = true;
      let docked = 0;
      if (def.coastal) {
        for (const sh of s.ships)
          if (!sh.atSea) {
            sh.secured = true;
            docked++;
          }
      }
      text = `${who} battens down ${def.name}${docked ? ` and doubles the lines on ${docked} ship${docked > 1 ? 's' : ''}` : ''}.`;
      tone = 'good';
      break;
    }
    case 'rally': {
      s.res.doubloons -= RALLY_COST.doubloons;
      s.res.rum -= RALLY_COST.rum;
      const m = 10 + stat(p.lt, 'parley');
      const recruits = 3 + (s.res.infamy > 40 ? 2 : 0) + int(s, 0, 1);
      s.res.morale = clamp(s.res.morale + m, 0, 100);
      s.res.crew += recruits;
      text = `${who} stands a round on ${def.name}. Morale +${m}, ${recruits} new hands sign the articles.`;
      tone = 'good';
      break;
    }
  }
  // Specialty bonus: successful orders led by the right officer earn a little loyalty.
  if (tone === 'good') adjustLoyalty(s, p.lt, 1);
  note(s, text, tone);
  viceCheck(s, p);
  return { ok: tone !== 'bad', text };
}
