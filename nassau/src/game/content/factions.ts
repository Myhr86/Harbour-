import type { FactionId } from '../types';

export interface FactionDef {
  id: FactionId;
  name: string;
  short: string;
  color: string;
  ink: string; // darker ink for text/borders
  blurb: string;
  startStrength: number;
  startTreasury: number;
  startAttitude: number;
  // utility weights for the AI
  weights: { expand: number; raid: number; fortify: number; parley: number };
  unitName: string;
  officerName: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  player: {
    id: 'player',
    name: 'Your Crew',
    short: 'You',
    color: '#2bb3a3',
    ink: '#6fe0d2',
    blurb: 'A captain who stayed ashore, and the crew who stayed with you.',
    startStrength: 50,
    startTreasury: 0,
    startAttitude: 0,
    weights: { expand: 0, raid: 0, fortify: 0, parley: 0 },
    unitName: 'Sailor',
    officerName: 'Captain',
  },
  knives: {
    id: 'knives',
    name: 'Red Knives',
    short: 'Knives',
    color: '#b8342c',
    ink: '#f07a6c',
    blurb: 'Rival captains with more blades than sense. They want Thieves’ Alley and the wrecking rights.',
    startStrength: 52,
    startTreasury: 200,
    startAttitude: -20,
    weights: { expand: 1.0, raid: 1.5, fortify: 0.5, parley: 0.2 },
    unitName: 'Cutthroat',
    officerName: 'Knife Captain',
  },
  hart: {
    id: 'hart',
    name: 'Hart’s Faction',
    short: 'Hart',
    color: '#8a6cc4',
    ink: '#c3aef0',
    blurb: '“Respectable” pirates walking toward legitimacy. They want the Salt Market and your lieutenants.',
    startStrength: 46,
    startTreasury: 300,
    startAttitude: 10,
    weights: { expand: 0.8, raid: 0.5, fortify: 0.8, parley: 1.3 },
    unitName: 'Hart’s Man',
    officerName: 'Bosun Hart',
  },
  company: {
    id: 'company',
    name: 'The Charter Company',
    short: 'Company',
    color: '#c9a24a',
    ink: '#f0d27a',
    blurb: 'Wants the island civilized and profitable. Buys districts, funds the navy, hates wrecking.',
    startStrength: 60,
    startTreasury: 600,
    startAttitude: -5,
    weights: { expand: 1.2, raid: 0.4, fortify: 0.6, parley: 0.7 },
    unitName: 'Company Guard',
    officerName: 'Factor',
  },
  navy: {
    id: 'navy',
    name: 'Governor’s Navy',
    short: 'Navy',
    color: '#5b7fb5',
    ink: '#a9c3ea',
    blurb: 'Not a gang. A clock. Raises blockades and patrols. Hard to bribe, expensive to fight.',
    startStrength: 90,
    startTreasury: 0,
    startAttitude: -10,
    weights: { expand: 0, raid: 0, fortify: 0, parley: 0 },
    unitName: 'Marine',
    officerName: 'Lieutenant RN',
  },
  neutral: {
    id: 'neutral',
    name: 'Unclaimed',
    short: 'Free',
    color: '#7d6a55',
    ink: '#bca88c',
    blurb: 'Dock toughs and a harbourmaster with his hand out.',
    startStrength: 20,
    startTreasury: 0,
    startAttitude: 0,
    weights: { expand: 0, raid: 0, fortify: 0, parley: 0 },
    unitName: 'Dock Tough',
    officerName: 'Harbourmaster’s Man',
  },
};

export const RIVALS: FactionId[] = ['knives', 'hart', 'company'];
