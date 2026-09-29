import { describe, expect, it } from 'vitest';
import type { DistrictId, GameState, LtId } from './index';
import {
  aiStep,
  applyCombatResult,
  chooseEvent,
  dismissReport,
  eligibleFighters,
  endDay,
  issueOrder,
  newGame,
  orderOptions,
  playerDistricts,
  startCombat,
} from './index';
import { EVENTS } from './content/events';
import { DISTRICTS } from './content/districts';
import { boardSetup, defendSetup, navySetup, rescueSetup, seizeSetup } from './encounters';

/** Play out a fight with the AI controlling both sides. */
function autoFight(s: GameState, lts?: LtId[]) {
  const setup = s.pendingCombat!;
  startCombat(s, setup, lts ?? eligibleFighters(s, setup).slice(0, 3));
  s.pendingCombat = null;
  let guard = 0;
  while (s.combat && !s.combat.result && guard++ < 5000) aiStep(s);
  expect(s.combat?.result, 'combat should resolve').toBeTruthy();
  return applyCombatResult(s);
}

function drain(s: GameState) {
  let guard = 0;
  while (!s.ending && guard++ < 50) {
    if (s.report) dismissReport(s);
    else if (s.pendingCombat) autoFight(s);
    else if (s.pendingEvents.length) {
      const ev = s.pendingEvents[0];
      const choices = EVENTS[ev.id].choices(s, ev);
      const idx = choices.findIndex((c) => !c.disabled);
      chooseEvent(s, idx < 0 ? 0 : idx);
      if (idx < 0) s.pendingEvents.shift();
    } else break;
  }
}

/** A simple, sensible bot: grab ground, smuggle, parley the navy, prep for storms. */
function botDay(s: GameState) {
  const ready = (Object.keys(s.lts) as LtId[]).filter((id) => s.lts[id].status === 'active' && !s.lts[id].orderedToday);
  const mine = playerDistricts(s);
  const coastal = mine.find((d) => DISTRICTS[d].coastal);
  for (const lt of ready) {
    if (s.pendingCombat || s.ending) break;
    const has = (d: DistrictId, k: string) => orderOptions(s, d).find((o) => o.kind === k)?.ok;
    if (s.clocks.hurricanePhase === 'warning' && coastal && has(coastal, 'batten')) {
      issueOrder(s, { kind: 'batten', district: coastal, lt });
      continue;
    }
    if (lt === 'thorne' && (s.clocks.navyAlert > 55 || s.clocks.blockadeDays > 0) && s.res.doubloons > 100) {
      issueOrder(s, { kind: 'parley', district: mine[0], lt, parley: 'navy' });
      continue;
    }
    if (lt === 'bridge' && mine.length && has(mine[0], 'smuggle')) {
      issueOrder(s, { kind: 'smuggle', district: mine[0], lt });
      continue;
    }
    if (s.res.morale < 40 && mine.length && has(mine[0], 'rally')) {
      issueOrder(s, { kind: 'rally', district: mine[0], lt });
      continue;
    }
    const target = (['docks', 'shipyard', 'salt', 'alley', 'fort'] as DistrictId[]).find(
      (d) => s.districts[d].owner !== 'player' && orderOptions(s, d).find((o) => o.kind === 'muscle')?.ok,
    );
    if ((lt === 'dixon' || lt === 'crane') && target && s.res.morale > 35) {
      issueOrder(s, { kind: 'muscle', district: target, lt });
      drain(s);
      continue;
    }
    const damaged = mine.find((d) => has(d, 'repair'));
    if (damaged) {
      issueOrder(s, { kind: 'repair', district: damaged, lt });
      continue;
    }
    if (mine.length) issueOrder(s, { kind: 'protect', district: mine[mine.length - 1], lt });
  }
  drain(s);
  if (!s.ending) endDay(s);
  drain(s);
}

describe('determinism', () => {
  it('replays identically from the same seed and choices', () => {
    const run = () => {
      const s = newGame(1234, 'Test Crew');
      drain(s);
      for (let i = 0; i < 12 && !s.ending; i++) botDay(s);
      return JSON.stringify(s);
    };
    expect(run()).toEqual(run());
  });

  it('replays a saved day identically', () => {
    const s = newGame(99, 'Replay');
    drain(s);
    for (let i = 0; i < 5; i++) botDay(s);
    const save = JSON.stringify(s);
    const a = JSON.parse(save) as GameState;
    const b = JSON.parse(save) as GameState;
    botDay(a);
    botDay(b);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe('combat', () => {
  const setups = {
    seizeDocks: (s: GameState) => seizeSetup(s, 'docks', 'dixon'),
    seizeAlley: (s: GameState) => seizeSetup(s, 'alley'),
    seizeFort: (s: GameState) => seizeSetup(s, 'fort'),
    defendRumRow: (s: GameState) => defendSetup(s, 'rumrow', 'knives'),
    board: () => boardSetup(),
    navy: (s: GameState) => navySetup(s, 'docks'),
    rescue: () => rescueSetup(),
  };
  for (const [name, mk] of Object.entries(setups)) {
    it(`${name} resolves on every seed`, () => {
      const results: Record<string, number> = {};
      for (let seed = 1; seed <= 40; seed++) {
        const s = newGame(seed, 'Crew');
        s.pendingEvents = [];
        if (name === 'navy') s.districts.docks.owner = 'player';
        if (name === 'rescue') {
          s.lts.bridge.status = 'wounded';
          s.lts.bridge.woundDays = 99;
        }
        s.pendingCombat = mk(s);
        const r = autoFight(s);
        results[r.result] = (results[r.result] ?? 0) + 1;
      }
      // eslint-disable-next-line no-console
      console.log(`combat ${name}:`, results);
      expect(Object.values(results).reduce((a, b) => a + b, 0)).toBe(40);
    });
  }
});

/** A pardon-chaser: Thorne talks to the navy, chapel early, no wrecking. */
function pardonDay(s: GameState) {
  const ready = (Object.keys(s.lts) as LtId[]).filter((id) => s.lts[id].status === 'active' && !s.lts[id].orderedToday);
  const mine = playerDistricts(s);
  for (const lt of ready) {
    if (s.ending || !mine.length) break;
    const home = mine[0];
    const has = (d: DistrictId, k: string) => orderOptions(s, d).find((o) => o.kind === k)?.ok;
    const withSlot = mine.find((d) => has(d, 'build'));
    if (lt === 'thorne' && s.res.doubloons > 80) {
      issueOrder(s, { kind: 'parley', district: home, lt, parley: 'navy' });
      continue;
    }
    if (withSlot && !mine.some((d) => s.districts[d].slots.some((x) => x?.id === 'chapel')) && s.res.doubloons > 250) {
      issueOrder(s, { kind: 'build', district: withSlot, lt, building: 'chapel' });
      continue;
    }
    if (lt === 'bridge' && has(home, 'smuggle')) {
      issueOrder(s, { kind: 'smuggle', district: home, lt });
      continue;
    }
    if (lt === 'dixon' && s.districts.docks.owner !== 'player' && has('docks', 'muscle')) {
      issueOrder(s, { kind: 'muscle', district: 'docks', lt });
      drain(s);
      continue;
    }
    if (s.clocks.hurricanePhase === 'warning' && has(home, 'batten')) {
      issueOrder(s, { kind: 'batten', district: home, lt });
      continue;
    }
    if (s.res.morale < 45 && has(home, 'rally')) {
      issueOrder(s, { kind: 'rally', district: home, lt });
      continue;
    }
    issueOrder(s, { kind: 'protect', district: mine[mine.length - 1], lt });
  }
  drain(s);
  if (!s.ending) endDay(s);
  drain(s);
}

describe('full seasons', () => {
  it('pardon-chasing bot can earn a pardon', () => {
    const endings: Record<string, number> = {};
    let days = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(seed * 104729, 'Penitents');
      drain(s);
      let guard = 0;
      while (!s.ending && guard++ < 60) pardonDay(s);
      const key = `${s.ending}:${s.endingReason}`;
      endings[key] = (endings[key] ?? 0) + 1;
      days += s.day;
    }
    // eslint-disable-next-line no-console
    console.log('pardon bot endings:', endings, 'avg day', (days / 40).toFixed(1));
    expect(endings['pardon:pardon'] ?? 0).toBeGreaterThan(0);
  });

  it('bot plays 60 seasons to an ending without errors', () => {
    const endings: Record<string, number> = {};
    let totalDays = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = newGame(seed * 7919, 'Bot');
      drain(s);
      let guard = 0;
      while (!s.ending && guard++ < 60) botDay(s);
      expect(s.ending, `seed ${seed} should end`).toBeTruthy();
      const key = `${s.ending}:${s.endingReason}`;
      endings[key] = (endings[key] ?? 0) + 1;
      totalDays += s.day;
      expect(Number.isFinite(s.res.doubloons)).toBe(true);
    }
    // eslint-disable-next-line no-console
    console.log('endings:', endings, 'avg day', (totalDays / 60).toFixed(1));
  });
});
