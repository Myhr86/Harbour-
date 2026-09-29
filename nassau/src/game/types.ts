// Core data model. Everything in GameState is plain JSON so it can be
// structuredClone'd, saved to localStorage and replayed deterministically.

export type DistrictId = 'docks' | 'alley' | 'salt' | 'rumrow' | 'shipyard' | 'fort';
export type FactionId = 'player' | 'knives' | 'hart' | 'company' | 'navy' | 'neutral';
export type BuildingId =
  | 'tavern'
  | 'vicehall'
  | 'berth'
  | 'prizecourt'
  | 'warehouse'
  | 'lookout'
  | 'chapel'
  | 'armory';
export type LtId = 'hawkins' | 'dixon' | 'bridge' | 'thorne' | 'crane' | 'beaumont';
export type OrderKind =
  | 'protect'
  | 'smuggle'
  | 'wreck'
  | 'parley'
  | 'muscle'
  | 'build'
  | 'repair'
  | 'batten'
  | 'rally';
export type ParleyKind = 'truce' | 'buy' | 'navy';
export type EndingId = 'king' | 'pardon' | 'washed';
export type Tone = 'good' | 'bad' | 'neutral' | 'storm';

export interface BuildingSlot {
  id: BuildingId;
  damaged: boolean;
}

export interface DistrictState {
  id: DistrictId;
  owner: FactionId;
  heat: number; // 0..100
  fort: number; // 0..5
  slots: (BuildingSlot | null)[];
  lockedDays: number; // income suspended after a lost brawl
  battened: boolean; // storm-proofed for the next hurricane
  guardedBy: LtId | null; // lieutenant posted here tonight (Protect Lane)
}

export interface FactionState {
  id: FactionId;
  strength: number; // 0..100
  treasury: number;
  attitude: number; // toward the player, -100..100
  truceDays: number;
  lastMove: string;
}

export type LtStatus = 'active' | 'wounded' | 'dead' | 'defected' | 'unrecruited';

export interface LtState {
  id: LtId;
  loyalty: number; // 0..100
  status: LtStatus;
  woundDays: number;
  orderedToday: boolean;
  idleDays: number;
}

export interface Ship {
  id: string;
  name: string;
  kind: 'sloop' | 'brig';
  damaged: boolean;
  secured: boolean;
  atSea: boolean;
  seaLeader: LtId | null;
}

export interface Clocks {
  hurricanePhase: 'calm' | 'warning';
  hurricaneHours: number; // hours until landfall while in warning
  nextHurricaneDay: number;
  flotsamDays: number; // wrecking bonus after a storm
  navyAlert: number; // 0..100; at 100 a blockade begins
  blockadeDays: number; // >0 while blockaded
}

export interface Resources {
  doubloons: number;
  rum: number;
  crew: number;
  morale: number; // 0..100
  infamy: number; // 0..100
  pardon: number; // 0..100
}

export interface PendingEvent {
  id: string;
  data?: Record<string, string | number>;
}

export type CombatContext = 'seize' | 'defend' | 'board' | 'navy' | 'rescue';
export type CombatObjective = 'rout' | 'helm' | 'hold' | 'extract';

export interface CombatSetup {
  mapId: string;
  objective: CombatObjective;
  enemy: FactionId;
  context: CombatContext;
  districtId?: DistrictId;
  title: string;
  stakes: string;
  winText: string;
  lossText: string;
  enemyCount: number;
  elite: boolean; // enemy side fields an officer with a pistol
  guardLt?: LtId; // lieutenant already on the spot
  lockedLt?: LtId; // e.g. the prisoner in a rescue
  holdRounds?: number;
}

export interface CombatUnit {
  uid: string;
  name: string;
  side: 'player' | 'enemy' | 'prisoner';
  kind: 'lt' | 'sailor' | 'thug' | 'marine' | 'officer' | 'guard' | 'prisoner';
  lt?: LtId;
  faction: FactionId;
  hp: number;
  maxHp: number;
  melee: number; // base hit %
  dmg: [number, number];
  init: number;
  x: number;
  y: number;
  ap: number;
  braced: boolean;
  stunned: boolean;
  rallied: boolean;
  parley: number; // 0 = cannot parley
  down: boolean;
  fled: boolean;
}

export interface CombatFx {
  id: number;
  kind: 'hit' | 'miss' | 'shot' | 'shove' | 'overboard' | 'parley' | 'rally' | 'flee' | 'brace';
  x: number;
  y: number;
  text: string;
}

export interface CombatState {
  setup: CombatSetup;
  w: number;
  h: number;
  tiles: string[];
  units: CombatUnit[];
  order: string[]; // uids sorted by initiative
  turnIdx: number;
  round: number;
  pistolUsed: { player: boolean; enemy: boolean };
  noise: number; // extra district heat from gunfire
  zoneLostRounds: number;
  result: null | 'win' | 'loss' | 'retreat';
  log: string[];
  fx: CombatFx[];
  fxSeq: number;
}

export interface LogEntry {
  day: number;
  text: string;
  tone: Tone;
}

export interface Bark {
  lt: LtId;
  text: string;
  mood: 'approve' | 'disapprove' | 'neutral';
}

export interface DayReport {
  day: number;
  lines: LogEntry[];
  income: number;
  wages: number;
  barks: Bark[];
  storm: boolean;
}

export interface GameStats {
  fightsWon: number;
  fightsLost: number;
  wrecks: number;
  smuggles: number;
  prizes: number;
  stormsSurvived: number;
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  day: number;
  crewName: string;
  res: Resources;
  districts: Record<DistrictId, DistrictState>;
  factions: Record<FactionId, FactionState>;
  lts: Record<LtId, LtState>;
  ships: Ship[];
  clocks: Clocks;
  pendingEvents: PendingEvent[];
  pendingCombat: CombatSetup | null;
  combat: CombatState | null;
  report: DayReport | null;
  log: LogEntry[];
  barks: Bark[];
  bankruptDays: number;
  holdDays: number;
  kingDays: number; // consecutive dawns holding 4+ districts
  companyDocksDays: number;
  ending: EndingId | null;
  endingReason: string;
  stats: GameStats;
  eventCooldowns: Record<string, number>;
  prizeAvailable: boolean;
  brawlDay: number; // last day a Muscle In brawl was launched
}
