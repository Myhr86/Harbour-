import type { DistrictId, DistrictState, FactionId, FactionState, GameState, LtId, LtState } from './types';
import { DISTRICTS, DISTRICT_ORDER } from './content/districts';
import { FACTIONS } from './content/factions';
import { LIEUTENANTS, LT_ORDER } from './content/lieutenants';
import { int } from './rng';
import { note } from './helpers';

export function newGame(seed: number, crewName: string): GameState {
  const districts = {} as Record<DistrictId, DistrictState>;
  for (const id of DISTRICT_ORDER) {
    const d = DISTRICTS[id];
    const slots: DistrictState['slots'] = [];
    for (let i = 0; i < d.slots; i++) {
      const b = d.startBuildings[i];
      slots.push(b ? { id: b, damaged: false } : null);
    }
    districts[id] = {
      id,
      owner: d.startOwner,
      heat: id === 'alley' ? 30 : 12,
      fort: d.startFort,
      slots,
      lockedDays: 0,
      battened: false,
      guardedBy: null,
    };
  }
  const factions = {} as Record<FactionId, FactionState>;
  for (const f of Object.values(FACTIONS)) {
    factions[f.id] = {
      id: f.id,
      strength: f.startStrength,
      treasury: f.startTreasury,
      attitude: f.startAttitude,
      truceDays: 0,
      lastMove: '',
    };
  }
  const lts = {} as Record<LtId, LtState>;
  for (const id of LT_ORDER) {
    const d = LIEUTENANTS[id];
    lts[id] = {
      id,
      loyalty: d.startLoyalty,
      status: d.starting ? 'active' : 'unrecruited',
      woundDays: 0,
      orderedToday: false,
      idleDays: 0,
    };
  }
  const s: GameState = {
    version: 1,
    seed: seed >>> 0,
    rng: seed >>> 0,
    day: 1,
    crewName: crewName.trim() || 'Cooper’s Crew',
    res: { doubloons: 450, rum: 90, crew: 30, morale: 60, infamy: 10, pardon: 0 },
    districts,
    factions,
    lts,
    ships: [{ id: 'swallow', name: 'Swallow', kind: 'sloop', damaged: false, secured: false, atSea: false, seaLeader: null }],
    clocks: {
      hurricanePhase: 'calm',
      hurricaneHours: 0,
      nextHurricaneDay: 0,
      flotsamDays: 0,
      navyAlert: 15,
      blockadeDays: 0,
    },
    pendingEvents: [{ id: 'arrival' }],
    pendingCombat: null,
    combat: null,
    report: null,
    log: [],
    barks: [],
    bankruptDays: 0,
    holdDays: 0,
    kingDays: 0,
    companyDocksDays: 0,
    ending: null,
    endingReason: '',
    stats: { fightsWon: 0, fightsLost: 0, wrecks: 0, smuggles: 0, prizes: 0, stormsSurvived: 0 },
    eventCooldowns: {},
    prizeAvailable: false,
    brawlDay: 0,
  };
  s.clocks.nextHurricaneDay = int(s, 7, 9);
  s.eventCooldowns.prizeLast = 1;
  note(s, `${s.crewName} drops anchor in Nassau. Rum Row is yours. The rest is negotiable.`, 'good');
  return s;
}
