import type { BuildingId } from '../types';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: number;
  income: number;
  blurb: string;
  effect: string;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  tavern: {
    id: 'tavern',
    name: 'Tavern',
    cost: 150,
    income: 40,
    blurb: 'Warm rum, cold pies, loud opinions.',
    effect: '+40/day · +1 morale/day',
  },
  vicehall: {
    id: 'vicehall',
    name: 'Vice Hall',
    cost: 200,
    income: 85,
    blurb: 'Dice, cards and company. Nobody asks, nobody tells, everybody gossips.',
    effect: '+85/day · +4 heat/day · scandal slows the pardon',
  },
  berth: {
    id: 'berth',
    name: 'Shipyard Berth',
    cost: 240,
    income: 40,
    blurb: 'A slip, a crane and men who can caulk drunk.',
    effect: '+40/day · repairs ships · wreck payouts +50%',
  },
  prizecourt: {
    id: 'prizecourt',
    name: 'Prize Court',
    cost: 400,
    income: 60,
    blurb: 'Where stolen ships become “lawful prizes” for a modest fee.',
    effect: '+60/day · prize loot +50% · +1 pardon/day',
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    cost: 150,
    income: 20,
    blurb: 'Barrels stacked to the rafters. Some of them even hold what the label says.',
    effect: '+20/day · smuggling +40% · +25 rum stores',
  },
  lookout: {
    id: 'lookout',
    name: 'Lookout',
    cost: 120,
    income: 0,
    blurb: 'A boy with a spyglass and a bell.',
    effect: '+1 fortification · hurricanes seen a day earlier · patrol risk −8%',
  },
  chapel: {
    id: 'chapel',
    name: 'Chapel',
    cost: 180,
    income: 0,
    blurb: 'The priest’s office. Bring your sins, leave a coin.',
    effect: '−6 heat/day here · +1 pardon/day · Parley +10%',
  },
  armory: {
    id: 'armory',
    name: 'Armory',
    cost: 200,
    income: 0,
    blurb: 'Cutlasses sharpened, pikes straightened, powder kept mostly dry.',
    effect: '+1 sailor in every fight · +5% crew melee',
  },
};

export const BUILDING_ORDER: BuildingId[] = [
  'tavern',
  'vicehall',
  'berth',
  'prizecourt',
  'warehouse',
  'lookout',
  'chapel',
  'armory',
];
