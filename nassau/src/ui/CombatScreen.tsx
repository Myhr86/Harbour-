import { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatAction, CombatState, CombatUnit, GameState, LtId } from '../game';
import {
  actionsAgainst,
  activeUnit,
  aiStep,
  AP_PER_TURN,
  COSTS,
  doBrace,
  doMelee,
  doMove,
  doParley,
  doPike,
  doPistol,
  doRally,
  doShove,
  eligibleFighters,
  endTurn,
  living,
  reachable,
  retreat,
  ROUND_LIMIT,
  sailorCount,
} from '../game';
import { COMBAT_MAPS } from '../game/content/combatMaps';
import { FACTIONS } from '../game/content/factions';
import { LIEUTENANTS } from '../game/content/lieutenants';
import { ENEMY_LOOKS, Portrait } from './Portrait';
import { Glyph, Icon, type IconName } from './Icons';
import { play } from '../audio';

const T = 64;

function lookFor(u: CombatUnit) {
  if (u.lt) return LIEUTENANTS[u.lt].look;
  if (u.side === 'player') return ENEMY_LOOKS.sailor;
  return ENEMY_LOOKS[u.faction] ?? ENEMY_LOOKS.neutral;
}

function ringFor(u: CombatUnit) {
  if (u.side === 'player') return '#2bb3a3';
  if (u.side === 'prisoner') return '#c9a24a';
  return FACTIONS[u.faction].color;
}

// ------------------------------------------------------------------ prep

interface PrepProps {
  game: GameState;
  onFight: (lts: LtId[]) => void;
  onBackOff: () => void;
}

export function CombatPrep({ game, onFight, onBackOff }: PrepProps) {
  const setup = game.pendingCombat!;
  const eligible = eligibleFighters(game, setup);
  const [chosen, setChosen] = useState<LtId[]>(() => {
    const init: LtId[] = [];
    if (setup.guardLt && eligible.includes(setup.guardLt)) init.push(setup.guardLt);
    for (const id of eligible) if (init.length < 2 && !init.includes(id) && LIEUTENANTS[id].stats.melee >= 3) init.push(id);
    return init;
  });
  const map = COMBAT_MAPS[setup.mapId];
  const toggle = (id: LtId) => {
    if (id === setup.guardLt) return;
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 3 ? [...c, id] : c));
  };
  const sailors = sailorCount(game, chosen.length);
  const enemy = FACTIONS[setup.enemy];
  const backOff =
    setup.context === 'defend'
      ? 'Back off (the raiders sack the district)'
      : setup.context === 'navy'
        ? 'Abandon the wharf to the navy'
        : setup.context === 'rescue'
          ? 'Leave Bridge in irons'
          : 'Back off (morale −3)';
  return (
    <div className="overlay">
      <div className="modal prep" role="dialog" aria-modal="true" aria-labelledby="prep-title">
        <div className="prep-head">
          <Icon name="swords" size={34} color="#e8d9b5" />
          <div>
            <h2 id="prep-title">{setup.title}</h2>
            <div className="prep-map">
              {map.name} — {map.blurb}
            </div>
          </div>
        </div>
        <p className="prep-stakes">{setup.stakes}</p>
        <div className="prep-sides">
          <div>
            <h3>Your side</h3>
            <div className="prep-lts">
              {eligible.length === 0 && <div className="hint">No lieutenant is fit to fight. The sailors go alone.</div>}
              {eligible.map((id) => (
                <button key={id} className={`lt-pick ${chosen.includes(id) ? 'on' : ''}`} onClick={() => toggle(id)} title={LIEUTENANTS[id].specialty} aria-pressed={chosen.includes(id)}>
                  <Portrait look={LIEUTENANTS[id].look} size={48} ring={chosen.includes(id) ? '#f0d27a' : undefined} />
                  <span>{LIEUTENANTS[id].name.split(' ').slice(-1)[0]}</span>
                  <small>
                    Melee {'★'.repeat(LIEUTENANTS[id].stats.melee)}
                    {id === setup.guardLt ? ' · on the spot' : ''}
                  </small>
                </button>
              ))}
            </div>
            <div className="prep-note">
              Up to 3 lieutenants · plus <b>{sailors}</b> sailors (more crew, more sailors). Downed officers may die.
            </div>
          </div>
          <div>
            <h3 style={{ color: enemy.ink }}>{enemy.name}</h3>
            <div className="prep-enemy">
              {Array.from({ length: setup.enemyCount }).map((_, i) => (
                <Portrait key={i} look={ENEMY_LOOKS[setup.enemy] ?? ENEMY_LOOKS.neutral} size={40} ring={enemy.color} />
              ))}
            </div>
            <div className="prep-note">
              {setup.enemyCount} {setup.context === 'board' ? 'Company sailors' : enemy.unitName + 's'}
              {setup.elite ? `, led by an officer with a pistol` : ''}.
              {setup.enemy === 'navy' && <b className="neg"> Drilled, armoured, brutal.</b>}
            </div>
          </div>
        </div>
        <div className="prep-foot">
          <button onClick={onBackOff}>{backOff}</button>
          <button className="primary" onClick={() => onFight(chosen)} autoFocus>
            Fight!
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fight

interface ViewProps {
  game: GameState;
  act: (fn: (s: GameState) => void) => void;
  onFinish: () => void;
  reduceFlash: boolean;
}

const ACTIONS: { id: CombatAction; label: string; icon: IconName; key: string }[] = [
  { id: 'move', label: 'Move', icon: 'boot', key: '1' },
  { id: 'melee', label: 'Melee', icon: 'swords', key: '2' },
  { id: 'pike', label: 'Boarding Pike', icon: 'pike', key: '3' },
  { id: 'shove', label: 'Shove', icon: 'hand', key: '4' },
  { id: 'brace', label: 'Brace', icon: 'shield', key: '5' },
  { id: 'pistol', label: 'Pistol', icon: 'pistol', key: '6' },
  { id: 'rally', label: 'Rally', icon: 'flag', key: '7' },
  { id: 'parley', label: 'Parley', icon: 'scroll', key: '8' },
];

function TileArt({ t, x, y, kind, extract }: { t: string; x: number; y: number; kind: string; extract: boolean }) {
  const px = x * T;
  const py = y * T;
  const floorFill = kind === 'street' ? '#3a3026' : kind === 'deck' ? '#5a3a22' : '#4a3624';
  const floor = (
    <g>
      <rect x={px} y={py} width={T} height={T} fill={floorFill} />
      {kind === 'street' ? (
        <path d={`M${px} ${py + 21} H${px + T} M${px} ${py + 43} H${px + T} M${px + 20} ${py} V${py + 21} M${px + 44} ${py + 21} V${py + 43} M${px + 24} ${py + 43} V${py + T}`} stroke="#241c14" strokeWidth="2" />
      ) : (
        <path d={`M${px} ${py + 16} H${px + T} M${px} ${py + 32} H${px + T} M${px} ${py + 48} H${px + T} M${px + (y % 2 ? 40 : 18)} ${py} V${py + 16}`} stroke="#2e1e12" strokeWidth="1.5" />
      )}
    </g>
  );
  switch (t) {
    case '#':
      return (
        <g>
          <rect x={px} y={py} width={T} height={T} fill="#18110c" />
          <path d={`M${px} ${py + 10} L${px + T / 2} ${py + 2} L${px + T} ${py + 10}`} stroke="#3a2818" strokeWidth="3" fill="none" />
          <rect x={px + 22} y={py + 26} width="20" height="16" fill="#e0a040" opacity="0.25" />
        </g>
      );
    case '~':
      return (
        <g>
          <rect x={px} y={py} width={T} height={T} fill="#0d2a2e" />
          <path d={`M${px + 4} ${py + 24} q8 -6 16 0 t16 0 t16 0 M${px + 8} ${py + 46} q8 -6 16 0 t16 0`} stroke="#3d8d86" strokeOpacity="0.5" fill="none" />
        </g>
      );
    case 'r':
      return (
        <g>
          <rect x={px} y={py} width={T} height={T} fill="#0d2226" />
          <rect x={px} y={py + (y === 0 ? 40 : 0)} width={T} height={24} fill="#2a1a10" stroke="#120a06" />
          {x === 0 && <rect x={px + 40} y={py} width={24} height={T} fill="#2a1a10" stroke="#120a06" />}
          {x === 11 && <rect x={px} y={py} width={24} height={T} fill="#2a1a10" stroke="#120a06" />}
        </g>
      );
    case 'c':
      return (
        <g>
          {floor}
          <rect x={px + 8} y={py + 8} width={T - 16} height={T - 16} fill="#6a4a2a" stroke="#2a1a0e" strokeWidth="3" />
          <path d={`M${px + 8} ${py + 8} L${px + T - 8} ${py + T - 8} M${px + T - 8} ${py + 8} L${px + 8} ${py + T - 8}`} stroke="#2a1a0e" strokeWidth="2.5" />
        </g>
      );
    case 'b':
      return (
        <g>
          {floor}
          <ellipse cx={px + T / 2} cy={py + T / 2} rx="20" ry="22" fill="#6a3e1e" stroke="#20120a" strokeWidth="3" />
          <path d={`M${px + 13} ${py + 24} H${px + 51} M${px + 13} ${py + 40} H${px + 51}`} stroke="#20120a" strokeWidth="2.5" />
        </g>
      );
    case 'm':
      return (
        <g>
          {floor}
          <circle cx={px + T / 2} cy={py + T / 2} r="16" fill="#3a2414" stroke="#140a06" strokeWidth="3" />
          <circle cx={px + T / 2} cy={py + T / 2} r="24" fill="none" stroke="#8a6a3a" strokeWidth="2" strokeDasharray="4 3" />
        </g>
      );
    case 'H':
      return (
        <g>
          {floor}
          <rect x={px + 2} y={py + 2} width={T - 4} height={T - 4} fill="#c9a24a" opacity="0.18" stroke="#f0d27a" strokeDasharray="5 4" />
          <circle cx={px + T / 2} cy={py + T / 2} r="18" fill="none" stroke="#c9a24a" strokeWidth="4" />
          {[0, 45, 90, 135].map((a) => (
            <path key={a} transform={`rotate(${a} ${px + T / 2} ${py + T / 2})`} d={`M${px + T / 2} ${py + 6} V${py + T - 6}`} stroke="#c9a24a" strokeWidth="3" />
          ))}
        </g>
      );
    case 'h':
      return (
        <g>
          {floor}
          <rect x={px + 6} y={py + 6} width={T - 12} height={T - 12} fill="#20140c" stroke="#6a4a2a" strokeWidth="2" />
          <path d={`M${px + 6} ${py + 22} H${px + T - 6} M${px + 6} ${py + 38} H${px + T - 6} M${px + 22} ${py + 6} V${py + T - 6} M${px + 38} ${py + 6} V${py + T - 6}`} stroke="#6a4a2a" strokeWidth="1.5" />
        </g>
      );
    case 'Z':
      return (
        <g>
          {floor}
          <rect x={px} y={py} width={T} height={T} fill="#2bb3a3" opacity="0.14" />
        </g>
      );
    case 'X':
      return (
        <g>
          {floor}
          {extract && (
            <>
              <rect x={px + 2} y={py + 2} width={T - 4} height={T - 4} fill="none" stroke="#2bb3a3" strokeWidth="2" strokeDasharray="6 4" />
              <text x={px + T / 2} y={py + T / 2 + 7} textAnchor="middle" className="tile-x">
                EXIT
              </text>
            </>
          )}
        </g>
      );
    case 'd':
      return (
        <g>
          <rect x={px} y={py} width={T} height={T} fill="#2a1a10" />
          <rect x={px + 12} y={py + 4} width={T - 24} height={T - 4} fill="#e0a040" opacity="0.35" />
        </g>
      );
    default:
      return floor;
  }
}

export function CombatView({ game, act, onFinish, reduceFlash }: ViewProps) {
  const c = game.combat as CombatState;
  const map = COMBAT_MAPS[c.setup.mapId];
  const u = activeUnit(c);
  const playerTurn = !!u && u.side === 'player' && !c.result;
  const [action, setAction] = useState<CombatAction>('move');
  const [auto, setAuto] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const lastFx = useRef(0);

  // Reset the action each time a new unit steps up.
  useEffect(() => {
    setAction('move');
    setAuto(null);
  }, [u?.uid, c.round]);

  // Enemy (and delegated) turns play out with a short beat between actions.
  useEffect(() => {
    if (c.result || !u) return;
    if (u.side === 'player' && auto !== u.uid) return;
    const t = window.setTimeout(() => act((s) => void aiStepSafe(s)), u.side === 'player' ? 300 : 420);
    return () => window.clearTimeout(t);
  });

  // Sound + shake for new effects.
  useEffect(() => {
    const fresh = c.fx.filter((f) => f.id > lastFx.current);
    if (!fresh.length) return;
    lastFx.current = Math.max(...fresh.map((f) => f.id));
    for (const f of fresh) {
      if (f.kind === 'hit') play('clash');
      else if (f.kind === 'miss') play('miss');
      else if (f.kind === 'shot') play('pistol');
      else if (f.kind === 'overboard') play('splash');
      else if (f.kind === 'rally') play('drum');
    }
    if (!reduceFlash && fresh.some((f) => f.kind === 'hit' || f.kind === 'shot')) {
      setShake(true);
      const t = window.setTimeout(() => setShake(false), 260);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [c.fx, reduceFlash]);

  useEffect(() => {
    if (c.result) play(c.result === 'win' ? 'win' : 'lose');
  }, [c.result]);

  const reach = useMemo(() => (playerTurn && action === 'move' && u ? reachable(c, u) : new Map<string, number>()), [c, u, playerTurn, action]);

  const doAction = (a: CombatAction, targetUid?: string) => {
    if (!playerTurn) return;
    act((s) => {
      const mod = GAME_ACTIONS[a];
      mod(s, targetUid);
    });
  };

  const clickTile = (x: number, y: number) => {
    if (!playerTurn || !u) return;
    const target = c.units.find((o) => living(o) && o.x === x && o.y === y && o.side === 'enemy');
    if (target) {
      const a = action === 'move' ? 'melee' : action;
      const info = actionsAgainst(c, u, target).find((i) => i.action === a);
      if (info?.ok) doAction(a, target.uid);
      return;
    }
    if (action === 'move' && reach.has(`${x},${y}`)) act((s) => void GAME_ACTIONS.move(s, `${x},${y}`));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!playerTurn) return;
      const a = ACTIONS.find((x) => x.key === e.key);
      if (a) {
        if (a.id === 'brace' || a.id === 'rally') doAction(a.id);
        else setAction(a.id);
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        act((s) => GAME_ACTIONS.end(s));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const objectives = (() => {
    const o = c.setup.objective;
    if (o === 'helm') return ['Take the helm (stand on it, no defender adjacent)', 'or defeat the crew'];
    if (o === 'hold') return [`Hold the doorway for ${c.setup.holdRounds ?? 5} rounds`, 'Keep someone in the teal zone'];
    if (o === 'extract') return ['Reach the prisoner to free him', 'Get him to an EXIT tile'];
    return ['Rout the enemy'];
  })();
  const pAlive = c.units.filter((x) => x.side === 'player' && living(x)).length;
  const eAlive = c.units.filter((x) => x.side === 'enemy' && living(x)).length;
  const enemyF = FACTIONS[c.setup.enemy];
  const show = playerTurn && u ? u : c.units.find((x) => x.side === 'player' && living(x));

  return (
    <div className={`combat ${map.kind}`}>
      <header className="combat-top">
        <div className="ct-title">
          <Icon name="swords" size={28} color="#e8d9b5" />
          <div>
            <div className="brand-title">{c.setup.title}</div>
            <div className="brand-sub">
              {map.name} · Round {c.round}/{c.setup.objective === 'hold' ? c.setup.holdRounds ?? 5 : ROUND_LIMIT}
            </div>
          </div>
        </div>
        <div className="ct-obj">
          <div className="ct-obj-h">OBJECTIVES</div>
          {objectives.map((o) => (
            <div key={o}>☐ {o}</div>
          ))}
        </div>
        <div className="ct-score">
          <div>
            <Icon name="anchor" size={22} color="#2bb3a3" /> <b>{pAlive}</b> <small>{game.crewName}</small>
          </div>
          <div>
            <Icon name="skull" size={22} color={enemyF.color} /> <b>{eAlive}</b> <small>{enemyF.short}</small>
          </div>
        </div>
      </header>

      <div className="combat-main">
        <div className={`board-wrap ${shake ? 'shake' : ''}`}>
          <svg className="board" viewBox={`0 0 ${c.w * T} ${c.h * T}`} role="grid" aria-label="Battlefield">
            {c.tiles.map((row, y) => [...row].map((t, x) => <TileArt key={`${x},${y}`} t={t} x={x} y={y} kind={map.kind} extract={c.setup.objective === 'extract'} />))}
            {/* reachable overlay */}
            {[...reach.entries()].map(([k, cost]) => {
              const [x, y] = k.split(',').map(Number);
              return (
                <g key={`r${k}`} className="reach" onClick={() => clickTile(x, y)}>
                  <rect x={x * T + 3} y={y * T + 3} width={T - 6} height={T - 6} rx="6" fill="#2bb3a3" fillOpacity="0.2" stroke="#2bb3a3" strokeOpacity="0.7" />
                  <text x={x * T + T - 10} y={y * T + 16} className="tile-cost" textAnchor="end">
                    {cost}
                  </text>
                </g>
              );
            })}
            {/* units */}
            {c.units
              .filter((x) => !x.fled)
              .map((x) => {
                const active = u?.uid === x.uid && !c.result;
                const cx = x.x * T + T / 2;
                const cy = x.y * T + T / 2;
                if (x.down)
                  return (
                    <g key={x.uid} opacity="0.55">
                      <path d={`M${cx - 12} ${cy - 12} L${cx + 12} ${cy + 12} M${cx + 12} ${cy - 12} L${cx - 12} ${cy + 12}`} stroke={ringFor(x)} strokeWidth="4" />
                    </g>
                  );
                return (
                  <g key={x.uid} className={`unit ${active ? 'active' : ''}`} onClick={() => clickTile(x.x, x.y)} style={{ transform: `translate(0,0)` }}>
                    <ellipse cx={cx} cy={cy + 24} rx="22" ry="6" fill="#000" opacity="0.45" />
                    {active && <circle cx={cx} cy={cy} r="30" fill="none" stroke="#f0d27a" strokeWidth="3" className={reduceFlash ? '' : 'pulse'} />}
                    <circle cx={cx} cy={cy} r="26" fill="#120b07" stroke={ringFor(x)} strokeWidth="3" />
                    <Portrait look={lookFor(x)} size={50} x={cx - 25} y={cy - 25} round />
                    {x.kind === 'officer' && <Glyph name="crown" x={cx + 20} y={cy - 22} size={14} color="#f0d27a" />}
                    {x.braced && <Glyph name="shield" x={cx - 20} y={cy - 22} size={14} color="#9fd8d0" />}
                    {x.stunned && <Glyph name="storm" x={cx + 20} y={cy + 14} size={14} color="#e0b07a" />}
                    <rect x={cx - 24} y={cy + 26} width="48" height="6" fill="#200" stroke="#000" />
                    <rect x={cx - 24} y={cy + 26} width={(48 * x.hp) / x.maxHp} height="6" fill={x.side === 'enemy' ? '#c0443a' : '#2bb3a3'} />
                    <text x={cx} y={cy - 29} textAnchor="middle" className="unit-name">
                      {x.name}
                    </text>
                  </g>
                );
              })}
            {/* target badges */}
            {playerTurn &&
              u &&
              action !== 'move' &&
              action !== 'brace' &&
              action !== 'rally' &&
              c.units
                .filter((x) => x.side === 'enemy' && living(x))
                .map((x) => {
                  const info = actionsAgainst(c, u, x).find((i) => i.action === action);
                  if (!info) return null;
                  const cx = x.x * T + T - 12;
                  const cy = x.y * T + 14;
                  return (
                    <g key={`b${x.uid}`} className="badge" onClick={() => info.ok && doAction(action, x.uid)} opacity={info.ok ? 1 : 0.45}>
                      <title>{info.ok ? `${info.pct}%${info.note ? ` · ${info.note}` : ''}` : info.reason}</title>
                      <rect x={cx - 14} y={cy - 14} width="28" height="28" transform={`rotate(45 ${cx} ${cy})`} fill="#10201e" stroke={info.ok ? '#2bb3a3' : '#6a6a6a'} strokeWidth="2.5" />
                      <text x={cx} y={cy + 5} textAnchor="middle" className="badge-text">
                        {info.pct}%
                      </text>
                      {info.ok && info.note === 'Overboard!' && (
                        <text x={cx} y={cy + 30} textAnchor="middle" className="badge-note">
                          OVERBOARD
                        </text>
                      )}
                    </g>
                  );
                })}
            {/* melee hint when moving: adjacent enemies */}
            {playerTurn &&
              u &&
              action === 'move' &&
              c.units
                .filter((x) => x.side === 'enemy' && living(x))
                .map((x) => {
                  const info = actionsAgainst(c, u, x).find((i) => i.action === 'melee')!;
                  if (!info.ok) return null;
                  const cx = x.x * T + T - 12;
                  const cy = x.y * T + 14;
                  return (
                    <g key={`m${x.uid}`} className="badge" onClick={() => doAction('melee', x.uid)}>
                      <rect x={cx - 14} y={cy - 14} width="28" height="28" transform={`rotate(45 ${cx} ${cy})`} fill="#10201e" stroke="#c9a24a" strokeWidth="2.5" />
                      <text x={cx} y={cy + 5} textAnchor="middle" className="badge-text">
                        {info.pct}%
                      </text>
                    </g>
                  );
                })}
            {/* floating text */}
            {c.fx.slice(-6).map((f) => (
              <text key={f.id} x={f.x * T + T / 2} y={f.y * T + 10} textAnchor="middle" className={`fx fx-${f.kind}`}>
                {f.text}
              </text>
            ))}
          </svg>
        </div>
        <aside className="combat-log" aria-live="polite">
          <h2>Battle</h2>
          <ol>
            {c.log
              .slice(-14)
              .reverse()
              .map((l, i) => (
                <li key={c.log.length - i}>{l}</li>
              ))}
          </ol>
        </aside>
      </div>

      <footer className="combat-bottom">
        {show && (
          <div className="unit-card">
            <Portrait look={lookFor(show)} size={64} ring={ringFor(show)} />
            <div>
              <div className="uc-name">{show.lt ? LIEUTENANTS[show.lt].name : show.name}</div>
              <div className="uc-role">{show.lt ? LIEUTENANTS[show.lt].role : 'Sailor'}</div>
              <dl>
                <dt>Initiative</dt>
                <dd>{show.init}</dd>
                <dt>Melee</dt>
                <dd>{show.melee}%</dd>
                <dt>HP</dt>
                <dd>
                  {show.hp}/{show.maxHp}
                </dd>
              </dl>
            </div>
          </div>
        )}
        <div className="ap-box">
          <div className="ap-big">{playerTurn && u ? u.ap : '–'} AP</div>
          <div className="ap-pips">
            {Array.from({ length: AP_PER_TURN }).map((_, i) => (
              <span key={i} className={playerTurn && u && i < u.ap ? 'on' : ''} />
            ))}
          </div>
        </div>
        <div className="c-actions" role="toolbar" aria-label="Combat actions">
          {ACTIONS.map((a) => {
            const cost = COSTS[a.id];
            let ok = playerTurn && !!u && u.ap >= cost;
            if (a.id === 'pistol' && (c.pistolUsed.player || u?.kind === 'sailor')) ok = false;
            if (a.id === 'rally' && (u?.kind !== 'lt' || u?.rallied)) ok = false;
            if (a.id === 'parley' && !(u && u.parley > 0)) ok = false;
            if ((a.id === 'parley' || a.id === 'rally') && !ok && a.id === 'parley' && !(u && u.parley > 0)) return null;
            return (
              <button
                key={a.id}
                className={`c-act ${action === a.id ? 'on' : ''}`}
                disabled={!ok}
                onClick={() => (a.id === 'brace' || a.id === 'rally' ? doAction(a.id) : setAction(a.id))}
                title={`${a.label} (${a.key})`}
              >
                <Icon name={a.icon} size={26} />
                <span>{a.label}</span>
                <small>
                  {cost} AP <kbd>{a.key}</kbd>
                </small>
              </button>
            );
          })}
        </div>
        <div className="c-side">
          <button className="end-btn small" disabled={!playerTurn} onClick={() => act((s) => GAME_ACTIONS.end(s))} title="End this unit's turn (Space)">
            END TURN
          </button>
          <div className="c-side-row">
            <button disabled={!playerTurn || !u} onClick={() => u && setAuto(u.uid)} title="Let this unit act on its own">
              Auto
            </button>
            <button onClick={() => act((s) => GAME_ACTIONS.retreat(s))} disabled={!!c.result} title="Retreat: counts as a loss">
              Retreat
            </button>
          </div>
        </div>
        <div className="init-bar" aria-label="Initiative order">
          {c.order.map((uid, i) => {
            const x = c.units.find((y) => y.uid === uid)!;
            if (!living(x)) return null;
            return (
              <div key={uid} className={`init ${uid === u?.uid ? 'now' : ''} ${x.side}`} title={`${x.name} · init ${x.init}`}>
                <Portrait look={lookFor(x)} size={46} ring={ringFor(x)} />
                <span>{i + 1}</span>
              </div>
            );
          })}
        </div>
      </footer>

      {c.result && (
        <div className="overlay">
          <div className={`modal result ${c.result}`} role="dialog" aria-modal="true">
            <h2>{c.result === 'win' ? 'VICTORY' : c.result === 'retreat' ? 'RETREAT' : 'DEFEAT'}</h2>
            <p>{c.log[c.log.length - 1]}</p>
            <button className="primary wide" onClick={onFinish} autoFocus>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Thin wrappers so the view can dispatch by name.
function aiStepSafe(s: GameState) {
  if (s.combat && !s.combat.result) aiStep(s);
}

const GAME_ACTIONS: Record<CombatAction | 'end' | 'retreat', (s: GameState, arg?: string) => void> = {
  move: (s, k) => {
    const [x, y] = (k ?? '').split(',').map(Number);
    doMove(s, x, y);
  },
  melee: (s, t) => void doMelee(s, t!),
  pike: (s, t) => void doPike(s, t!),
  shove: (s, t) => void doShove(s, t!),
  brace: (s) => void doBrace(s),
  pistol: (s, t) => void doPistol(s, t!),
  rally: (s) => void doRally(s),
  parley: (s, t) => void doParley(s, t!),
  end: (s) => endTurn(s),
  retreat: (s) => retreat(s),
};
