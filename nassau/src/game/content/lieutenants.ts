import type { LtId } from '../types';

export interface PortraitLook {
  skin: string;
  hair: string;
  hat: 'tricorn' | 'bandana' | 'cleric' | 'bicorne' | 'scarf' | 'none';
  hatColor: string;
  coat: string;
  beard: 'full' | 'stubble' | 'none' | 'grey';
  scar?: boolean;
  earring?: boolean;
}

export interface LtDef {
  id: LtId;
  name: string;
  nick: string;
  role: string;
  vice: string;
  specialty: string;
  quirk: string;
  stats: { melee: number; parley: number; sea: number; trade: number }; // 1..5
  startLoyalty: number;
  starting: boolean;
  look: PortraitLook;
  accent: string;
}

export const LIEUTENANTS: Record<LtId, LtDef> = {
  hawkins: {
    id: 'hawkins',
    name: 'Isaac Hawkins',
    nick: 'Red',
    role: 'Quartermaster',
    vice: 'Ledgers',
    specialty: 'Economy, wages, warehouses. Orders he leads pay out more.',
    quirk: 'Hates unpaid crew: loses loyalty fast when wages are missed.',
    stats: { melee: 3, parley: 2, sea: 2, trade: 5 },
    startLoyalty: 68,
    starting: true,
    look: { skin: '#c68d62', hair: '#7a2e1c', hat: 'bandana', hatColor: '#9c2a24', coat: '#3b2a1e', beard: 'full' },
    accent: '#2bb3a3',
  },
  dixon: {
    id: 'dixon',
    name: 'Anne Dixon',
    nick: 'Gunner',
    role: 'Gunner',
    vice: 'Brawling',
    specialty: 'Boarding and brawls. Best blade in Nassau.',
    quirk: 'Starts fights if the crew is merry and she is left idle.',
    stats: { melee: 5, parley: 1, sea: 3, trade: 1 },
    startLoyalty: 64,
    starting: true,
    look: { skin: '#b07650', hair: '#2a1a12', hat: 'tricorn', hatColor: '#1f2a2a', coat: '#1d4a47', beard: 'none', earring: true },
    accent: '#b8342c',
  },
  bridge: {
    id: 'bridge',
    name: 'Tobias Bridge',
    nick: 'Navigator',
    role: 'Navigator',
    vice: 'Cowardice',
    specialty: 'Smuggling routes and storm survival. Brilliant at sea.',
    quirk: 'A coward in street brawls (−15% melee ashore, +10% on deck).',
    stats: { melee: 2, parley: 2, sea: 5, trade: 2 },
    startLoyalty: 60,
    starting: true,
    look: { skin: '#d9a77c', hair: '#6b4a2a', hat: 'scarf', hatColor: '#28506a', coat: '#2c3b4a', beard: 'stubble' },
    accent: '#c9a24a',
  },
  thorne: {
    id: 'thorne',
    name: 'Father Elias Thorne',
    nick: 'Father',
    role: 'Negotiator',
    vice: 'Drink',
    specialty: 'Best Parley in the game. Can talk the navy down a step.',
    quirk: 'Raises scandal when he leads orders in a district with a Vice Hall.',
    stats: { melee: 1, parley: 5, sea: 1, trade: 2 },
    startLoyalty: 62,
    starting: true,
    look: { skin: '#e2b894', hair: '#c9c2b4', hat: 'cleric', hatColor: '#1a1612', coat: '#221c18', beard: 'grey' },
    accent: '#8a6cc4',
  },
  crane: {
    id: 'crane',
    name: 'Jonah Crane',
    nick: 'Bosun',
    role: 'Ex-Navy Bosun',
    vice: 'Pride',
    specialty: 'Knows navy patrol lanes; strong on deck and on the wharf.',
    quirk: 'Deserted the King. Loves a fight with the navy, hates Parleying with it.',
    stats: { melee: 4, parley: 1, sea: 4, trade: 1 },
    startLoyalty: 55,
    starting: false,
    look: { skin: '#8a5a3c', hair: '#1a1410', hat: 'bicorne', hatColor: '#1c2a44', coat: '#26375a', beard: 'stubble', scar: true },
    accent: '#5b7fb5',
  },
  beaumont: {
    id: 'beaumont',
    name: 'Solange Beaumont',
    nick: 'the Fence',
    role: 'Fence',
    vice: 'Greed',
    specialty: 'Moves stolen cargo and Company paper. Strong Parley and trade.',
    quirk: 'Sells to the highest bidder — Hart’s bribes bite harder.',
    stats: { melee: 2, parley: 4, sea: 1, trade: 4 },
    startLoyalty: 50,
    starting: false,
    look: { skin: '#9b6a48', hair: '#3a1f14', hat: 'tricorn', hatColor: '#4a2a3a', coat: '#5a2e3e', beard: 'none', earring: true },
    accent: '#c9a24a',
  },
};

export const LT_ORDER: LtId[] = ['hawkins', 'dixon', 'bridge', 'thorne', 'crane', 'beaumont'];
