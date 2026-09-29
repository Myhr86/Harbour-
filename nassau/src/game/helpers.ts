import type { Bark, DistrictId, FactionId, GameState, LtId, LtState, Tone } from './types';
import { BARKS, type BarkTopic } from './content/barks';
import { LIEUTENANTS, LT_ORDER } from './content/lieutenants';
import { DISTRICT_ORDER } from './content/districts';
import { next } from './rng';

export const MAX_DAYS = 40;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Log a line to the permanent log and, while a day report is open, to the report. */
export function note(s: GameState, text: string, tone: Tone = 'neutral'): void {
  const entry = { day: s.day, text, tone };
  s.log.push(entry);
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
  if (s.report) s.report.lines.push(entry);
}

export function ownedBy(s: GameState, f: FactionId): DistrictId[] {
  return DISTRICT_ORDER.filter((d) => s.districts[d].owner === f);
}

export function playerDistricts(s: GameState): DistrictId[] {
  return ownedBy(s, 'player');
}

export function activeLts(s: GameState): LtState[] {
  return LT_ORDER.map((id) => s.lts[id]).filter((l) => l.status === 'active');
}

/** Lieutenants still with the crew (active or wounded). */
export function crewLts(s: GameState): LtState[] {
  return LT_ORDER.map((id) => s.lts[id]).filter((l) => l.status === 'active' || l.status === 'wounded');
}

export function hasBuilding(s: GameState, d: DistrictId, b: string, includeDamaged = false): boolean {
  return s.districts[d].slots.some((sl) => sl && sl.id === b && (includeDamaged || !sl.damaged));
}

export function playerHasBuilding(s: GameState, b: string): boolean {
  return playerDistricts(s).some((d) => hasBuilding(s, d, b));
}

export function countPlayerBuilding(s: GameState, b: string): number {
  let n = 0;
  for (const d of playerDistricts(s)) for (const sl of s.districts[d].slots) if (sl && sl.id === b && !sl.damaged) n++;
  return n;
}

export function globalHeat(s: GameState): number {
  const ds = playerDistricts(s);
  if (!ds.length) return 0;
  return Math.round(ds.reduce((a, d) => a + s.districts[d].heat, 0) / ds.length);
}

export function adjustLoyalty(s: GameState, id: LtId, delta: number): void {
  const l = s.lts[id];
  l.loyalty = clamp(l.loyalty + delta, 0, 100);
}

export function ltName(id: LtId): string {
  const d = LIEUTENANTS[id];
  if (id === 'thorne') return 'Father Thorne';
  return d.name.split(' ')[1] ? `${d.name.split(' ')[0]} “${d.nick}” ${d.name.split(' ').slice(1).join(' ')}` : d.name;
}

export function ltShort(id: LtId): string {
  const d = LIEUTENANTS[id];
  if (id === 'thorne') return 'Thorne';
  return d.name.split(' ').slice(-1)[0];
}

/**
 * Every active lieutenant (or the subset given) speaks up about a topic.
 * Approval nudges loyalty up, disapproval nudges it down.
 */
export function react(s: GameState, topic: BarkTopic, only?: LtId[], weight = 2): Bark[] {
  const out: Bark[] = [];
  for (const l of activeLts(s)) {
    if (only && !only.includes(l.id)) continue;
    const lines = BARKS[topic][l.id];
    if (!lines || !lines.length) continue;
    const line = lines[Math.floor(next(s) * lines.length)];
    if (line.mood === 'approve') adjustLoyalty(s, l.id, weight);
    if (line.mood === 'disapprove') adjustLoyalty(s, l.id, -weight);
    out.push({ lt: l.id, text: line.text, mood: line.mood });
  }
  if (out.length) {
    s.barks = out;
    if (s.report) s.report.barks = out;
  }
  return out;
}

export function isBlockaded(s: GameState): boolean {
  return s.clocks.blockadeDays > 0;
}

export function pardonGain(s: GameState, base: number): number {
  return Math.max(1, Math.round(base * (1 - s.res.infamy / 200)));
}

export function addPardon(s: GameState, base: number): number {
  const g = base > 0 ? pardonGain(s, base) : base;
  s.res.pardon = clamp(s.res.pardon + g, 0, 100);
  return g;
}

export function addHeat(s: GameState, d: DistrictId, amt: number): void {
  s.districts[d].heat = clamp(s.districts[d].heat + amt, 0, 100);
}
