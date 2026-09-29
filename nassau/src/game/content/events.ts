// Hand-authored events. `random` events are drawn at dawn from the eligible
// pool; the others are pushed by clocks, the AI, or loyalty checks.
import type { DistrictId, FactionId, GameState, LtId, PendingEvent } from '../types';
import { DISTRICTS } from './districts';
import { FACTIONS } from './factions';
import { LIEUTENANTS } from './lieutenants';
import { chance } from '../rng';
import {
  addHeat,
  addPardon,
  adjustLoyalty,
  clamp,
  globalHeat,
  isBlockaded,
  ltShort,
  note,
  playerDistricts,
  playerHasBuilding,
  react,
} from '../helpers';
import { boardSetup, defendSetup, navySetup, rescueSetup, seizeSetup } from '../encounters';

export type EventArt = 'storm' | 'ship' | 'navy' | 'knives' | 'hart' | 'company' | 'chapel' | 'crew' | 'rum' | 'wedding' | 'recruit' | 'harbour';

export interface EventChoice {
  label: string;
  detail: string;
  disabled?: string; // reason it can't be taken
  resolve: (s: GameState) => void;
}

export interface EventDef {
  id: string;
  title: string;
  art: EventArt;
  random: boolean;
  weight: number;
  cooldown: number;
  speaker?: (s: GameState, ev: PendingEvent) => LtId | undefined;
  eligible?: (s: GameState) => boolean;
  body: (s: GameState, ev: PendingEvent) => string;
  choices: (s: GameState, ev: PendingEvent) => EventChoice[];
}

const has = (s: GameState, id: LtId) => s.lts[id].status === 'active';
const money = (s: GameState, n: number) => (s.res.doubloons >= n ? undefined : `Needs ${n} doubloons`);
const needLt = (s: GameState, id: LtId) => (has(s, id) ? undefined : `${ltShort(id)} is not available`);

export const EVENTS: Record<string, EventDef> = {
  arrival: {
    id: 'arrival',
    title: 'Nassau, 1718',
    art: 'harbour',
    random: false,
    weight: 0,
    cooldown: 0,
    speaker: () => 'hawkins',
    body: (s) =>
      `You stepped off the ${s.ships[0]?.name ?? 'Swallow'} three weeks ago meaning to stay one night. Now ${s.crewName} own a tavern, a vice hall, and a great many debts on Rum Row.\n\nThe Docks are unclaimed — the richest ground on the island, guarded only by the harbourmaster’s toughs. The Red Knives hold Thieves’ Alley, Hart’s people sit on the Salt Market, and the Charter Company has the prize court on Fort Slope.\n\nOffshore, the Governor’s Navy watches. Further out, the hurricane season is turning.`,
    choices: () => [
      {
        label: '“We start with the Docks.”',
        detail: 'Win by holding 4 of 6 districts for 3 dawns, holding the Prize Court + Shipyard for 8 days, or earning a full pardon.',
        resolve: (s) => {
          note(s, 'Hawkins: “Wages first. Glory after. Then the Docks.”', 'neutral');
        },
      },
    ],
  },

  hurricaneWarning: {
    id: 'hurricaneWarning',
    title: 'Hurricane Warning',
    art: 'storm',
    random: false,
    weight: 0,
    cooldown: 0,
    speaker: () => 'bridge',
    body: (s) =>
      `The glass is falling like a stone. Fishermen are hauling their boats up the beach and the gulls have gone inland.\n\nA hurricane is approaching from the east-southeast: landfall in about ${s.clocks.hurricaneHours} hours. It will drink rum like a crew on shore leave, tear the roofs off anything not battened down, and sink ships left riding at anchor.\n\nBatten Down a coastal district to dock your ships.`,
    choices: (s) => [
      {
        label: 'Lay in extra rum (−80 doubloons, +40 rum)',
        detail: 'Storms drink rum. A dry storm is a mutinous storm.',
        disabled: money(s, 80),
        resolve: (st) => {
          st.res.doubloons -= 80;
          st.res.rum += 40;
          note(st, 'Every cask on the waterfront is bought before the price triples.', 'good');
        },
      },
      {
        label: 'One last run before the storm',
        detail: 'Bridge takes a ship out tonight: +160 doubloons now, but a ship at sea at landfall may sink.',
        disabled: needLt(s, 'bridge') ?? (s.ships.some((sh) => !sh.atSea && !sh.damaged) ? undefined : 'No ship available'),
        resolve: (st) => {
          const sh = st.ships.find((x) => !x.atSea && !x.damaged)!;
          sh.atSea = true;
          sh.seaLeader = 'bridge';
          sh.secured = false;
          st.res.doubloons += 160;
          adjustLoyalty(st, 'bridge', -6);
          st.lts.bridge.orderedToday = true;
          note(st, `The ${sh.name} slips out on the last fair wind. Bridge is not happy. +160 doubloons.`, 'neutral');
        },
      },
      {
        label: 'Noted. Get to work.',
        detail: 'Use your orders to Batten Down and Repair.',
        resolve: () => {},
      },
    ],
  },

  raid: {
    id: 'raid',
    title: 'Raid!',
    art: 'knives',
    random: false,
    weight: 0,
    cooldown: 0,
    speaker: (s, ev) => (ev.data?.guard as LtId) || (has(s, 'dixon') ? 'dixon' : undefined),
    body: (_s, ev) => {
      const f = FACTIONS[ev.data!.faction as FactionId];
      const d = DISTRICTS[ev.data!.district as DistrictId];
      return `${f.name} come down on ${d.name} at first light, clubs out and torches lit. ${ev.data?.guard ? `${ltShort(ev.data.guard as LtId)} is already on the spot.` : 'Nobody was posted there last night.'}\n\nFight them in the street, pay them off, or let the district go.`;
    },
    choices: (s, ev) => {
      const fid = ev.data!.faction as FactionId;
      const did = ev.data!.district as DistrictId;
      const bribe = 60 + Math.round(s.factions[fid].strength * 2);
      return [
        {
          label: 'Fight for the street',
          detail: 'Tactical combat. Winning bloodies the raiders.',
          resolve: (st) => {
            st.pendingCombat = defendSetup(st, did, fid, (ev.data?.guard as LtId) || undefined);
          },
        },
        {
          label: `Pay them off (−${bribe} doubloons)`,
          detail: 'They go away. For now. Morale −4.',
          disabled: money(s, bribe),
          resolve: (st) => {
            st.res.doubloons -= bribe;
            st.res.morale = clamp(st.res.morale - 4, 0, 100);
            st.factions[fid].treasury += bribe;
            note(st, `You pay ${FACTIONS[fid].name} to leave ${DISTRICTS[did].name} alone.`, 'neutral');
          },
        },
        {
          label: `Yield ${DISTRICTS[did].name}`,
          detail: 'Lose the district without a fight. Morale −10.',
          resolve: (st) => {
            st.districts[did].owner = fid;
            st.districts[did].fort = 1;
            st.res.morale = clamp(st.res.morale - 10, 0, 100);
            note(st, `${DISTRICTS[did].name} falls to ${FACTIONS[fid].name} without a fight.`, 'bad');
            react(st, 'lost');
          },
        },
      ];
    },
  },

  navyLanding: {
    id: 'navyLanding',
    title: 'Marines on the Wharf',
    art: 'navy',
    random: false,
    weight: 0,
    cooldown: 0,
    speaker: (s) => (has(s, 'crane') ? 'crane' : has(s, 'thorne') ? 'thorne' : undefined),
    body: (_s, ev) =>
      `Two longboats from the frigate ground on ${DISTRICTS[ev.data!.district as DistrictId].name}. Twenty marines in red coats form a line, bayonets fixed, and a lieutenant reads the Governor’s proclamation in a very loud voice.\n\nThey mean to seize the wharf “on behalf of the Crown and its lawful partners in commerce” — which is to say, the Company.`,
    choices: (s, ev) => {
      const did = ev.data!.district as DistrictId;
      return [
        {
          label: 'Fight the King’s marines',
          detail: 'Brutal combat. Win: infamy +12, pardon −10. Lose: the navy takes the district and a ship.',
          resolve: (st) => {
            st.pendingCombat = navySetup(st, did);
          },
        },
        {
          label: 'Send Father Thorne with a bottle (−100)',
          detail: 'Talk the lieutenant down a step. Around 60%, better with a chapel, worse with infamy.',
          disabled: needLt(s, 'thorne') ?? money(s, 100),
          resolve: (st) => {
            st.res.doubloons -= 100;
            const pct = 60 + (playerHasBuilding(st, 'chapel') ? 10 : 0) - Math.round(st.res.infamy / 5);
            if (chance(st, pct)) {
              addPardon(st, 4);
              st.clocks.blockadeDays = Math.max(0, st.clocks.blockadeDays - 1);
              note(st, 'Thorne and the marine lieutenant discover a shared love of Madeira. The boats row away.', 'good');
              react(st, 'navyParley');
            } else {
              st.districts[did].owner = 'company';
              st.districts[did].fort = 2;
              note(st, `The lieutenant drinks the Madeira and seizes ${DISTRICTS[did].name} anyway. The Company moves in.`, 'bad');
              react(st, 'lost');
            }
          },
        },
        {
          label: `Abandon ${DISTRICTS[did].name}`,
          detail: 'The navy hands it to the Company. You keep your ships and your people.',
          resolve: (st) => {
            st.districts[did].owner = 'company';
            st.districts[did].fort = 2;
            st.res.morale = clamp(st.res.morale - 8, 0, 100);
            note(st, `You pull back from ${DISTRICTS[did].name}. Company clerks are measuring it by noon.`, 'bad');
            react(st, 'lost');
          },
        },
      ];
    },
  },

  hartBribe: {
    id: 'hartBribe',
    title: 'Drinks on Hart',
    art: 'hart',
    random: false,
    weight: 0,
    cooldown: 0,
    speaker: (_s, ev) => ev.data?.lt as LtId,
    body: (_s, ev) => {
      const id = ev.data!.lt as LtId;
      return `${LIEUTENANTS[id].name} has been seen three nights running at the Salt Market, drinking on Hart’s tab. Hart’s bosun was overheard saying “a sensible officer knows which way the wind’s blowing.”\n\n${ltShort(id)}’s loyalty is dangerously low.`;
    },
    choices: (s, ev) => {
      const id = ev.data!.lt as LtId;
      const greedy = id === 'beaumont' ? 15 : 0;
      return [
        {
          label: 'Pay a quiet bonus (−90 doubloons)',
          detail: `${ltShort(id)} loyalty +25.`,
          disabled: money(s, 90),
          resolve: (st) => {
            st.res.doubloons -= 90;
            adjustLoyalty(st, id, 25);
            note(st, `A heavy purse changes hands. ${ltShort(id)} remembers who their friends are.`, 'good');
          },
        },
        {
          label: 'Confront them in front of the crew',
          detail: 'Shamed back into line (+15 loyalty) — or they walk out to Hart.',
          resolve: (st) => {
            if (chance(st, 45 + st.lts[id].loyalty - greedy)) {
              adjustLoyalty(st, id, 15);
              note(st, `${ltShort(id)} goes red, then swears on the articles. The crew cheers.`, 'good');
            } else {
              st.lts[id].status = 'defected';
              st.factions.hart.strength = clamp(st.factions.hart.strength + 8, 0, 100);
              note(st, `${ltShort(id)} spits on the deck and walks to Hart’s side of the market. Gone.`, 'bad');
            }
          },
        },
        {
          label: 'Let it lie',
          detail: 'Maybe it’s nothing. (It is rarely nothing.)',
          resolve: (st) => {
            if (chance(st, 50 + greedy)) {
              st.lts[id].status = 'defected';
              st.factions.hart.strength = clamp(st.factions.hart.strength + 8, 0, 100);
              note(st, `${ltShort(id)} is gone by morning — Hart’s new officer.`, 'bad');
            } else note(st, `${ltShort(id)} keeps drinking with Hart. For now, nothing comes of it.`, 'neutral');
          },
        },
      ];
    },
  },

  // --------------------------------------------------------------- random pool
  insult: {
    id: 'insult',
    title: 'A Fish on the Door',
    art: 'knives',
    random: true,
    weight: 3,
    cooldown: 6,
    speaker: (s) => (has(s, 'dixon') ? 'dixon' : undefined),
    eligible: (s) => Object.values(s.districts).some((d) => d.owner === 'knives'),
    body: (s) =>
      `Somebody has nailed a rotten mackerel to the door of your tavern, with a note: “${s.crewName.toUpperCase()} — SMELLS ABOUT RIGHT.”\n\nThe Red Knives are laughing about it in every tavern on Rum Row. Your crew is not laughing.`,
    choices: (s) => {
      const target = (Object.keys(s.districts) as DistrictId[]).find((d) => s.districts[d].owner === 'knives');
      return [
        {
          label: 'Answer it with steel',
          detail: target ? `Street brawl in ${DISTRICTS[target].name}. Win and it’s yours.` : 'No Knives district to hit.',
          disabled: target ? undefined : 'The Knives hold nothing',
          resolve: (st) => {
            st.pendingCombat = seizeSetup(st, target!, has(st, 'dixon') ? 'dixon' : undefined);
          },
        },
        {
          label: 'Father Thorne preaches forgiveness',
          detail: 'A sermon on turning the other cheek. Morale +4, heat −5 everywhere.',
          disabled: needLt(s, 'thorne'),
          resolve: (st) => {
            st.res.morale = clamp(st.res.morale + 4, 0, 100);
            for (const d of playerDistricts(st)) addHeat(st, d, -5);
            adjustLoyalty(st, 'dixon', -4);
            note(st, 'Thorne preaches forgiveness, then quietly sells the fish to the Knives’ cook.', 'good');
          },
        },
        {
          label: 'Ignore it',
          detail: 'Morale −8. Dixon will not forget.',
          resolve: (st) => {
            st.res.morale = clamp(st.res.morale - 8, 0, 100);
            adjustLoyalty(st, 'dixon', -6);
            note(st, 'You let the insult stand. The crew grumbles into its rum.', 'bad');
          },
        },
      ];
    },
  },

  prizeShip: {
    id: 'prizeShip',
    title: 'Sail Ho! A Fat Prize',
    art: 'ship',
    random: true,
    weight: 2,
    cooldown: 5,
    speaker: (s) => (has(s, 'dixon') ? 'dixon' : has(s, 'bridge') ? 'bridge' : undefined),
    eligible: (s) => !s.ships.some((sh) => sh.kind === 'brig') && !isBlockaded(s),
    body: () =>
      `The lookout reports a Company merchant brig, the “Good Intent”, limping past the reef with a sprung foremast. Low in the water. Very low. Pepper, silk, and a strongbox, if the harbour gossip is right.\n\nShe will be out of reach by nightfall.`,
    choices: () => [
      {
        label: 'Board her!',
        detail: 'Boarding action: take the helm. Win a brig, loot and infamy. The Company will not forget.',
        resolve: (st) => {
          st.pendingCombat = boardSetup();
        },
      },
      {
        label: 'Sell the tip to Hart (+70)',
        detail: 'Hart’s people take the risk. Hart attitude +10.',
        resolve: (st) => {
          st.res.doubloons += 70;
          st.factions.hart.attitude = clamp(st.factions.hart.attitude + 10, -100, 100);
          st.factions.hart.strength = clamp(st.factions.hart.strength + 4, 0, 100);
          adjustLoyalty(st, 'dixon', -3);
          note(st, 'Hart pays for the tip and takes the brig himself. Dixon sulks.', 'neutral');
        },
      },
      {
        label: 'Let her pass',
        detail: 'Honest restraint. Pardon +3.',
        resolve: (st) => {
          const g = addPardon(st, 3);
          note(st, `The “Good Intent” sails on. Somewhere, a clerk notes your restraint. Pardon +${g}.`, 'neutral');
        },
      },
    ],
  },

  sermon: {
    id: 'sermon',
    title: 'Sunday Sermon',
    art: 'chapel',
    random: true,
    weight: 2,
    cooldown: 7,
    speaker: () => 'thorne',
    eligible: (s) => has(s, 'thorne'),
    body: () =>
      `Father Thorne has announced a sermon on the beach: “On the Sins of Wrecking, and Also Other Sins, Briefly.” Half the island intends to come, mostly because he promised communion wine.\n\nThe crew wants to know whether you will attend.`,
    choices: (s) => [
      {
        label: 'Attend, and bring the rum (−15 rum)',
        detail: 'Morale +8, heat −8 everywhere, pardon +2.',
        disabled: s.res.rum >= 15 ? undefined : 'Needs 15 rum',
        resolve: (st) => {
          st.res.rum -= 15;
          st.res.morale = clamp(st.res.morale + 8, 0, 100);
          for (const d of playerDistricts(st)) addHeat(st, d, -8);
          addPardon(st, 2);
          adjustLoyalty(st, 'thorne', 5);
          note(st, 'Thorne’s sermon moves grown pirates to tears. The rum helps.', 'good');
        },
      },
      {
        label: 'Skip it; work the docks',
        detail: '+40 doubloons from the empty streets. Thorne is hurt.',
        resolve: (st) => {
          st.res.doubloons += 40;
          adjustLoyalty(st, 'thorne', -5);
          note(st, 'While the island prays, your crew empties a few unattended warehouses.', 'neutral');
        },
      },
    ],
  },

  desertion: {
    id: 'desertion',
    title: 'Slipping Away',
    art: 'crew',
    random: true,
    weight: 3,
    cooldown: 5,
    speaker: (s) => (has(s, 'hawkins') ? 'hawkins' : undefined),
    eligible: (s) => s.res.morale < 45,
    body: (s) =>
      `Hawkins wakes you before dawn. Six hands have packed their sea chests and are waiting for a berth on a Charles Town trader. More are watching to see what you do.\n\nMorale stands at ${s.res.morale}.`,
    choices: (s) => [
      {
        label: 'Pay a loyalty bonus (−100)',
        detail: 'Morale +10. They stay.',
        disabled: money(s, 100),
        resolve: (st) => {
          st.res.doubloons -= 100;
          st.res.morale = clamp(st.res.morale + 10, 0, 100);
          note(st, 'Coin on the table. The sea chests go back under the bunks.', 'good');
        },
      },
      {
        label: 'Let Hawkins talk to them',
        detail: 'The quartermaster reads them the articles. 70% they stay; otherwise 6 leave.',
        disabled: needLt(s, 'hawkins'),
        resolve: (st) => {
          if (chance(st, 70)) {
            st.res.morale = clamp(st.res.morale + 5, 0, 100);
            note(st, 'Hawkins reads the articles aloud, with emphasis on the shares. They stay.', 'good');
          } else {
            st.res.crew = Math.max(0, st.res.crew - 6);
            note(st, 'Six hands leave on the tide despite Hawkins’ best efforts.', 'bad');
          }
        },
      },
      {
        label: 'Let them go',
        detail: 'Crew −6. The rest respect your honesty (morale +3).',
        resolve: (st) => {
          st.res.crew = Math.max(0, st.res.crew - 6);
          st.res.morale = clamp(st.res.morale + 3, 0, 100);
          note(st, 'Six hands leave with your blessing and a bottle each.', 'neutral');
        },
      },
    ],
  },

  companyOffer: {
    id: 'companyOffer',
    title: 'An Offer from the Company',
    art: 'company',
    random: true,
    weight: 2,
    cooldown: 8,
    speaker: (s) => (has(s, 'beaumont') ? 'beaumont' : has(s, 'hawkins') ? 'hawkins' : undefined),
    eligible: (s) => playerDistricts(s).length >= 2,
    body: (s) => {
      const d = pickSellable(s);
      return `A Charter Company factor in a spotless coat presents a letter sealed in gold wax. The Company wishes to purchase ${d ? DISTRICTS[d].name : 'one of your districts'} “at a fair price, in the interests of order and commerce.”\n\nHe adds, quietly, that the Governor looks kindly on men who sell to the Company.`;
    },
    choices: (s) => {
      const d = pickSellable(s);
      return [
        {
          label: d ? `Sell ${DISTRICTS[d].name} (+420, pardon +10)` : 'Sell (nothing to sell)',
          detail: 'Cash and respectability. The Company gets a foothold.',
          disabled: d ? undefined : 'Nothing to sell',
          resolve: (st) => {
            st.districts[d!].owner = 'company';
            st.districts[d!].fort = 2;
            st.res.doubloons += 420;
            const g = addPardon(st, 10);
            st.factions.company.attitude = clamp(st.factions.company.attitude + 20, -100, 100);
            note(st, `You sell ${DISTRICTS[d!].name} to the Company. +420 doubloons, pardon +${g}.`, 'neutral');
            react(st, 'deal');
          },
        },
        {
          label: 'Refuse politely',
          detail: 'Company attitude −10. They fund another patrol (navy alert +10).',
          resolve: (st) => {
            st.factions.company.attitude = clamp(st.factions.company.attitude - 10, -100, 100);
            st.clocks.navyAlert = clamp(st.clocks.navyAlert + 10, 0, 100);
            note(st, 'The factor bows stiffly. By evening a new navy cutter is anchored in the channel.', 'bad');
          },
        },
        {
          label: 'Refuse impolitely',
          detail: 'Dixon throws him in the harbour. Morale +6, infamy +5, navy alert +15.',
          resolve: (st) => {
            st.res.morale = clamp(st.res.morale + 6, 0, 100);
            st.res.infamy = clamp(st.res.infamy + 5, 0, 100);
            st.clocks.navyAlert = clamp(st.clocks.navyAlert + 15, 0, 100);
            st.factions.company.attitude = clamp(st.factions.company.attitude - 25, -100, 100);
            adjustLoyalty(st, 'dixon', 4);
            note(st, 'The factor goes into the harbour, letter and all. The crew will talk of it for years.', 'neutral');
          },
        },
      ];
    },
  },

  navyInspection: {
    id: 'navyInspection',
    title: 'Navy Inspection',
    art: 'navy',
    random: true,
    weight: 3,
    cooldown: 5,
    speaker: (s) => (has(s, 'thorne') ? 'thorne' : has(s, 'crane') ? 'crane' : undefined),
    eligible: (s) => s.clocks.navyAlert > 35 || globalHeat(s) > 35,
    body: (s) =>
      `A navy cutter drops anchor and a young lieutenant with a clipboard comes ashore to “inspect cargo for contraband.” Your warehouses are, at a generous estimate, 70% contraband.\n\nGlobal heat: ${globalHeat(s)}. Navy alert: ${Math.round(s.clocks.navyAlert)}.`,
    choices: (s) => [
      {
        label: 'Grease his palm (−90)',
        detail: 'Heat −12 everywhere. Navy alert −5.',
        disabled: money(s, 90),
        resolve: (st) => {
          st.res.doubloons -= 90;
          for (const d of playerDistricts(st)) addHeat(st, d, -12);
          st.clocks.navyAlert = clamp(st.clocks.navyAlert - 5, 0, 100);
          note(st, 'The lieutenant’s clipboard finds nothing of interest. His purse finds 90 doubloons.', 'neutral');
        },
      },
      {
        label: 'Thorne gives him the tour',
        detail: 'Thorne talks, the crew hides. 70%: navy alert −15, pardon +3. Fail: fine and alert +10.',
        disabled: needLt(s, 'thorne'),
        resolve: (st) => {
          if (chance(st, 70)) {
            st.clocks.navyAlert = clamp(st.clocks.navyAlert - 15, 0, 100);
            const g = addPardon(st, 3);
            note(st, `Thorne shows the lieutenant the chapel, the orphans, and the one legal barrel. Pardon +${g}.`, 'good');
          } else {
            st.res.doubloons -= 80;
            st.clocks.navyAlert = clamp(st.clocks.navyAlert + 10, 0, 100);
            note(st, 'The lieutenant opens the wrong barrel. −80 in fines, navy alert +10.', 'bad');
          }
        },
      },
      {
        label: 'Let him look',
        detail: 'If heat is high (over 40) you lose rum and doubloons. If low, pardon +4.',
        resolve: (st) => {
          if (globalHeat(st) > 40) {
            st.res.rum = Math.max(0, st.res.rum - 30);
            st.res.doubloons -= 60;
            st.clocks.navyAlert = clamp(st.clocks.navyAlert + 8, 0, 100);
            note(st, 'He finds plenty. 30 rum confiscated, 60 doubloons in fines.', 'bad');
          } else {
            const g = addPardon(st, 4);
            note(st, `He finds nothing worth the ink. Pardon +${g}.`, 'good');
          }
        },
      },
    ],
  },

  rumShortage: {
    id: 'rumShortage',
    title: 'The Rum Is Gone',
    art: 'rum',
    random: true,
    weight: 3,
    cooldown: 6,
    speaker: (s) => (has(s, 'hawkins') ? 'hawkins' : undefined),
    eligible: (s) => s.res.rum < 55 || isBlockaded(s),
    body: (s) =>
      `Why is the rum always gone? Stores are down to ${s.res.rum} casks and the distillers in the Salt Market have tripled their prices. Hart’s warehouse, on the other hand, is full to the rafters.`,
    choices: (s) => [
      {
        label: 'Pay the gouging price (−140, +40 rum)',
        detail: 'Hart gets richer.',
        disabled: money(s, 140),
        resolve: (st) => {
          st.res.doubloons -= 140;
          st.res.rum += 40;
          st.factions.hart.treasury += 140;
          note(st, 'You pay through the nose. The rum flows again.', 'neutral');
        },
      },
      {
        label: 'Water it down',
        detail: 'Rum lasts longer (+15). Morale −8.',
        resolve: (st) => {
          st.res.rum += 15;
          st.res.morale = clamp(st.res.morale - 8, 0, 100);
          note(st, 'The crew notices the rum is mostly water. They are not pleased.', 'bad');
        },
      },
      {
        label: 'Raid Hart’s warehouse',
        detail: s.districts.salt.owner === 'hart' ? 'Street brawl in the Salt Market. Win it and the district is yours.' : 'Hart no longer holds the Salt Market.',
        disabled: s.districts.salt.owner === 'hart' ? undefined : 'Hart holds no warehouse',
        resolve: (st) => {
          st.pendingCombat = seizeSetup(st, 'salt', has(st, 'dixon') ? 'dixon' : undefined);
        },
      },
    ],
  },

  wedding: {
    id: 'wedding',
    title: 'A Wedding Invitation',
    art: 'wedding',
    random: true,
    weight: 2,
    cooldown: 99,
    speaker: (s) => (has(s, 'thorne') ? 'thorne' : undefined),
    eligible: (s) => s.day >= 5,
    body: () =>
      `Hart’s niece is marrying a Company clerk, and you are cordially invited. The invitation is on good paper. The penmanship is excellent. The venue is a warehouse with only one door.\n\nDixon says it smells like a trap. Thorne says it smells like free wine.`,
    choices: (s) => [
      {
        label: 'Attend with Father Thorne',
        detail: 'Thorne officiates. Hart attitude +20, pardon +5. Small chance it goes wrong.',
        disabled: needLt(s, 'thorne'),
        resolve: (st) => {
          if (chance(st, 80)) {
            st.factions.hart.attitude = clamp(st.factions.hart.attitude + 20, -100, 100);
            const g = addPardon(st, 5);
            note(st, `Thorne marries the couple beautifully and only slurs the vows a little. Pardon +${g}.`, 'good');
          } else {
            st.lts.thorne.status = 'wounded';
            st.lts.thorne.woundDays = 2;
            note(st, 'A Knife in the rafters throws a bottle. Thorne is carried out, blessing everyone.', 'bad');
          }
        },
      },
      {
        label: 'Attend with Dixon and a pistol',
        detail: 'If it is a trap (50%), you fight your way out on Rum Row. If not, Hart is insulted.',
        disabled: needLt(s, 'dixon') ?? (s.districts.rumrow.owner === 'player' ? undefined : 'You no longer hold Rum Row'),
        resolve: (st) => {
          if (chance(st, 50)) {
            note(st, 'It is a trap. Red Knives pour in through the only door.', 'bad');
            const setup = defendSetup(st, 'rumrow', 'knives', 'dixon');
            setup.title = 'Ambush at the Wedding';
            st.pendingCombat = setup;
          } else {
            st.factions.hart.attitude = clamp(st.factions.hart.attitude - 15, -100, 100);
            note(st, 'No trap. Just a wedding. Dixon glowers by the cake all night. Hart is insulted.', 'neutral');
          }
        },
      },
      {
        label: 'Send a gift and regrets (−40)',
        detail: 'Hart attitude +5.',
        disabled: money(s, 40),
        resolve: (st) => {
          st.res.doubloons -= 40;
          st.factions.hart.attitude = clamp(st.factions.hart.attitude + 5, -100, 100);
          note(st, 'A silver punch bowl, lightly used, is sent with your compliments.', 'neutral');
        },
      },
    ],
  },

  deserterCrane: {
    id: 'deserterCrane',
    title: 'A Deserter in the Cable Tier',
    art: 'recruit',
    random: true,
    weight: 3,
    cooldown: 99,
    eligible: (s) => s.day >= 4 && s.lts.crane.status === 'unrecruited',
    body: () =>
      `A man in a torn navy coat is found hiding in the sloop’s cable tier. Jonah Crane, bosun of HMS Milford — or he was, until he struck an officer who “deserved it, sir, on my oath.”\n\nHe knows the navy’s patrol lanes, and he fights like a man with nothing to lose. The navy wants him back very badly.`,
    choices: () => [
      {
        label: 'Sign him on',
        detail: 'Crane joins as a lieutenant. Navy alert +10.',
        resolve: (st) => {
          st.lts.crane.status = 'active';
          st.clocks.navyAlert = clamp(st.clocks.navyAlert + 10, 0, 100);
          note(st, 'Jonah Crane signs the articles with a hand that shakes only slightly.', 'good');
        },
      },
      {
        label: 'Hand him to the navy',
        detail: 'Pardon +8, navy alert −10. Morale −6: your crew watches you do it.',
        resolve: (st) => {
          st.lts.crane.status = 'defected';
          const g = addPardon(st, 8);
          st.clocks.navyAlert = clamp(st.clocks.navyAlert - 10, 0, 100);
          st.res.morale = clamp(st.res.morale - 6, 0, 100);
          note(st, `Crane is rowed out to the frigate in irons. Pardon +${g}. Nobody meets your eye.`, 'bad');
        },
      },
    ],
  },

  fenceBeaumont: {
    id: 'fenceBeaumont',
    title: 'The Fence from Martinique',
    art: 'recruit',
    random: true,
    weight: 3,
    cooldown: 99,
    eligible: (s) => s.day >= 7 && s.lts.beaumont.status === 'unrecruited',
    body: () =>
      `Solange Beaumont arrives on a French packet with eleven trunks and a reputation. She can sell a stolen ship back to its owner and make him thank her for the privilege.\n\nShe is looking for a “partner of ambition.” Her fee is steep.`,
    choices: (s) => [
      {
        label: 'Hire her (−150)',
        detail: 'Beaumont joins as a lieutenant: strong Parley and trade.',
        disabled: money(s, 150),
        resolve: (st) => {
          st.res.doubloons -= 150;
          st.lts.beaumont.status = 'active';
          note(st, 'Beaumont moves into the best room above the tavern and begins rearranging your ledgers.', 'good');
        },
      },
      {
        label: 'Decline',
        detail: 'She goes to Hart instead (Hart strength +6).',
        resolve: (st) => {
          st.lts.beaumont.status = 'defected';
          st.factions.hart.strength = clamp(st.factions.hart.strength + 6, 0, 100);
          note(st, 'Beaumont shrugs and takes her trunks to Hart. A pity.', 'neutral');
        },
      },
    ],
  },

  bridgeArrest: {
    id: 'bridgeArrest',
    title: 'Navigator in Irons',
    art: 'company',
    random: true,
    weight: 2,
    cooldown: 99,
    eligible: (s) => s.day >= 6 && has(s, 'bridge'),
    body: () =>
      `Company guards arrested Tobias Bridge in the Salt Market last night for “unlicensed charts of His Majesty’s waters.” He is chained in the lock-up behind the weighhouse.\n\nThe Company will release him for a fine — or you could fetch him yourself.`,
    choices: (s) => [
      {
        label: 'Break him out',
        detail: 'Extraction fight: reach Bridge and get him to an exit (X).',
        resolve: (st) => {
          st.lts.bridge.status = 'wounded';
          st.lts.bridge.woundDays = 99;
          st.pendingCombat = rescueSetup();
        },
      },
      {
        label: 'Pay the fine (−150)',
        detail: 'Bridge is free, if sulky. Pardon +2.',
        disabled: money(s, 150),
        resolve: (st) => {
          st.res.doubloons -= 150;
          addPardon(st, 2);
          note(st, 'You pay the fine. Bridge is released, smelling strongly of the lock-up.', 'neutral');
        },
      },
      {
        label: 'Leave him to stew',
        detail: 'Bridge is out of action 4 days. Loyalty −25.',
        resolve: (st) => {
          st.lts.bridge.status = 'wounded';
          st.lts.bridge.woundDays = 4;
          adjustLoyalty(st, 'bridge', -25);
          note(st, 'Bridge stays in irons. He will remember.', 'bad');
        },
      },
    ],
  },

  governorHerald: {
    id: 'governorHerald',
    title: 'The King’s Pardon',
    art: 'navy',
    random: true,
    weight: 5,
    cooldown: 99,
    speaker: (s) => (has(s, 'thorne') ? 'thorne' : undefined),
    eligible: (s) => s.res.pardon >= 45,
    body: (s) =>
      `A herald from the new Governor reads a proclamation in the square: any pirate who surrenders to the King’s mercy shall be pardoned of all crimes committed before this day.\n\nIn private, the herald suggests that “a contribution to the Governor’s rebuilding fund” would speed the paperwork considerably. Pardon progress: ${s.res.pardon}%.`,
    choices: (s) => [
      {
        label: 'Contribute to the fund (−300)',
        detail: 'Pardon +20. Some of the crew mutter about going soft.',
        disabled: money(s, 300),
        resolve: (st) => {
          st.res.doubloons -= 300;
          const g = addPardon(st, 20);
          note(st, `Your contribution is gratefully received. Pardon +${g}.`, 'good');
          react(st, 'pardon');
        },
      },
      {
        label: 'Tear down the proclamation',
        detail: 'Infamy +10, morale +6. Pardon −10.',
        resolve: (st) => {
          st.res.infamy = clamp(st.res.infamy + 10, 0, 100);
          st.res.morale = clamp(st.res.morale + 6, 0, 100);
          addPardon(st, -10);
          note(st, 'Dixon nails the proclamation to the vice hall privy. The crew roars.', 'neutral');
        },
      },
    ],
  },
};

function pickSellable(s: GameState): DistrictId | undefined {
  const mine = playerDistricts(s).filter((d) => d !== 'rumrow');
  return mine.find((d) => d === 'salt') ?? mine.find((d) => d !== 'docks') ?? mine[0];
}

export const RANDOM_EVENTS = Object.values(EVENTS).filter((e) => e.random);
