// The illustrated harbour map: parchment island, ink-stain territories,
// ships at anchor, and a hurricane the colour of bruised copper.
import type { DistrictId, GameState } from '../game';
import { DISTRICTS, DISTRICT_ORDER } from '../game/content/districts';
import { FACTIONS } from '../game/content/factions';
import { BUILDING_ICON, FACTION_ICON, Glyph } from './Icons';

interface Props {
  game: GameState;
  selected: DistrictId | null;
  onSelect: (d: DistrictId) => void;
  reduceFlash: boolean;
}

const ISLAND =
  'M 40 150 C 30 100 80 60 150 66 C 240 50 330 60 420 54 C 520 44 620 40 690 58 C 740 80 760 150 800 200 C 840 250 836 330 830 410 C 824 470 760 500 720 560 C 680 610 560 612 460 604 C 380 610 290 590 200 580 C 120 572 60 540 44 470 C 30 400 50 330 40 260 C 36 220 44 190 40 150 Z';

function Ship({ x, y, scale = 1, color, flag, damaged }: { x: number; y: number; scale?: number; color: string; flag: string; damaged?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={damaged ? 0.6 : 1}>
      <path d="M-26 0 L26 0 L20 10 L-20 10 Z" fill={color} stroke="#0e0906" />
      <path d="M-2 0 V-40 M12 0 V-30" stroke="#1a100a" strokeWidth="2" />
      <path d="M-2 -38 C-20 -30 -20 -12 -2 -6 Z" fill={damaged ? '#6a5a48' : '#d8c8a4'} />
      <path d="M12 -28 C0 -22 0 -10 12 -6 Z" fill={damaged ? '#6a5a48' : '#d8c8a4'} />
      <path d="M-2 -40 L10 -37 L-2 -34 Z" fill={flag} />
      <path d="M-30 12 C-15 16 15 16 30 12" stroke="#9fd8d0" strokeOpacity="0.25" fill="none" />
    </g>
  );
}

export function MapView({ game, selected, onSelect, reduceFlash }: Props) {
  const c = game.clocks;
  const warning = c.hurricanePhase === 'warning';
  // The storm slides in from the east-southeast as landfall nears.
  const stormProgress = warning ? 1 - c.hurricaneHours / 72 : 0;
  const stormX = 1080 - stormProgress * 260;
  const stormY = 520 - stormProgress * 160;
  const blockade = c.blockadeDays > 0;
  const shipsHere = game.ships;

  return (
    <svg className="map" viewBox="0 0 1000 620" role="group" aria-label="Map of Nassau">
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f2a2e" />
          <stop offset="0.6" stopColor="#0b1f24" />
          <stop offset="1" stopColor="#081418" />
        </linearGradient>
        <radialGradient id="sunset" cx="85%" cy="5%" r="60%">
          <stop offset="0" stopColor="#e2863a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#e2863a" stopOpacity="0" />
        </radialGradient>
        <filter id="parchment" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.26  0 0 0 0.55 0" result="tint" />
          <feComposite in="tint" in2="SourceGraphic" operator="in" result="tex" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="tex" />
          </feMerge>
        </filter>
        <filter id="ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="3" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="18" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.6" />
        </filter>
        <filter id="glow">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="storm" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#1e0f14" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#6a3a36" stopOpacity="0.75" />
          <stop offset="0.7" stopColor="#a0583a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#5e3a4a" stopOpacity="0" />
        </radialGradient>
        <pattern id="waves" width="60" height="30" patternUnits="userSpaceOnUse">
          <path d="M0 15 C10 10 20 10 30 15 C40 20 50 20 60 15" stroke="#3d7d78" strokeOpacity="0.18" fill="none" />
        </pattern>
      </defs>

      <rect width="1000" height="620" fill="url(#sea)" />
      <rect width="1000" height="620" fill="url(#waves)" />
      <rect width="1000" height="620" fill="url(#sunset)" />

      {/* island */}
      <path d={ISLAND} fill="#3a2c1c" transform="translate(6 8)" opacity="0.6" />
      <path d={ISLAND} fill="#8a7152" stroke="#2a1d10" strokeWidth="3" filter="url(#parchment)" />
      <path d={ISLAND} fill="none" stroke="#d9c49c" strokeOpacity="0.25" strokeWidth="10" />

      {/* territory stains */}
      {DISTRICT_ORDER.map((id) => {
        const d = DISTRICTS[id];
        const st = game.districts[id];
        const f = FACTIONS[st.owner];
        return (
          <g key={`stain-${id}`}>
            <path d={d.path} fill={f.color} fillOpacity={st.owner === 'neutral' ? 0.18 : 0.5} filter="url(#ink)" />
            <path d={d.path} fill="none" stroke="#1a110a" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="6 5" />
          </g>
        );
      })}

      {/* palms & streets */}
      {[
        [110, 300],
        [60, 420],
        [300, 570],
        [760, 470],
        [720, 150],
        [240, 70],
        [800, 330],
      ].map(([x, y], i) => (
        <g key={`palm${i}`} transform={`translate(${x} ${y})`} opacity="0.8">
          <path d="M0 0 C2 -8 1 -16 3 -22" stroke="#3a2a18" strokeWidth="2" fill="none" />
          <path d="M3 -22 C-6 -26 -12 -22 -14 -18 M3 -22 C10 -28 16 -24 18 -19 M3 -22 C0 -30 6 -34 10 -33 M3 -22 C-4 -30 -10 -30 -12 -28" stroke="#2e4a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      ))}

      {/* interactive districts */}
      {DISTRICT_ORDER.map((id) => {
        const d = DISTRICTS[id];
        const st = game.districts[id];
        const f = FACTIONS[st.owner];
        const sel = selected === id;
        const [lx, ly] = d.label;
        return (
          <g
            key={id}
            className="district"
            tabIndex={0}
            role="button"
            aria-label={`${d.name}, held by ${f.name}`}
            aria-pressed={sel}
            onClick={() => onSelect(id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(id))}
          >
            <path d={d.path} fill="transparent" stroke={sel ? '#f0d27a' : 'transparent'} strokeWidth={sel ? 4 : 0} filter={sel ? 'url(#glow)' : undefined} />
            <Glyph name={FACTION_ICON[st.owner]} x={lx} y={ly - 30} size={46} color={f.color} />
            <g transform={`translate(${lx} ${ly + 14})`}>
              <rect x="-78" y="-15" width="156" height="36" rx="3" fill="#150e09" fillOpacity="0.88" stroke={f.color} strokeOpacity="0.8" />
              <text textAnchor="middle" y="1" className="map-label">
                {d.name.toUpperCase()}
              </text>
              <text textAnchor="middle" y="15" className="map-sub" fill={f.ink}>
                {st.owner === 'player' ? game.crewName : f.name}
                {st.lockedDays > 0 ? ' · sacked' : ''}
              </text>
            </g>
            {/* fortification pips */}
            <g transform={`translate(${lx - 30} ${ly + 38})`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <rect key={i} x={i * 13} y="0" width="10" height="5" rx="1" fill={i < st.fort ? '#d8c08a' : '#2a1d12'} stroke="#0e0906" />
              ))}
            </g>
            {/* buildings */}
            {st.slots.map((sl, i) => {
              const [bx, by] = d.buildingAnchors[i] ?? d.buildingAnchors[0];
              if (!sl) return <circle key={i} cx={bx} cy={by} r="11" fill="#150e09" fillOpacity="0.4" stroke="#d8c08a" strokeOpacity="0.35" strokeDasharray="3 3" />;
              return (
                <g key={i}>
                  <circle cx={bx} cy={by} r="15" fill="#150e09" stroke={sl.damaged ? '#b8342c' : '#d8c08a'} strokeWidth="1.5" />
                  <Glyph name={BUILDING_ICON[sl.id]} x={bx} y={by} size={18} color={sl.damaged ? '#7a6a58' : '#e8d6a8'} />
                  {sl.damaged && <path d={`M${bx - 9} ${by - 9} L${bx + 9} ${by + 9}`} stroke="#b8342c" strokeWidth="2.5" />}
                </g>
              );
            })}
            {st.battened && <Glyph name="rope" x={lx + 70} y={ly - 26} size={20} color="#d8c08a" />}
            {st.heat > 60 && (
              <g>
                <circle cx={lx - 70} cy={ly - 26} r="9" fill="#b8342c" className={reduceFlash ? '' : 'pulse'} />
                <text x={lx - 70} y={ly - 22} textAnchor="middle" className="map-heat">
                  !
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* harbour ships */}
      {shipsHere.map((sh, i) => (
        <Ship key={sh.id} x={sh.atSea ? 960 - i * 50 : 850 + i * 60} y={sh.atSea ? 60 + i * 30 : 300 + i * 50} scale={sh.kind === 'brig' ? 1.2 : 0.9} color="#2a1a10" flag="#2bb3a3" damaged={sh.damaged} />
      ))}
      <Ship x={900} y={150} scale={0.8} color="#2a1a10" flag="#c9a24a" />
      <Ship x={780} y={560} scale={0.7} color="#2a1a10" flag="#8a6cc4" />

      {/* navy */}
      {blockade ? (
        <g>
          <Ship x={930} y={440} scale={1.6} color="#141c30" flag="#5b7fb5" />
          <Ship x={880} y={560} scale={1} color="#141c30" flag="#5b7fb5" />
          <Ship x={960} y={250} scale={1} color="#141c30" flag="#5b7fb5" />
          <path d="M840 20 C880 200 880 420 840 610" stroke="#5b7fb5" strokeWidth="3" strokeDasharray="10 8" fill="none" opacity="0.8" />
          <text x="930" y="600" textAnchor="middle" className="map-sub" fill="#a9c3ea">
            BLOCKADE
          </text>
        </g>
      ) : (
        c.navyAlert > 50 && <Ship x={960} y={520} scale={0.9} color="#141c30" flag="#5b7fb5" />
      )}

      {/* hurricane */}
      {warning && (
        <g transform={`translate(${stormX} ${stormY})`} pointerEvents="none">
          <circle r="190" fill="url(#storm)" />
          <g className={reduceFlash ? '' : 'spin'}>
            {[0, 72, 144, 216, 288].map((a) => (
              <path key={a} transform={`rotate(${a})`} d="M0 0 C40 -20 90 -10 130 30" stroke="#c07a52" strokeOpacity="0.55" strokeWidth="10" fill="none" strokeLinecap="round" />
            ))}
          </g>
          <circle r="16" fill="#12080c" />
          <text y="-60" textAnchor="middle" className="map-storm">
            {c.hurricaneHours}h
          </text>
        </g>
      )}

      {/* compass */}
      <g transform="translate(70 560)" opacity="0.85">
        <circle r="30" fill="#150e09" fillOpacity="0.7" stroke="#d8c08a" strokeOpacity="0.6" />
        <path d="M0 -26 L6 0 L0 26 L-6 0 Z" fill="#d8c08a" />
        <path d="M-26 0 L0 6 L26 0 L0 -6 Z" fill="#8a7152" />
        <text y="-34" textAnchor="middle" className="map-sub" fill="#d8c08a">
          N
        </text>
      </g>
      <text x="880" y="30" textAnchor="middle" className="map-sea">
        NASSAU HARBOUR
      </text>
    </svg>
  );
}
