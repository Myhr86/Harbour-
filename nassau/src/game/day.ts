// The day loop: End Day resolves income, wages, heat, weather and the
// blockade clock, runs the faction AI and queues tomorrow's events.
import type { GameState } from './types';
import { DISTRICTS, DISTRICT_ORDER } from './content/districts';
import { BUILDINGS } from './content/buildings';
import { EVENTS, RANDOM_EVENTS } from './content/events';
import { RIVALS } from './content/factions';
import { chance, int, next } from './rng';
import {
  activeLts,
  addPardon,
  adjustLoyalty,
  clamp,
  countPlayerBuilding,
  crewLts,
  globalHeat,
  hasBuilding,
  isBlockaded,
  ltShort,
  note,
  playerDistricts,
  playerHasBuilding,
  react,
} from './helpers';
import { runAI } from './ai';
import { checkEnding } from './endings';
import { LIEUTENANTS } from './content/lieutenants';

export const WAGE_PER_HAND = 2;
export const WAGE_PER_LT = 12;

export function districtIncome(s: GameState, id: keyof GameState['districts']): number {
  const d = s.districts[id];
  if (d.owner !== 'player' || d.lockedDays > 0) return 0;
  let inc = DISTRICTS[id].baseIncome;
  for (const sl of d.slots) if (sl && !sl.damaged) inc += BUILDINGS[sl.id].income;
  if (isBlockaded(s)) inc *= 1 - DISTRICTS[id].shipTrade * 0.85;
  if (d.heat > 70) inc *= 0.6;
  inc *= 1 + s.res.infamy / 250;
  if (s.lts.hawkins.status === 'active') inc *= 1.08;
  return Math.round(inc);
}

export function projectedIncome(s: GameState): number {
  return playerDistricts(s).reduce((a, d) => a + districtIncome(s, d), 0);
}

export function projectedWages(s: GameState): number {
  return s.res.crew * WAGE_PER_HAND + crewLts(s).length * WAGE_PER_LT;
}

export function rumRation(s: GameState): number {
  return Math.ceil(s.res.crew / 8);
}

export function hurricaneRumCost(s: GameState): number {
  return 20 + Math.ceil(s.res.crew / 2);
}

function landfall(s: GameState): void {
  note(s, 'THE HURRICANE MAKES LANDFALL. The sky turns the colour of bruised copper.', 'storm');
  s.report!.storm = true;
  const drink = hurricaneRumCost(s);
  if (s.res.rum >= drink) {
    s.res.rum -= drink;
    note(s, `The crew drinks ${drink} rum riding out the storm.`, 'storm');
  } else {
    s.res.rum = 0;
    s.res.morale = clamp(s.res.morale - 25, 0, 100);
    s.res.crew = Math.max(0, s.res.crew - 5);
    note(s, 'The rum runs dry mid-storm. Morale −25, five hands desert in the chaos.', 'bad');
  }
  for (const id of playerDistricts(s)) {
    const d = s.districts[id];
    if (d.battened) {
      d.battened = false;
      continue;
    }
    for (const sl of d.slots)
      if (sl && !sl.damaged && chance(s, 45)) {
        sl.damaged = true;
        note(s, `The ${BUILDINGS[sl.id].name} on ${DISTRICTS[id].name} loses its roof.`, 'bad');
      }
  }
  for (const f of RIVALS) {
    s.factions[f].strength = clamp(s.factions[f].strength - 6, 0, 100);
    for (const id of DISTRICT_ORDER) if (s.districts[id].owner === f) s.districts[id].fort = Math.max(0, s.districts[id].fort - 1);
  }
  for (const sh of s.ships.slice()) {
    let sink = 0;
    let dmg = 0;
    if (sh.atSea) sink = 60 - (sh.seaLeader ? LIEUTENANTS[sh.seaLeader].stats.sea * 8 : 0);
    else if (!sh.secured) {
      sink = 15;
      dmg = 40;
    }
    if (sink && chance(s, sink)) {
      s.ships = s.ships.filter((x) => x !== sh);
      s.res.crew = Math.max(0, s.res.crew - (sh.atSea ? 4 : 0));
      note(s, `The ${sh.name} is lost to the storm${sh.atSea ? ' with four hands' : ''}.`, 'bad');
    } else if (dmg && chance(s, dmg)) {
      sh.damaged = true;
      note(s, `The ${sh.name} drags her anchor and is holed on the rocks.`, 'bad');
    } else if (sh.secured) note(s, `The ${sh.name}, double-moored, rides it out.`, 'good');
    sh.secured = false;
  }
  s.res.morale = clamp(s.res.morale - 5, 0, 100);
  for (const id of DISTRICT_ORDER) s.districts[id].heat = clamp(s.districts[id].heat - 10, 0, 100);
  s.clocks.flotsamDays = 2;
  s.stats.stormsSurvived++;
  react(s, 'landfall');
}

function drawEvents(s: GameState): void {
  // Guaranteed prize every so often, so boarding is always on the menu.
  const sincePrize = s.day - (s.eventCooldowns.prizeLast ?? 0);
  const prize = EVENTS.prizeShip;
  if (sincePrize >= 6 && prize.eligible!(s)) {
    s.pendingEvents.push({ id: 'prizeShip' });
    s.eventCooldowns.prizeLast = s.day;
    s.eventCooldowns.prizeShip = s.day + prize.cooldown;
    return;
  }
  if (s.pendingEvents.length >= 2 || !chance(s, 70)) return;
  const pool = RANDOM_EVENTS.filter(
    (e) => (s.eventCooldowns[e.id] ?? -1) <= s.day && (!e.eligible || e.eligible(s)) && !s.pendingEvents.some((p) => p.id === e.id),
  );
  if (!pool.length) return;
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let r = next(s) * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) {
      s.pendingEvents.push({ id: e.id });
      s.eventCooldowns[e.id] = s.day + e.cooldown;
      if (e.id === 'prizeShip') s.eventCooldowns.prizeLast = s.day;
      return;
    }
  }
}

export function endDay(s: GameState): void {
  if (s.ending || s.combat || s.pendingCombat) return;
  s.report = { day: s.day, lines: [], income: 0, wages: 0, barks: [], storm: false };

  // 1. Idle lieutenants.
  for (const l of activeLts(s)) {
    if (l.orderedToday) continue;
    l.idleDays++;
    if (l.idleDays >= 3) adjustLoyalty(s, l.id, l.id === 'dixon' ? -5 : -2);
    if (l.id === 'dixon' && s.res.morale > 55 && chance(s, 35)) {
      const where = playerDistricts(s)[0];
      if (where) {
        s.districts[where].heat = clamp(s.districts[where].heat + 10, 0, 100);
        s.factions.knives.attitude = clamp(s.factions.knives.attitude - 8, -100, 100);
        if (chance(s, 55)) {
          s.res.infamy = clamp(s.res.infamy + 3, 0, 100);
          note(s, `Bored, Dixon picks a fight with three Knives on ${DISTRICTS[where].name} — and wins. Infamy +3, heat +10.`, 'neutral');
        } else {
          l.status = 'wounded';
          l.woundDays = 2;
          note(s, `Bored, Dixon picks a fight on ${DISTRICTS[where].name} and loses. Wounded for 2 days.`, 'bad');
        }
      }
    }
  }

  // 2. Income.
  let income = 0;
  for (const id of playerDistricts(s)) {
    const d = s.districts[id];
    if (d.lockedDays > 0) {
      note(s, `${DISTRICTS[id].name} earns nothing today (${d.lockedDays} day${d.lockedDays > 1 ? 's' : ''} left).`, 'bad');
      d.lockedDays--;
      continue;
    }
    income += districtIncome(s, id);
  }
  s.res.doubloons += income;
  s.report.income = income;

  // 3. Wages.
  const wages = projectedWages(s);
  s.res.doubloons -= wages;
  s.report.wages = wages;
  note(s, `Takings +${income}, wages −${wages}.`, income >= wages ? 'good' : 'bad');
  if (s.res.doubloons < 0) {
    s.bankruptDays++;
    s.res.morale = clamp(s.res.morale - 10, 0, 100);
    for (const l of crewLts(s)) adjustLoyalty(s, l.id, l.id === 'hawkins' ? -15 : -6);
    note(s, `The treasury is empty — wages go unpaid (${s.bankruptDays}/3 days). Morale −10.`, 'bad');
    react(s, 'unpaid');
  } else s.bankruptDays = 0;

  // 4. Rum ration and morale.
  const ration = rumRation(s);
  if (s.res.rum >= ration) {
    s.res.rum -= ration;
    if (s.bankruptDays === 0 && s.res.rum > 20) s.res.morale = clamp(s.res.morale + 2, 0, 100);
  } else {
    s.res.rum = 0;
    s.res.morale = clamp(s.res.morale - 8, 0, 100);
    note(s, 'No rum for the evening ration. Morale −8.', 'bad');
  }
  s.res.morale = clamp(s.res.morale + countPlayerBuilding(s, 'tavern'), 0, 100);
  if (s.res.morale > 70) s.res.morale -= 1;
  if (s.res.infamy > 40) s.res.crew += 1;

  // 5. Heat.
  for (const id of DISTRICT_ORDER) {
    const d = s.districts[id];
    let dh = -4;
    if (d.owner === 'player') {
      dh += DISTRICTS[id].heatDrift;
      if (hasBuilding(s, id, 'vicehall')) dh += 4;
      if (hasBuilding(s, id, 'chapel')) dh -= 6;
    }
    d.heat = clamp(d.heat + dh, 0, 100);
  }

  // 6. Pardon drift: chapels and a prize court help; vice halls cause scandal.
  const passive = countPlayerBuilding(s, 'chapel') + (playerHasBuilding(s, 'prizecourt') ? 1 : 0) + (globalHeat(s) < 20 ? 1 : 0) - countPlayerBuilding(s, 'vicehall');
  if (passive > 0) addPardon(s, passive);

  // 7. Hurricane clock.
  const c = s.clocks;
  if (c.hurricanePhase === 'warning') {
    c.hurricaneHours -= 24;
    if (c.hurricaneHours <= 0) {
      landfall(s);
      c.hurricanePhase = 'calm';
      c.hurricaneHours = 0;
      c.nextHurricaneDay = s.day + int(s, 10, 13);
    } else note(s, `The hurricane is ${c.hurricaneHours}h out. The glass keeps falling.`, 'storm');
  } else if (c.flotsamDays > 0) c.flotsamDays--;
  const lookout = playerHasBuilding(s, 'lookout') ? 1 : 0;
  if (c.hurricanePhase === 'calm' && s.day + 1 >= c.nextHurricaneDay - lookout) {
    c.hurricanePhase = 'warning';
    c.hurricaneHours = 48 + lookout * 24;
    s.pendingEvents.unshift({ id: 'hurricaneWarning' });
    note(s, `Storm warning: a hurricane approaches from the ESE. Landfall in ${c.hurricaneHours}h.`, 'storm');
    react(s, 'hurricane');
  }

  // 8. Ships return from sea.
  for (const sh of s.ships) {
    sh.atSea = false;
    sh.seaLeader = null;
  }

  // 9. Navy alert and blockade.
  if (c.blockadeDays > 0) {
    c.blockadeDays--;
    if (c.blockadeDays === 0) {
      c.navyAlert = 30;
      note(s, 'The frigate weighs anchor. The blockade is lifted — for now.', 'good');
    } else {
      note(s, `Blockade: ${c.blockadeDays} day${c.blockadeDays > 1 ? 's' : ''} left. Only smugglers are earning.`, 'bad');
      const docksMine = (['docks', 'shipyard', 'salt'] as const).filter((d) => s.districts[d].owner === 'player');
      if (docksMine.length && chance(s, 35) && !s.pendingEvents.some((e) => e.id === 'navyLanding')) {
        s.pendingEvents.push({ id: 'navyLanding', data: { district: docksMine[0] } });
        note(s, 'Longboats are being lowered from the frigate…', 'bad');
      }
    }
  } else {
    const fortHeat = s.districts.fort.owner === 'player' ? s.districts.fort.heat / 20 : 0;
    const rise = 2 + globalHeat(s) / 10 + s.res.infamy / 15 + fortHeat + (s.ships.length > 1 ? 1 : 0);
    c.navyAlert = clamp(Math.round(c.navyAlert + rise), 0, 100);
    if (c.navyAlert >= 100) {
      c.blockadeDays = 5 + (s.res.infamy > 50 ? 2 : 0);
      c.navyAlert = 100;
      note(s, `BLOCKADE. A frigate and two cutters close the harbour for ${c.blockadeDays} days. Ship trade collapses.`, 'bad');
      react(s, 'blockade');
    }
  }

  // 10. Rival factions move.
  runAI(s);

  // 11. Lieutenants recover; posts are relieved.
  for (const l of crewLts(s)) {
    if (l.status === 'wounded' && l.woundDays < 50) {
      l.woundDays--;
      if (l.woundDays <= 0) {
        l.status = 'active';
        note(s, `${ltShort(l.id)} is back on their feet.`, 'good');
      }
    }
    l.orderedToday = false;
  }
  for (const id of DISTRICT_ORDER) s.districts[id].guardedBy = null;

  // 12. Occupation and hold tracking.
  s.companyDocksDays = s.districts.docks.owner === 'company' ? s.companyDocksDays + 1 : 0;
  if (s.companyDocksDays > 0) note(s, `The Company occupies the Docks (${s.companyDocksDays}/3). Take them back!`, 'bad');
  const courtHeld = playerDistricts(s).some((d) => hasBuilding(s, d, 'prizecourt', true));
  s.holdDays = courtHeld && s.districts.shipyard.owner === 'player' ? s.holdDays + 1 : 0;
  if (s.holdDays > 0) note(s, `You hold the Prize Court and the Shipyard: ${s.holdDays}/8 days.`, 'good');
  s.kingDays = playerDistricts(s).length >= 4 ? s.kingDays + 1 : 0;
  if (s.kingDays > 0) note(s, `Four districts fly your colours: ${s.kingDays}/3 dawns. The rivals are closing ranks.`, 'good');

  // 13. Hart poaches if anyone is very unhappy (even without a parley move).
  const unhappy = activeLts(s).find((l) => l.loyalty < 20);
  if (unhappy && !s.pendingEvents.some((e) => e.id === 'hartBribe')) s.pendingEvents.push({ id: 'hartBribe', data: { lt: unhappy.id } });

  // 14. Tomorrow.
  s.day++;
  drawEvents(s);
  if (!s.report.barks.length) react(s, 'dawn', undefined, 0);
  checkEnding(s);
}

/** Resolve the first pending event with the chosen option. */
export function chooseEvent(s: GameState, choiceIdx: number): void {
  const ev = s.pendingEvents[0];
  if (!ev) return;
  const def = EVENTS[ev.id];
  const choice = def.choices(s, ev)[choiceIdx];
  if (!choice || choice.disabled) return;
  s.pendingEvents.shift();
  choice.resolve(s);
  checkEnding(s);
}

export function dismissReport(s: GameState): void {
  s.report = null;
}
