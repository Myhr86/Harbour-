// Applies a finished fight back onto the strategic layer.
import type { DistrictId, GameState, LtId } from './types';
import { DISTRICTS } from './content/districts';
import { FACTIONS } from './content/factions';
import { chance, int } from './rng';
import { addHeat, addPardon, adjustLoyalty, clamp, ltShort, note, playerHasBuilding, react } from './helpers';
import { checkEnding } from './endings';

export interface CombatSummary {
  result: 'win' | 'loss' | 'retreat';
  lines: string[];
}

/** Player backs out of a fight from the prep screen. */
export function cancelPendingCombat(s: GameState): void {
  const p = s.pendingCombat;
  if (!p) return;
  s.pendingCombat = null;
  if (p.context === 'rescue') {
    s.lts.bridge.woundDays = 4;
    adjustLoyalty(s, 'bridge', -25);
    note(s, 'You leave Bridge in the lock-up. He will remember.', 'bad');
  } else if (p.context === 'defend' && p.districtId) {
    resolveDefendLoss(s, p.districtId, p.enemy);
  } else if (p.context === 'navy' && p.districtId) {
    s.districts[p.districtId].owner = 'company';
    s.districts[p.districtId].fort = 2;
    note(s, `You abandon ${DISTRICTS[p.districtId].name} to the marines. The Company moves in.`, 'bad');
  } else {
    s.res.morale = clamp(s.res.morale - 3, 0, 100);
    note(s, 'You think better of the fight. The crew mutters about nerve. Morale −3.', 'neutral');
  }
  checkEnding(s);
}

function resolveDefendLoss(s: GameState, d: DistrictId, attacker: GameState['districts'][DistrictId]['owner']): string {
  const dist = s.districts[d];
  if (dist.fort <= 1) {
    dist.owner = attacker;
    dist.fort = 1;
    dist.lockedDays = 0;
    react(s, 'lost');
    const t = `${DISTRICTS[d].name} falls to ${FACTIONS[attacker].name}.`;
    note(s, t, 'bad');
    return t;
  }
  dist.fort = Math.max(0, dist.fort - 2);
  dist.lockedDays = 2;
  const t = `${DISTRICTS[d].name} is sacked: no income for 2 days, fortification down to ${dist.fort}.`;
  note(s, t, 'bad');
  return t;
}

export function applyCombatResult(s: GameState): CombatSummary {
  const c = s.combat!;
  const setup = c.setup;
  const result = c.result ?? 'loss';
  const won = result === 'win';
  const lines: string[] = [];
  const say = (t: string, tone: 'good' | 'bad' | 'neutral' = 'neutral') => {
    lines.push(t);
    note(s, t, tone);
  };
  say(won ? setup.winText : setup.lossText, won ? 'good' : 'bad');

  // Casualties.
  const navy = setup.enemy === 'navy';
  const fallen: LtId[] = [];
  let sailorsLost = 0;
  for (const u of c.units) {
    if (u.side === 'enemy') continue;
    if (u.kind === 'sailor' && u.down) sailorsLost += navy ? 2 : 1;
    if (u.lt && u.down) {
      if (chance(s, navy ? 35 : 20)) {
        s.lts[u.lt].status = 'dead';
        fallen.push(u.lt);
        say(`${ltShort(u.lt)} is dead. The crew sews them into sailcloth at dusk.`, 'bad');
      } else {
        s.lts[u.lt].status = 'wounded';
        s.lts[u.lt].woundDays = 3;
        adjustLoyalty(s, u.lt, -3);
        say(`${ltShort(u.lt)} is carried off the field, wounded for 3 days.`, 'bad');
      }
    } else if (u.lt && won) adjustLoyalty(s, u.lt, 3);
  }
  if (sailorsLost) {
    s.res.crew = Math.max(0, s.res.crew - sailorsLost);
    say(`${sailorsLost} hands lost.`, 'bad');
  }
  if (won) s.stats.fightsWon++;
  else s.stats.fightsLost++;
  s.res.morale = clamp(s.res.morale + (won ? 6 : -8), 0, 100);
  if (c.noise && setup.districtId) addHeat(s, setup.districtId, c.noise);
  if (c.noise) say(`Pistol fire draws attention: heat +${c.noise}.`, 'neutral');

  const d = setup.districtId;
  switch (setup.context) {
    case 'seize': {
      const prev = s.districts[d!].owner;
      if (won) {
        const dist = s.districts[d!];
        dist.owner = 'player';
        dist.fort = 1;
        dist.lockedDays = 0;
        addHeat(s, d!, 10);
        s.res.infamy = clamp(s.res.infamy + 4, 0, 100);
        if (prev !== 'neutral') {
          s.factions[prev].strength = clamp(s.factions[prev].strength - 12, 0, 100);
          s.factions[prev].attitude = clamp(s.factions[prev].attitude - 15, -100, 100);
        }
        react(s, 'taken');
      } else {
        // The district you launched from pays for it.
        const from = DISTRICTS[d!].adj.find((a) => s.districts[a].owner === 'player');
        if (from) {
          s.districts[from].lockedDays = 2;
          say(`${DISTRICTS[from].name} goes without income for 2 days while the crew licks its wounds.`, 'bad');
        }
        s.districts[d!].fort = clamp(s.districts[d!].fort + 1, 0, 5);
        react(s, 'loss');
      }
      break;
    }
    case 'defend': {
      if (won) {
        s.factions[setup.enemy].strength = clamp(s.factions[setup.enemy].strength - 10, 0, 100);
        s.res.infamy = clamp(s.res.infamy + 3, 0, 100);
        react(s, 'win');
      } else {
        lines.push(resolveDefendLoss(s, d!, setup.enemy));
        if (s.districts[d!].owner === 'player') react(s, 'loss');
      }
      break;
    }
    case 'board': {
      if (won) {
        const loot = Math.round(260 * (playerHasBuilding(s, 'prizecourt') ? 1.5 : 1));
        s.ships.push({ id: `brig${s.day}`, name: 'Good Intent', kind: 'brig', damaged: true, secured: false, atSea: false, seaLeader: null });
        s.res.doubloons += loot;
        s.res.rum += 40;
        s.res.infamy = clamp(s.res.infamy + 10, 0, 100);
        addPardon(s, -6);
        s.factions.company.attitude = clamp(s.factions.company.attitude - 20, -100, 100);
        s.clocks.navyAlert = clamp(s.clocks.navyAlert + 10, 0, 100);
        s.stats.prizes++;
        say(`Prize taken: +${loot} doubloons, +40 rum, and a battered brig for the harbour (repair her at a Shipyard Berth).`, 'good');
        react(s, 'prize');
      } else {
        s.res.crew = Math.max(0, s.res.crew - 3);
        react(s, 'loss');
      }
      break;
    }
    case 'navy': {
      if (won) {
        s.res.infamy = clamp(s.res.infamy + 12, 0, 100);
        addPardon(s, -10);
        s.clocks.navyAlert = clamp(s.clocks.navyAlert + 15, 0, 100);
        s.factions.navy.strength = clamp(s.factions.navy.strength - 10, 0, 100);
        say('The navy will remember this. So will every tavern in the Caribbean. Infamy +12.', 'good');
        react(s, 'win');
      } else {
        s.districts[d!].owner = 'company';
        s.districts[d!].fort = 2;
        const ship = s.ships[int(s, 0, Math.max(0, s.ships.length - 1))];
        if (ship) {
          s.ships = s.ships.filter((x) => x !== ship);
          say(`The navy impounds the ${ship.name}.`, 'bad');
        }
        say(`${DISTRICTS[d!].name} is handed to the Company.`, 'bad');
        react(s, 'lost');
      }
      break;
    }
    case 'rescue': {
      if (won) {
        s.lts.bridge.status = 'active';
        s.lts.bridge.woundDays = 0;
        adjustLoyalty(s, 'bridge', 15);
        s.factions.company.attitude = clamp(s.factions.company.attitude - 10, -100, 100);
        addHeat(s, 'salt', 12);
      } else if (s.lts.bridge.status !== 'dead') {
        s.lts.bridge.status = 'wounded';
        s.lts.bridge.woundDays = 5;
        s.res.doubloons -= 100;
        say('Bridge stays in irons for 5 days; the Company doubles the fine (−100).', 'bad');
      }
      react(s, won ? 'win' : 'loss');
      break;
    }
  }
  if (fallen.length) note(s, `Lost: ${fallen.map(ltShort).join(', ')}.`, 'bad');
  s.combat = null;
  checkEnding(s);
  return { result, lines };
}
