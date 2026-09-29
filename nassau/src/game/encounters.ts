import type { CombatSetup, DistrictId, FactionId, GameState, LtId } from './types';
import { DISTRICTS } from './content/districts';
import { FACTIONS } from './content/factions';
import { clamp } from './helpers';

export function seizeSetup(s: GameState, d: DistrictId, lt?: LtId): CombatSetup {
  const dist = s.districts[d];
  const def = DISTRICTS[d];
  const owner = dist.owner;
  const f = s.factions[owner];
  const count = owner === 'neutral' ? 3 + dist.fort : clamp(3 + dist.fort + Math.floor(f.strength / 25), 4, 8);
  return {
    mapId: def.combatMap === 'tavern' ? 'alley' : def.combatMap,
    objective: 'rout',
    enemy: owner,
    context: 'seize',
    districtId: d,
    title: `Muscle in on ${def.name}`,
    stakes: `Rout ${FACTIONS[owner].name} and ${def.name} is yours. Lose, and a district of yours goes without income for 2 days.`,
    winText: `${def.name} flies your colours now.`,
    lossText: `Beaten back from ${def.name}.`,
    enemyCount: count,
    elite: owner !== 'neutral',
    guardLt: lt,
  };
}

export function defendSetup(s: GameState, d: DistrictId, attacker: FactionId, guard?: LtId): CombatSetup {
  const def = DISTRICTS[d];
  const f = s.factions[attacker];
  const hold = def.combatMap === 'tavern';
  return {
    mapId: def.combatMap,
    objective: hold ? 'hold' : 'rout',
    holdRounds: hold ? 5 : undefined,
    enemy: attacker,
    context: 'defend',
    districtId: d,
    title: `${FACTIONS[attacker].name} raid ${def.name}`,
    stakes: hold
      ? `Hold the doorway for 5 rounds. Lose and ${def.name} earns nothing for 2 days — or falls outright if unfortified.`
      : `Drive them off. Lose and ${def.name} earns nothing for 2 days — or falls outright if unfortified.`,
    winText: `${FACTIONS[attacker].name} limp home from ${def.name}.`,
    lossText: `${FACTIONS[attacker].name} run riot through ${def.name}.`,
    enemyCount: clamp(3 + Math.floor(f.strength / 15), 4, 8),
    elite: true,
    guardLt: guard,
  };
}

export function boardSetup(): CombatSetup {
  return {
    mapId: 'brig',
    objective: 'helm',
    enemy: 'company',
    context: 'board',
    title: 'Board the “Good Intent”',
    stakes: 'Reach the helm with no defender beside you, or clear the deck. Lose and the prize sails away.',
    winText: 'The “Good Intent” strikes her colours. A brig for the crew!',
    lossText: 'Thrown back over the rail. The brig limps off toward Charles Town.',
    enemyCount: 7,
    elite: true,
  };
}

export function navySetup(s: GameState, d: DistrictId): CombatSetup {
  const def = DISTRICTS[d];
  return {
    mapId: 'wharf',
    objective: 'rout',
    enemy: 'navy',
    context: 'navy',
    districtId: d,
    title: `Marines land at ${def.name}`,
    stakes: 'The King’s marines are drilled, armoured and angry. Lose and the navy seizes the district and a ship.',
    winText: 'The marines row back to the frigate, minus their dignity.',
    lossText: 'Redcoats hold the wharf. The Company thanks them warmly.',
    enemyCount: s.clocks.blockadeDays > 0 ? 7 : 6,
    elite: true,
  };
}

export function rescueSetup(): CombatSetup {
  return {
    mapId: 'market',
    objective: 'extract',
    enemy: 'company',
    context: 'rescue',
    title: 'Break Bridge out of the lock-up',
    stakes: 'Reach Tobias, free him, and get him to any exit (X). If he falls, the rescue fails.',
    winText: 'Tobias is out, complaining about the smell.',
    lossText: 'The rescue collapses. Tobias stays in irons and the fine doubles.',
    enemyCount: 4,
    elite: true,
    lockedLt: 'bridge',
  };
}
