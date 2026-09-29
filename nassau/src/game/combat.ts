// Turn-based tactical combat on a 12x8 grid. Pure rules; the UI only calls
// these functions. Randomness comes from the GameState RNG so fights replay.
import type { CombatFx, CombatSetup, CombatState, CombatUnit, FactionId, GameState, LtId } from './types';
import { COMBAT_MAPS } from './content/combatMaps';
import { LIEUTENANTS } from './content/lieutenants';
import { FACTIONS } from './content/factions';
import { chance, int, next } from './rng';
import { clamp, crewLts, playerHasBuilding } from './helpers';

export const AP_PER_TURN = 4;
export const ROUND_LIMIT = 12;
export const MAX_PLAYER_UNITS = 6;

export const COSTS = { move: 1, melee: 2, pike: 2, shove: 1, brace: 1, pistol: 2, rally: 2, parley: 3 } as const;
export type CombatAction = keyof typeof COSTS;

const FLOOR = new Set(['.', 'Z', 'd', 'X', 'p', 'P', 'E', 'h', 'H']);
const DROP = new Set(['~', 'r']); // shoving someone here throws them overboard

const SAILOR_NAMES = ['Pew', 'Old Tam', 'Mullet', 'Jem', 'Salt Kate', 'Barnaby', 'Quint', 'Nell', 'Crookback Ned', 'Wick'];

interface Template {
  name: string;
  hp: number;
  melee: number;
  dmg: [number, number];
  init: number;
}

const ENEMY: Record<FactionId, { grunt: Template; officer: Template }> = {
  neutral: {
    grunt: { name: 'Dock Tough', hp: 8, melee: 55, dmg: [2, 3], init: 7 },
    officer: { name: 'Harbourmaster’s Man', hp: 11, melee: 60, dmg: [2, 4], init: 9 },
  },
  knives: {
    grunt: { name: 'Cutthroat', hp: 9, melee: 62, dmg: [2, 4], init: 10 },
    officer: { name: 'Knife Captain', hp: 13, melee: 70, dmg: [3, 5], init: 12 },
  },
  hart: {
    grunt: { name: 'Hart’s Man', hp: 10, melee: 60, dmg: [2, 4], init: 8 },
    officer: { name: 'Bosun Hart', hp: 13, melee: 66, dmg: [3, 5], init: 10 },
  },
  company: {
    grunt: { name: 'Company Guard', hp: 10, melee: 57, dmg: [2, 4], init: 7 },
    officer: { name: 'Factor', hp: 11, melee: 60, dmg: [2, 4], init: 9 },
  },
  navy: {
    grunt: { name: 'Marine', hp: 14, melee: 74, dmg: [3, 6], init: 11 },
    officer: { name: 'Lieutenant RN', hp: 18, melee: 78, dmg: [4, 7], init: 13 },
  },
  player: {
    grunt: { name: 'Sailor', hp: 9, melee: 62, dmg: [2, 4], init: 8 },
    officer: { name: 'Captain', hp: 14, melee: 70, dmg: [3, 5], init: 12 },
  },
};

export function mapKind(c: CombatState) {
  return COMBAT_MAPS[c.setup.mapId].kind;
}

export function tile(c: CombatState, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return '#';
  return c.tiles[y][x];
}

export function living(u: CombatUnit): boolean {
  return !u.down && !u.fled;
}

export function unitAt(c: CombatState, x: number, y: number): CombatUnit | undefined {
  return c.units.find((u) => living(u) && u.x === x && u.y === y);
}

export function isFloor(c: CombatState, x: number, y: number): boolean {
  return FLOOR.has(tile(c, x, y));
}

export function passable(c: CombatState, x: number, y: number): boolean {
  return isFloor(c, x, y) && !unitAt(c, x, y);
}

export function cheb(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function manh(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function activeUnit(c: CombatState): CombatUnit | undefined {
  return c.units.find((u) => u.uid === c.order[c.turnIdx]);
}

function enemiesOf(c: CombatState, u: CombatUnit): CombatUnit[] {
  const foe = u.side === 'enemy' ? 'player' : 'enemy';
  return c.units.filter((o) => o.side === foe && living(o));
}

function fx(c: CombatState, kind: CombatFx['kind'], x: number, y: number, text: string) {
  c.fx.push({ id: ++c.fxSeq, kind, x, y, text });
  if (c.fx.length > 14) c.fx.splice(0, c.fx.length - 14);
}

function say(c: CombatState, text: string) {
  c.log.push(text);
  if (c.log.length > 60) c.log.splice(0, c.log.length - 60);
}

// ---------------------------------------------------------------- setup

function ltUnit(s: GameState, id: LtId, uidN: number): CombatUnit {
  const d = LIEUTENANTS[id];
  const m = d.stats.melee;
  return {
    uid: `p${uidN}`,
    name: id === 'thorne' ? 'Fr. Thorne' : d.name.split(' ').slice(-1)[0],
    side: 'player',
    kind: 'lt',
    lt: id,
    faction: 'player',
    hp: 10 + m * 2,
    maxHp: 10 + m * 2,
    melee: 52 + m * 6,
    dmg: [2 + Math.floor(m / 2), 2 + m],
    init: 10 + m * 2 + d.stats.sea + int(s, 0, 3),
    x: 0,
    y: 0,
    ap: 0,
    braced: false,
    stunned: false,
    rallied: false,
    parley: d.stats.parley >= 4 ? d.stats.parley : 0,
    down: false,
    fled: false,
  };
}

function templUnit(s: GameState, t: Template, uid: string, side: CombatUnit['side'], faction: FactionId, kind: CombatUnit['kind']): CombatUnit {
  return {
    uid,
    name: t.name,
    side,
    kind,
    faction,
    hp: t.hp,
    maxHp: t.hp,
    melee: t.melee,
    dmg: [...t.dmg] as [number, number],
    init: t.init + int(s, 0, 3),
    x: 0,
    y: 0,
    ap: 0,
    braced: false,
    stunned: false,
    rallied: false,
    parley: 0,
    down: false,
    fled: false,
  };
}

export function sailorCount(s: GameState, ltCount: number): number {
  const armory = playerHasBuilding(s, 'armory') ? 1 : 0;
  return clamp(1 + Math.floor(s.res.crew / 12) + armory, 1, MAX_PLAYER_UNITS - ltCount);
}

/** Lieutenants who can join a fight. */
export function eligibleFighters(s: GameState, setup: CombatSetup): LtId[] {
  return crewLts(s)
    .filter((l) => l.status === 'active' && l.id !== setup.lockedLt)
    .map((l) => l.id);
}

export function startCombat(s: GameState, setup: CombatSetup, chosen: LtId[]): void {
  const map = COMBAT_MAPS[setup.mapId];
  const c: CombatState = {
    setup,
    w: map.rows[0].length,
    h: map.rows.length,
    tiles: map.rows.slice(),
    units: [],
    order: [],
    turnIdx: 0,
    round: 1,
    pistolUsed: { player: false, enemy: false },
    noise: 0,
    zoneLostRounds: 0,
    result: null,
    log: [],
    fx: [],
    fxSeq: 0,
  };
  const kind = map.kind;
  const moraleMod = s.res.morale > 70 ? 5 : s.res.morale < 30 ? -10 : 0;
  const armoryMod = playerHasBuilding(s, 'armory') ? 5 : 0;
  let n = 0;
  const lts = chosen.slice(0, 3);
  for (const id of lts) {
    const u = ltUnit(s, id, n++);
    if (id === 'bridge') u.melee += kind === 'street' ? -15 : 10;
    if (id === 'crane' && setup.enemy === 'navy') u.melee += 8;
    u.melee += moraleMod;
    c.units.push(u);
  }
  const sailors = sailorCount(s, lts.length);
  for (let i = 0; i < sailors; i++) {
    const u = templUnit(s, ENEMY.player.grunt, `p${n++}`, 'player', 'player', 'sailor');
    u.name = SAILOR_NAMES[i % SAILOR_NAMES.length];
    u.melee += moraleMod + armoryMod;
    c.units.push(u);
  }
  const et = ENEMY[setup.enemy] ?? ENEMY.neutral;
  const count = clamp(setup.enemyCount, 2, 8);
  for (let i = 0; i < count; i++) {
    const officer = setup.elite && i === 0;
    const t = officer ? et.officer : et.grunt;
    const u = templUnit(s, t, `e${i}`, 'enemy', setup.enemy, officer ? 'officer' : setup.enemy === 'navy' ? 'marine' : 'thug');
    if (setup.context === 'board' && !officer) u.name = 'Company Sailor';
    if (setup.context === 'board' && officer) u.name = 'First Mate';
    c.units.push(u);
  }
  if (setup.objective === 'extract' && setup.lockedLt) {
    const u = ltUnit(s, setup.lockedLt, n++);
    u.side = 'prisoner';
    u.kind = 'prisoner';
    u.hp = Math.ceil(u.maxHp / 2);
    if (setup.lockedLt === 'bridge') u.melee -= 15;
    c.units.push(u);
  }
  // Place units on spawn tiles, overflowing to the nearest free floor.
  const spawns = (ch: string) => {
    const out: [number, number][] = [];
    map.rows.forEach((row, y) => [...row].forEach((t, x) => t === ch && out.push([x, y])));
    return out;
  };
  const place = (u: CombatUnit, list: [number, number][]) => {
    for (const [x, y] of list) {
      if (!unitAt(c, x, y)) {
        u.x = x;
        u.y = y;
        return;
      }
    }
    // overflow: BFS from first spawn
    const [sx, sy] = list[0];
    const seen = new Set<string>();
    const q: [number, number][] = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift()!;
      const k = `${x},${y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (passable(c, x, y)) {
        u.x = x;
        u.y = y;
        return;
      }
      for (const [dx, dy] of DIRS) if (isFloor(c, x + dx, y + dy)) q.push([x + dx, y + dy]);
    }
  };
  const ps = spawns('P');
  const es = spawns('E');
  for (const u of c.units) {
    if (u.side === 'player') place(u, ps);
    else if (u.side === 'enemy') place(u, es);
    else place(u, spawns('p'));
  }
  // Initiative order (ties broken by the seeded RNG).
  const fighters = c.units.filter((u) => u.side !== 'prisoner');
  const tieb = new Map(fighters.map((u) => [u.uid, next(s)]));
  fighters.sort((a, b) => b.init - a.init || tieb.get(b.uid)! - tieb.get(a.uid)!);
  c.order = fighters.map((u) => u.uid);
  s.combat = c;
  say(c, `${setup.title}! ${map.blurb}`);
  beginTurn(s);
}

// ---------------------------------------------------------------- turn flow

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function beginTurn(s: GameState): void {
  const c = s.combat!;
  // Skip units that can't act.
  let guard = 0;
  while (guard++ < 100) {
    const u = activeUnit(c);
    if (u && living(u) && u.side !== 'prisoner') break;
    advanceIdx(s);
    if (c.result) return;
  }
  const u = activeUnit(c)!;
  u.ap = u.stunned ? AP_PER_TURN - 2 : AP_PER_TURN;
  if (u.stunned) say(c, `${u.name} is still reeling.`);
  u.stunned = false;
  u.braced = false;
  // Rout check for battered enemies whose side is losing.
  if (u.side === 'enemy' && u.kind !== 'officer') {
    const foes = c.units.filter((o) => o.side === 'player' && living(o)).length;
    const friends = c.units.filter((o) => o.side === 'enemy' && living(o)).length;
    if (u.hp / u.maxHp < 0.4 && friends < foes && chance(s, 30)) {
      u.fled = true;
      fx(c, 'flee', u.x, u.y, 'Flees!');
      say(c, `${u.name} throws down their blade and runs.`);
      checkEnd(s);
      if (!c.result) endTurn(s);
    }
  }
}

function advanceIdx(s: GameState): void {
  const c = s.combat!;
  c.turnIdx++;
  if (c.turnIdx >= c.order.length) {
    c.turnIdx = 0;
    endRound(s);
    c.round++;
  }
}

function endRound(s: GameState): void {
  const c = s.combat!;
  if (c.result) return;
  const setup = c.setup;
  if (setup.objective === 'hold') {
    const inZone = (side: string) => c.units.some((u) => u.side === side && living(u) && tile(c, u.x, u.y) === 'Z');
    if (!inZone('player') && inZone('enemy')) {
      c.zoneLostRounds++;
      say(c, `The raiders hold the doorway! (${c.zoneLostRounds}/2)`);
      if (c.zoneLostRounds >= 2) return finish(s, 'loss', 'The doorway is lost.');
    } else c.zoneLostRounds = 0;
    if (c.round >= (setup.holdRounds ?? 5)) return finish(s, 'win', 'You held the doorway!');
  }
  if (c.round >= ROUND_LIMIT) finish(s, 'loss', 'The watch arrives and everyone scatters.');
}

export function endTurn(s: GameState): void {
  const c = s.combat;
  if (!c || c.result) return;
  const u = activeUnit(c);
  if (u) u.ap = 0;
  advanceIdx(s);
  if (!c.result) beginTurn(s);
}

function finish(s: GameState, r: 'win' | 'loss' | 'retreat', why: string): void {
  const c = s.combat!;
  if (c.result) return;
  c.result = r;
  say(c, why);
}

export function checkEnd(s: GameState): void {
  const c = s.combat!;
  if (c.result) return;
  const players = c.units.filter((u) => u.side === 'player' && living(u));
  const enemies = c.units.filter((u) => u.side === 'enemy' && living(u));
  const prisoner = c.units.find((u) => u.lt && u.lt === c.setup.lockedLt);
  if (c.setup.objective === 'extract' && prisoner) {
    if (prisoner.down) return finish(s, 'loss', `${prisoner.name} has fallen. The rescue fails.`);
    if (prisoner.side === 'prisoner') {
      const freer = players.find((p) => cheb(p, prisoner) <= 1);
      if (freer) {
        prisoner.side = 'player';
        c.order.push(prisoner.uid);
        fx(c, 'rally', prisoner.x, prisoner.y, 'Freed!');
        say(c, `${freer.name} cuts ${prisoner.name} loose. Now get to an exit!`);
      }
    } else if (tile(c, prisoner.x, prisoner.y) === 'X' && living(prisoner)) {
      return finish(s, 'win', `${prisoner.name} slips out of the square.`);
    }
  }
  if (!players.length) return finish(s, 'loss', 'Your side is down or scattered.');
  if (!enemies.length && c.setup.objective !== 'extract') return finish(s, 'win', 'The enemy is routed!');
  if (!enemies.length && c.setup.objective === 'extract' && prisoner && prisoner.side === 'player')
    return finish(s, 'win', 'The square is clear. Tobias walks out.');
  if (c.setup.objective === 'helm') {
    const onHelm = players.find((p) => tile(c, p.x, p.y) === 'H');
    if (onHelm && !enemies.some((e) => cheb(e, onHelm) <= 1)) return finish(s, 'win', `${onHelm.name} takes the wheel. The brig is yours!`);
  }
}

export function retreat(s: GameState): void {
  if (s.combat && !s.combat.result) finish(s, 'retreat', 'You sound the retreat.');
}

// ---------------------------------------------------------------- queries

/** Tiles reachable with the unit's AP: map "x,y" -> AP cost. */
export function reachable(c: CombatState, u: CombatUnit, maxAp = u.ap): Map<string, number> {
  const out = new Map<string, number>();
  const q: [number, number, number][] = [[u.x, u.y, 0]];
  const seen = new Set<string>([`${u.x},${u.y}`]);
  while (q.length) {
    const [x, y, d] = q.shift()!;
    if (d > 0) out.set(`${x},${y}`, d);
    if (d >= maxAp) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !passable(c, nx, ny)) continue;
      seen.add(k);
      q.push([nx, ny, d + 1]);
    }
  }
  return out;
}

function pathTo(c: CombatState, u: CombatUnit, goals: Set<string>): [number, number][] | null {
  const start = `${u.x},${u.y}`;
  if (goals.has(start)) return [];
  const prev = new Map<string, string>();
  const q: [number, number][] = [[u.x, u.y]];
  const seen = new Set<string>([start]);
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !passable(c, nx, ny)) continue;
      seen.add(k);
      prev.set(k, `${x},${y}`);
      if (goals.has(k)) {
        const path: [number, number][] = [];
        let cur = k;
        while (cur !== start) {
          const [px, py] = cur.split(',').map(Number);
          path.unshift([px, py]);
          cur = prev.get(cur)!;
        }
        return path;
      }
      q.push([nx, ny]);
    }
  }
  return null;
}

function flankBonus(c: CombatState, att: CombatUnit, def: CombatUnit): number {
  const allies = c.units.filter((o) => o !== att && o.side === att.side && living(o) && cheb(o, def) <= 1).length;
  return Math.min(allies, 2) * 8;
}

export function hitChance(c: CombatState, att: CombatUnit, def: CombatUnit, action: 'melee' | 'pike' | 'shove' | 'pistol' | 'parley'): number {
  switch (action) {
    case 'melee':
      return clamp(Math.round(att.melee + flankBonus(c, att, def) - (def.braced ? 20 : 0) - (def.kind === 'officer' ? 5 : 0)), 5, 95);
    case 'pike':
      return clamp(Math.round(att.melee + 10 - (def.braced ? 20 : 0)), 5, 95);
    case 'shove':
      return clamp(Math.round(55 + (att.melee - def.melee) / 2 + flankBonus(c, att, def) / 2 - (def.braced ? 25 : 0)), 5, 95);
    case 'pistol':
      return clamp(85 - manh(att, def) * 3, 5, 95);
    case 'parley': {
      const players = c.units.filter((u) => u.side === 'player' && living(u)).length;
      const enemies = c.units.filter((u) => u.side === 'enemy' && living(u)).length;
      const hurt = (1 - def.hp / def.maxHp) * 45;
      return clamp(
        Math.round(8 + att.parley * 8 + hurt + (enemies < players ? 15 : 0) - (def.kind === 'officer' ? 25 : 0) - (def.faction === 'navy' ? 15 : 0)),
        5,
        90,
      );
    }
  }
}

/** Where a pike or shove from `att` pushes `def`. */
function pushDest(att: CombatUnit, def: CombatUnit): [number, number] {
  const dx = Math.sign(def.x - att.x);
  const dy = Math.sign(def.y - att.y);
  return [def.x + dx, def.y + dy];
}

export function canPike(c: CombatState, att: CombatUnit, def: CombatUnit): boolean {
  if (att.x !== def.x && att.y !== def.y) return false;
  const d = manh(att, def);
  if (d === 1) return true;
  if (d !== 2) return false;
  const mx = (att.x + def.x) / 2;
  const my = (att.y + def.y) / 2;
  return isFloor(c, mx, my);
}

export function isOrthAdj(a: CombatUnit, b: CombatUnit): boolean {
  return manh(a, b) === 1;
}

export interface TargetInfo {
  action: CombatAction;
  pct: number;
  ok: boolean;
  reason?: string;
  note?: string;
}

export function actionsAgainst(c: CombatState, u: CombatUnit, t: CombatUnit): TargetInfo[] {
  const out: TargetInfo[] = [];
  const ap = u.ap;
  const adj = cheb(u, t) <= 1;
  out.push({ action: 'melee', pct: hitChance(c, u, t, 'melee'), ok: adj && ap >= COSTS.melee, reason: !adj ? 'Not adjacent' : ap < COSTS.melee ? 'Needs 2 AP' : undefined });
  const pikeOk = canPike(c, u, t);
  const [px, py] = pushDest(u, t);
  const dropNote = DROP.has(tile(c, px, py)) ? 'Overboard!' : undefined;
  out.push({ action: 'pike', pct: hitChance(c, u, t, 'pike'), ok: pikeOk && ap >= COSTS.pike, reason: !pikeOk ? 'Needs a straight line, reach 2' : ap < COSTS.pike ? 'Needs 2 AP' : undefined, note: pikeOk ? dropNote : undefined });
  const orth = isOrthAdj(u, t);
  out.push({ action: 'shove', pct: hitChance(c, u, t, 'shove'), ok: orth && ap >= COSTS.shove, reason: !orth ? 'Must be side-by-side' : undefined, note: orth ? dropNote : undefined });
  const side = u.side === 'enemy' ? 'enemy' : 'player';
  const pistolOk = !c.pistolUsed[side] && u.kind !== 'sailor' && manh(u, t) <= 6;
  out.push({ action: 'pistol', pct: hitChance(c, u, t, 'pistol'), ok: pistolOk && ap >= COSTS.pistol, reason: c.pistolUsed[side] ? 'Pistol already fired' : u.kind === 'sailor' ? 'Officers only' : manh(u, t) > 6 ? 'Out of range' : undefined, note: 'Loud: +heat' });
  if (u.parley > 0) {
    const inRange = manh(u, t) <= 3;
    out.push({ action: 'parley', pct: hitChance(c, u, t, 'parley'), ok: inRange && ap >= COSTS.parley, reason: !inRange ? 'Within 3 tiles' : ap < COSTS.parley ? 'Needs 3 AP' : undefined });
  }
  return out;
}

// ---------------------------------------------------------------- actions

function damage(s: GameState, att: CombatUnit, def: CombatUnit, bonus = 0): number {
  const c = s.combat!;
  let d = int(s, att.dmg[0], att.dmg[1]) + bonus;
  if (def.braced) d -= 1;
  d = Math.max(1, d);
  def.hp -= d;
  fx(c, 'hit', def.x, def.y, `−${d}`);
  if (def.hp <= 0) {
    def.hp = 0;
    def.down = true;
    say(c, `${def.name} goes down!`);
    if (def.kind === 'officer' && def.side === 'enemy') {
      say(c, 'Their leader has fallen — the rest waver.');
      for (const o of c.units)
        if (o.side === 'enemy' && living(o) && o.hp / o.maxHp < 0.6 && chance(s, 25)) {
          o.fled = true;
          fx(c, 'flee', o.x, o.y, 'Flees!');
        }
    }
  }
  return d;
}

function spend(u: CombatUnit, n: number): boolean {
  if (u.ap < n) return false;
  u.ap -= n;
  return true;
}

function after(s: GameState): void {
  checkEnd(s);
  const c = s.combat!;
  if (c.result) return;
  const u = activeUnit(c);
  if (u && u.ap <= 0) endTurn(s);
}

export function doMove(s: GameState, x: number, y: number): boolean {
  const c = s.combat!;
  const u = activeUnit(c)!;
  const cost = reachable(c, u).get(`${x},${y}`);
  if (cost === undefined || !spend(u, cost)) return false;
  u.x = x;
  u.y = y;
  after(s);
  return true;
}

export function doMelee(s: GameState, tid: string): boolean {
  const c = s.combat!;
  const u = activeUnit(c)!;
  const t = c.units.find((o) => o.uid === tid)!;
  if (cheb(u, t) > 1 || !spend(u, COSTS.melee)) return false;
  if (chance(s, hitChance(c, u, t, 'melee'))) {
    const d = damage(s, u, t);
    say(c, `${u.name} slashes ${t.name} for ${d}.`);
  } else {
    fx(c, 'miss', t.x, t.y, 'Miss');
    say(c, `${u.name} swings at ${t.name} and misses.`);
  }
  after(s);
  return true;
}

function knock(s: GameState, att: CombatUnit, t: CombatUnit, stunDmg: number): void {
  const c = s.combat!;
  const [nx, ny] = pushDest(att, t);
  const dest = tile(c, nx, ny);
  if (DROP.has(dest) || (nx < 0 || ny < 0 || nx >= c.w || ny >= c.h ? mapKind(c) !== 'street' : false)) {
    t.fled = true;
    fx(c, 'overboard', t.x, t.y, 'Overboard!');
    say(c, `${t.name} goes over the side with a splash!`);
  } else if (passable(c, nx, ny)) {
    t.x = nx;
    t.y = ny;
    fx(c, 'shove', nx, ny, 'Pushed');
  } else if (stunDmg > 0 && !t.down) {
    t.hp -= stunDmg;
    t.stunned = true;
    fx(c, 'shove', t.x, t.y, `Slammed −${stunDmg}`);
    say(c, `${t.name} slams into the ${dest === '#' ? 'wall' : 'cargo'} and reels.`);
    if (t.hp <= 0) {
      t.hp = 0;
      t.down = true;
      say(c, `${t.name} goes down!`);
    }
  }
}

export function doPike(s: GameState, tid: string): boolean {
  const c = s.combat!;
  const u = activeUnit(c)!;
  const t = c.units.find((o) => o.uid === tid)!;
  if (!canPike(c, u, t) || !spend(u, COSTS.pike)) return false;
  if (chance(s, hitChance(c, u, t, 'pike'))) {
    const d = damage(s, u, t, -1);
    say(c, `${u.name} drives a boarding pike into ${t.name} for ${d}.`);
    if (!t.down) knock(s, u, t, 0);
  } else {
    fx(c, 'miss', t.x, t.y, 'Miss');
    say(c, `${u.name}’s pike glances off.`);
  }
  after(s);
  return true;
}

export function doShove(s: GameState, tid: string): boolean {
  const c = s.combat!;
  const u = activeUnit(c)!;
  const t = c.units.find((o) => o.uid === tid)!;
  if (!isOrthAdj(u, t) || !spend(u, COSTS.shove)) return false;
  if (chance(s, hitChance(c, u, t, 'shove'))) {
    say(c, `${u.name} shoves ${t.name}.`);
    knock(s, u, t, 2);
  } else {
    fx(c, 'miss', t.x, t.y, 'Braced');
    say(c, `${t.name} plants their feet.`);
  }
  after(s);
  return true;
}

export function doBrace(s: GameState): boolean {
  const c = s.combat!;
  const u = activeUnit(c)!;
  if (!spend(u, COSTS.brace)) return false;
  u.braced = true;
  fx(c, 'brace', u.x, u.y, 'Brace');
  say(c, `${u.name} braces behind their blade.`);
  // Bracing ends your turn: you’re set for whatever comes.
  endTurn(s);
  return true;
}

export function doPistol(s: GameState, tid: string): boolean {
  const c = s.combat!;
  const u = activeUnit(c)!;
  const t = c.units.find((o) => o.uid === tid)!;
  const side = u.side === 'enemy' ? 'enemy' : 'player';
  if (c.pistolUsed[side] || u.kind === 'sailor' || manh(u, t) > 6 || !spend(u, COSTS.pistol)) return false;
  c.pistolUsed[side] = true;
  if (side === 'player') c.noise += 12;
  fx(c, 'shot', u.x, u.y, 'BANG');
  if (chance(s, hitChance(c, u, t, 'pistol'))) {
    const d = int(s, 5, 8);
    t.hp -= d;
    fx(c, 'hit', t.x, t.y, `−${d}`);
    say(c, `${u.name} fires! ${t.name} is hit for ${d}.`);
    if (t.hp <= 0) {
      t.hp = 0;
      t.down = true;
      say(c, `${t.name} goes down!`);
    }
  } else {
    fx(c, 'miss', t.x, t.y, 'Miss');
    say(c, `${u.name} fires — and hits a rum barrel.`);
  }
  after(s);
  return true;
}

export function doRally(s: GameState): boolean {
  const c = s.combat!;
  const u = activeUnit(c)!;
  if (u.kind !== 'lt' || u.rallied || !spend(u, COSTS.rally)) return false;
  u.rallied = true;
  for (const o of c.units)
    if (o.side === u.side && living(o) && cheb(o, u) <= 2) {
      o.hp = Math.min(o.maxHp, o.hp + 3);
      o.stunned = false;
      fx(c, 'rally', o.x, o.y, '+3');
    }
  say(c, `${u.name} rallies the crew: “For Nassau and a fair share!”`);
  after(s);
  return true;
}

export function doParley(s: GameState, tid: string): boolean {
  const c = s.combat!;
  const u = activeUnit(c)!;
  const t = c.units.find((o) => o.uid === tid)!;
  if (u.parley <= 0 || manh(u, t) > 3 || !spend(u, COSTS.parley)) return false;
  if (chance(s, hitChance(c, u, t, 'parley'))) {
    t.fled = true;
    fx(c, 'parley', t.x, t.y, 'Surrenders');
    say(c, `${u.name} talks ${t.name} into laying down arms. “Go home, son. Your mother’s worried.”`);
  } else {
    fx(c, 'miss', t.x, t.y, 'Unmoved');
    say(c, `${t.name} is not in a listening mood.`);
  }
  after(s);
  return true;
}

// ---------------------------------------------------------------- AI

/**
 * One atomic AI action for the active unit (either side — the player can
 * delegate a unit with "Auto"). Returns false once the unit's turn ended.
 */
export function aiStep(s: GameState): boolean {
  const c = s.combat;
  if (!c || c.result) return false;
  const u = activeUnit(c);
  if (!u) return false;
  if (u.ap <= 0) {
    endTurn(s);
    return false;
  }
  const foes = enemiesOf(c, u);
  if (!foes.length) {
    endTurn(s);
    return false;
  }
  const side = u.side === 'enemy' ? 'enemy' : 'player';
  // Pistol: officers fire at the healthiest-looking threat in range.
  if (!c.pistolUsed[side] && u.kind === 'officer' && u.ap >= COSTS.pistol) {
    const inRange = foes.filter((f) => manh(u, f) <= 5).sort((a, b) => a.hp - b.hp);
    if (inRange.length && chance(s, 60)) return doPistol(s, inRange[0].uid), true;
  }
  const adj = foes.filter((f) => cheb(u, f) <= 1).sort((a, b) => a.hp - b.hp);
  const escaping = c.setup.objective === 'extract' && u.lt === c.setup.lockedLt;
  if (adj.length && !escaping) {
    // Shove someone into the sea if we can.
    if (u.ap >= COSTS.shove) {
      for (const f of adj) {
        if (!isOrthAdj(u, f)) continue;
        const [nx, ny] = pushDest(u, f);
        if (DROP.has(tile(c, nx, ny)) && chance(s, 55)) return doShove(s, f.uid), true;
      }
    }
    if (u.ap >= COSTS.melee) return doMelee(s, adj[0].uid), true;
    if (u.ap >= COSTS.brace) return doBrace(s), false;
    endTurn(s);
    return false;
  }
  // Pike at reach 2.
  if (u.ap >= COSTS.pike) {
    const reach = foes.find((f) => manh(u, f) === 2 && canPike(c, u, f));
    if (reach && (u.side === 'player' || chance(s, 50))) return doPike(s, reach.uid), true;
  }
  // Move toward the best goal.
  const goals = new Set<string>();
  if (u.side === 'player' && c.setup.objective === 'extract') {
    const prisoner = c.units.find((o) => o.lt && o.lt === c.setup.lockedLt && living(o));
    if (prisoner && prisoner.side === 'prisoner') {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (passable(c, prisoner.x + dx, prisoner.y + dy)) goals.add(`${prisoner.x + dx},${prisoner.y + dy}`);
    } else if (prisoner && prisoner === u) {
      c.tiles.forEach((row, y) => [...row].forEach((t, x) => t === 'X' && goals.add(`${x},${y}`)));
    }
  }
  if (u.side === 'player' && c.setup.objective === 'helm') {
    c.tiles.forEach((row, y) => [...row].forEach((t, x) => t === 'H' && goals.add(`${x},${y}`)));
  }
  if (u.side === 'enemy' && c.setup.objective === 'hold') {
    c.tiles.forEach((row, y) => [...row].forEach((t, x) => t === 'Z' && passable(c, x, y) && goals.add(`${x},${y}`)));
  }
  if (!goals.size || !escaping)
  for (const f of foes)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        if (passable(c, f.x + dx, f.y + dy)) goals.add(`${f.x + dx},${f.y + dy}`);
      }
  const path = pathTo(c, u, goals);
  if (path && path.length) {
    const steps = Math.min(u.ap, path.length);
    const [tx, ty] = path[steps - 1];
    u.ap -= steps;
    u.x = tx;
    u.y = ty;
    after(s);
    return !!s.combat && !s.combat.result && activeUnit(s.combat) === u;
  }
  if (u.ap >= COSTS.brace) return doBrace(s), false;
  endTurn(s);
  return false;
}

// ---------------------------------------------------------------- results

export function sideAlive(c: CombatState, side: 'player' | 'enemy'): number {
  return c.units.filter((u) => u.side === side && living(u)).length;
}

export function enemyLabel(f: FactionId): string {
  return FACTIONS[f].name;
}
