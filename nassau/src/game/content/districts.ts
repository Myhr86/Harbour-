import type { BuildingId, DistrictId, FactionId } from '../types';

export interface DistrictDef {
  id: DistrictId;
  name: string;
  tagline: string;
  blurb: string;
  baseIncome: number;
  shipTrade: number; // share of income that dies under blockade (0..1)
  coastal: boolean; // can Wreck / hosts ships
  heatDrift: number; // extra heat per day while owned
  navyInterest: number; // multiplier on navy alert from this district's heat
  slots: number;
  adj: DistrictId[];
  startOwner: FactionId;
  startFort: number;
  startBuildings: BuildingId[];
  combatMap: string;
  // map art
  path: string;
  label: [number, number];
  buildingAnchors: [number, number][];
}

export const DISTRICTS: Record<DistrictId, DistrictDef> = {
  fort: {
    id: 'fort',
    name: 'Fort Slope',
    tagline: 'Prize court · the Governor’s view',
    blurb:
      'The old fort, the new prize court, and the smell of approaching civilization. Whoever sits here decides which ships were “lawfully taken”.',
    baseIncome: 70,
    shipTrade: 0.3,
    coastal: false,
    heatDrift: 0,
    navyInterest: 2,
    slots: 2,
    adj: ['shipyard', 'rumrow', 'alley'],
    startOwner: 'company',
    startFort: 3,
    startBuildings: ['prizecourt'],
    combatMap: 'market',
    path: 'M 70 118 C 140 92 250 84 330 96 L 372 232 C 330 252 290 262 250 272 L 96 256 C 76 210 62 160 70 118 Z',
    label: [205, 170],
    buildingAnchors: [
      [150, 212],
      [290, 138],
    ],
  },
  shipyard: {
    id: 'shipyard',
    name: 'Shipyard',
    tagline: 'Haul · careen · repair',
    blurb:
      'Careening beach, pitch pots and a crane older than the Governor. Repairs ships, and pays handsomely for what the reef brings in.',
    baseIncome: 60,
    shipTrade: 0.4,
    coastal: true,
    heatDrift: 0,
    navyInterest: 1,
    slots: 2,
    adj: ['fort', 'docks', 'rumrow'],
    startOwner: 'neutral',
    startFort: 1,
    startBuildings: ['berth'],
    combatMap: 'wharf',
    path: 'M 340 94 C 430 76 560 64 660 78 L 676 196 C 620 206 580 214 540 222 L 380 232 Z',
    label: [510, 148],
    buildingAnchors: [
      [420, 196],
      [610, 116],
    ],
  },
  rumrow: {
    id: 'rumrow',
    name: 'Rum Row',
    tagline: 'Taverns · vice halls',
    blurb:
      'Taverns shoulder to shoulder, and every one of them sings off-key. Morale is brewed here. So is scandal.',
    baseIncome: 60,
    shipTrade: 0,
    coastal: false,
    heatDrift: 1,
    navyInterest: 1,
    slots: 2,
    adj: ['fort', 'shipyard', 'docks', 'alley', 'salt'],
    startOwner: 'player',
    startFort: 1,
    startBuildings: ['tavern', 'vicehall'],
    combatMap: 'tavern',
    path: 'M 262 282 L 380 240 L 540 230 L 572 366 L 430 404 L 280 388 Z',
    label: [420, 318],
    buildingAnchors: [
      [330, 300],
      [500, 364],
    ],
  },
  docks: {
    id: 'docks',
    name: 'The Docks',
    tagline: 'Berths · bollards · navy eyes',
    blurb:
      'Berths, bollards and a harbourmaster who counts badly on purpose. The richest ground on the island, and the first thing a navy cannon points at.',
    baseIncome: 95,
    shipTrade: 0.8,
    coastal: true,
    heatDrift: 0,
    navyInterest: 1.5,
    slots: 2,
    adj: ['shipyard', 'rumrow', 'salt'],
    startOwner: 'neutral',
    startFort: 1,
    startBuildings: [],
    combatMap: 'wharf',
    path: 'M 548 226 L 680 204 C 740 222 780 240 800 262 L 806 404 L 694 424 L 580 370 Z',
    label: [690, 300],
    buildingAnchors: [
      [620, 250],
      [740, 380],
    ],
  },
  alley: {
    id: 'alley',
    name: 'Thieves’ Alley',
    tagline: 'Cheap muscle · high heat',
    blurb:
      'Cheap muscle, cheaper rum, and a lane nobody lights. Hands for hire by the dozen — and the Governor’s spies love it.',
    baseIncome: 55,
    shipTrade: 0,
    coastal: false,
    heatDrift: 3,
    navyInterest: 1,
    slots: 1,
    adj: ['fort', 'rumrow', 'salt'],
    startOwner: 'knives',
    startFort: 2,
    startBuildings: [],
    combatMap: 'alley',
    path: 'M 84 272 L 254 288 L 272 392 L 334 424 L 306 546 C 230 560 160 548 118 524 C 84 480 66 420 84 272 Z',
    label: [180, 410],
    buildingAnchors: [[220, 492]],
  },
  salt: {
    id: 'salt',
    name: 'Salt Market',
    tagline: 'Legal-ish trade · Company pressure',
    blurb:
      'Salt fish, sailcloth, and ledgers the Company would love to read. Respectable money, which is why Hart wants it.',
    baseIncome: 80,
    shipTrade: 0.5,
    coastal: true,
    heatDrift: 0,
    navyInterest: 1,
    slots: 2,
    adj: ['alley', 'rumrow', 'docks'],
    startOwner: 'hart',
    startFort: 2,
    startBuildings: ['warehouse'],
    combatMap: 'market',
    path: 'M 344 426 L 436 410 L 584 378 L 694 432 L 706 540 C 640 566 580 580 520 584 L 324 556 Z',
    label: [520, 488],
    buildingAnchors: [
      [420, 520],
      [640, 470],
    ],
  },
};

export const DISTRICT_ORDER: DistrictId[] = ['docks', 'rumrow', 'shipyard', 'alley', 'salt', 'fort'];
