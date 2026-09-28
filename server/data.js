// Static content for Harbor Compact: districts, starting assets, NPC cast,
// crimes, evidence kinds and event templates. Everything here is plain data
// so it can be tuned without touching game rules.

export const FACTIONS = {
  civilian: { name: 'Civilian', blurb: 'A legal job and a modest apartment. For now.' },
  family: { name: 'Family', blurb: 'Protection, smuggling, fronts, territory.' },
  board: { name: 'Board', blurb: 'Companies, real estate, laundering, "consulting".' },
  badge: { name: 'Badge', blurb: 'Investigations, raids, evidence — and envelopes.' },
};

export const TRACKS = ['family', 'board', 'badge'];

export const DISTRICTS = [
  { id: 'docks', name: 'Docks', rackets: 12, businessTax: 6, skim: 5, baseHeat: 30 },
  { id: 'downtown', name: 'Downtown', rackets: 8, businessTax: 10, skim: 0, baseHeat: 25 },
  { id: 'industrial', name: 'Industrial', rackets: 14, businessTax: 5, skim: 3, baseHeat: 40 },
  { id: 'suburbs', name: 'Suburbs', rackets: 6, businessTax: 8, skim: 0, baseHeat: 15 },
  { id: 'riverfront', name: 'Riverfront', rackets: 10, businessTax: 7, skim: 4, baseHeat: 20 },
];

// value is in dollars (ledger display); price = value / 100 is what it costs in play.
// owner is an NPC key (see NPCS) or null for city-owned / for sale.
export const ASSETS = [
  { id: 'rivergate-tower', name: 'Rivergate Tower', type: 'Real Estate', district: 'downtown', value: 1200000, income: 60, owner: 'lena' },
  { id: 'velvet-room', name: 'Velvet Room', type: 'Nightclub', district: 'downtown', value: 620000, income: 35, owner: 'price', dirty: 2 },
  { id: 'dockside-exports', name: 'Dockside Exports', type: 'Shipping Co.', district: 'docks', value: 810000, income: 45, owner: null },
  { id: 'harbor-exports', name: 'Harbor Exports', type: 'Shipping Co.', district: 'docks', value: 540000, income: 30, owner: 'lena', dirty: 1 },
  { id: 'marcone-construction', name: 'Marcone Construction', type: 'Construction', district: 'industrial', value: 430000, income: 25, owner: 'marcone', dirty: 3 },
  { id: 'pier17-warehouse', name: 'Pier 17 Warehouse', type: 'Warehouse', district: 'industrial', value: 260000, income: 15, owner: null },
  { id: 'marina-bistro', name: 'The Marina Bistro', type: 'Restaurant', district: 'riverfront', value: 210000, income: 14, owner: 'russo', dirty: 2 },
  { id: 'riverside-casino', name: 'Riverside Casino', type: 'Casino', district: 'riverfront', value: 950000, income: 55, owner: null },
  { id: 'elm-laundromat', name: 'Elm St. Laundromat', type: 'Laundromat', district: 'suburbs', value: 150000, income: 10, owner: null },
  { id: 'sunset-motors', name: 'Sunset Motors', type: 'Car Lot', district: 'suburbs', value: 320000, income: 18, owner: null },
];

export const NPCS = [
  { key: 'russo', name: 'Vito "Books" Russo', faction: 'family', job: 'Restaurateur', district: 'riverfront', rep: 40 },
  { key: 'tommy', name: 'Tommy Shoes', faction: 'family', job: 'Dock Worker', district: 'docks', rep: 18 },
  { key: 'greco', name: 'T. Greco', faction: 'family', job: 'Bouncer', district: 'industrial', rep: 22 },
  { key: 'vale', name: 'J. Vale', faction: 'family', job: 'Cab Driver', district: 'docks', rep: 12 },
  { key: 'marcone', name: 'L. Marcone', faction: 'family', job: 'Contractor', district: 'industrial', rep: 35 },
  { key: 'lena', name: 'Lena Park', faction: 'board', job: 'Developer', district: 'downtown', rep: 38 },
  { key: 'price', name: 'A. Price', faction: 'board', job: 'Consultant', district: 'downtown', rep: 25 },
  { key: 'hale', name: 'Det. Marcus Hale', faction: 'badge', job: 'Detective', district: 'docks', rep: 30 },
  { key: 'reyes', name: 'Capt. Angela Reyes', faction: 'badge', job: 'Captain', district: 'downtown', rep: 45 },
];

// Territory starts with NPC holders so the map is never empty.
export const STARTING_HOLDERS = { docks: 'russo', industrial: null, downtown: 'lena', suburbs: null, riverfront: 'russo' };

export const JOBS = ['Accountant', 'Dock Worker', 'Line Cook', 'Cab Driver', 'Paralegal', 'Bartender', 'Nurse', 'Mechanic'];

export const CRIMES = {
  shakedown: { label: 'Shake down a shop', cash: [150, 400], heat: 6, cooldown: 30 },
  smuggle: { label: 'Move unmarked cargo', cash: [450, 900], heat: 12, cooldown: 60, districts: ['docks', 'riverfront', 'industrial'] },
  protection: { label: 'Collect protection', cash: [250, 550], heat: 4, cooldown: 45, needsTerritory: true },
};

// status → multiplier on evidence weight
export const EVIDENCE_STATUS = { Inconclusive: 0.2, Partial: 0.5, Collected: 0.8, Verified: 1 };

export const EVIDENCE_KINDS = [
  { kind: 'financial', label: 'Financial Records', weight: 14 },
  { kind: 'wiretap', label: 'Wiretap Recording', weight: 18 },
  { kind: 'surveillance', label: 'Surveillance Logs', weight: 12 },
  { kind: 'photo', label: 'Warehouse Photo', weight: 10 },
  { kind: 'transfer', label: 'Bank Transfer Record', weight: 12 },
  { kind: 'ledger', label: 'Shipping Ledger Anomaly', weight: 16 },
];

export const EVENT_TEMPLATES = {
  heist: {
    title: 'Warehouse Heist',
    objective: 'Steal contraband and extract',
    roles: ['Driver', 'Lookout', 'Inside Man', 'Muscle', 'Fence'],
    roleFaction: { Driver: 'family', Lookout: 'family', 'Inside Man': null, Muscle: 'family', Fence: 'family' },
    cuts: { Driver: 20, Lookout: 15, 'Inside Man': 20, Muscle: 20, Fence: 25 },
    payout: [6000, 14000],
    heatIfFailed: 25,
  },
  raid: {
    title: 'Raid',
    objective: 'Serve the warrant and seize evidence',
    roles: ['Lead', 'Backup', 'Backup 2', 'Judge'],
    roleFaction: { Lead: 'badge', Backup: 'badge', 'Backup 2': 'badge', Judge: 'official' },
  },
  board_meeting: {
    title: 'Board Meeting',
    objective: 'Vote on the proposal',
    roles: ['Chair', 'Seat 2', 'Seat 3', 'Seat 4', 'Seat 5'],
    roleFaction: { Chair: 'board', 'Seat 2': 'board', 'Seat 3': 'board', 'Seat 4': 'board', 'Seat 5': 'board' },
    optional: ['Seat 2', 'Seat 3', 'Seat 4', 'Seat 5'],
  },
  sitdown: {
    title: 'Sit-Down',
    objective: 'A deal, a warning, or a body',
    roles: ['Host', 'Guest', 'Witness'],
    roleFaction: { Host: 'family', Guest: null, Witness: null },
    optional: ['Witness'],
  },
};

export const OFFICIAL_NAMES = {
  mayor: ['Mayor Delia Walsh', 'Mayor Frank Oduya', 'Mayor Ruth Castellano', 'Mayor Ben Aldridge'],
  commissioner: ['Commissioner Pratt', 'Commissioner Ng', 'Commissioner DeLuca', 'Commissioner Hartley'],
  judge: ['Judge Halloran', 'Judge Whitcomb', 'Judge Amari', 'Judge Szabo'],
};

// NPC ambient chatter keyed by faction. {district} and {name} are substituted.
export const CHATTER = {
  family: [
    'That new place on 3rd is a nice little earner. Quiet books. Good food.',
    'Somebody\'s been moving cargo through {district} without asking.',
    'Tell your friend the envelope was light.',
    'We move on your signal.',
    'Nobody saw nothing. That\'s the neighborhood.',
  ],
  board: [
    'We should discuss the waterfront lease before the meeting.',
    'Just a routine review. Nothing to worry about.',
    'Consulting fees are up this quarter. Very healthy.',
    'The zoning board owes me a favor. Or three.',
    'Interesting.',
  ],
  badge: [
    'Increased patrols in {district} tonight.',
    'Got a tip about unmarked cargo at the docks tonight.',
    'Heard the Velvet Room is under audit.',
    'Anyone with information, my door is open.',
    'Funny how the cameras always go down on Tuesdays.',
  ],
};
