// Hand-drawn glyphs on a 24x24 grid. Used on the map, action cards and HUD.
import type { JSX } from 'react';

export type IconName =
  | 'anchor'
  | 'skull'
  | 'scales'
  | 'crown'
  | 'mug'
  | 'dice'
  | 'crane'
  | 'gavel'
  | 'barrel'
  | 'spyglass'
  | 'cross'
  | 'swords'
  | 'shield'
  | 'lantern'
  | 'scroll'
  | 'fist'
  | 'hammer'
  | 'saw'
  | 'rope'
  | 'flag'
  | 'coin'
  | 'crew'
  | 'heart'
  | 'storm'
  | 'ship'
  | 'fort'
  | 'free'
  | 'boot'
  | 'pike'
  | 'pistol'
  | 'hand'
  | 'hourglass'
  | 'gear'
  | 'save'
  | 'help';

const P: Record<IconName, JSX.Element> = {
  anchor: (
    <g fill="none" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 6.5 V20 M7 10 H17 M4 14 C4 19 8 21 12 21 C16 21 20 19 20 14 M4 14 L2.5 16 M20 14 L21.5 16" />
    </g>
  ),
  skull: (
    <g>
      <path d="M12 2 C6.5 2 4 6 4 10 C4 13 5.5 14.5 7 15.5 V19 H17 V15.5 C18.5 14.5 20 13 20 10 C20 6 17.5 2 12 2 Z" />
      <circle cx="9" cy="10" r="2.2" fill="#000" />
      <circle cx="15" cy="10" r="2.2" fill="#000" />
      <path d="M12 12.5 L11 14.5 H13 Z" fill="#000" />
      <path d="M9 19 V21 M12 19 V21 M15 19 V21" stroke="#000" strokeWidth="1" />
    </g>
  ),
  scales: (
    <g fill="none" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 3 V20 M7 20 H17 M4 6 H20 M6 6 L3 13 H9 Z M18 6 L15 13 H21 Z" />
    </g>
  ),
  crown: <path d="M3 18 L4 7 L9 12 L12 5 L15 12 L20 7 L21 18 Z M3 20 H21 V21.5 H3 Z" />,
  mug: (
    <g>
      <path d="M5 6 H15 V20 H5 Z" />
      <path d="M15 9 H18 C19.5 9 19.5 16 18 16 H15" fill="none" strokeWidth="1.8" />
      <path d="M5 6 C5 3.5 15 3.5 15 6" opacity="0.6" />
    </g>
  ),
  dice: (
    <g>
      <rect x="3" y="6" width="11" height="11" rx="2" />
      <rect x="11" y="3" width="10" height="10" rx="2" opacity="0.75" />
      <circle cx="6.5" cy="9.5" r="1.1" fill="#000" />
      <circle cx="10.5" cy="13.5" r="1.1" fill="#000" />
    </g>
  ),
  crane: (
    <g fill="none" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 21 V4 L20 7 M6 4 L3 8 M18 7 V14 M16 14 H20 V17 H16 Z M3 21 H10" />
    </g>
  ),
  gavel: (
    <g>
      <rect x="9" y="3" width="10" height="5" rx="1" transform="rotate(35 14 5.5)" />
      <path d="M11 10 L4 19" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <rect x="12" y="18" width="9" height="3" rx="1" />
    </g>
  ),
  barrel: (
    <g>
      <path d="M6 3 H18 C19.5 7 19.5 17 18 21 H6 C4.5 17 4.5 7 6 3 Z" />
      <path d="M5 8 H19 M5 16 H19" stroke="#000" strokeWidth="1.2" opacity="0.6" />
    </g>
  ),
  spyglass: (
    <g>
      <path d="M3 17 L17 6 L19.5 9 L5.5 20 Z" />
      <path d="M16 5 L21 11" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </g>
  ),
  cross: <path d="M10.5 2 H13.5 V8 H19 V11 H13.5 V22 H10.5 V11 H5 V8 H10.5 Z" />,
  swords: (
    <g fill="none" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4 L17 17 M20 4 L7 17 M15 19 L19 15 M5 15 L9 19 M3 21 L6 18 M21 21 L18 18" />
    </g>
  ),
  shield: (
    <g>
      <path d="M12 2 L20 5 V11 C20 16 16.5 20 12 22 C7.5 20 4 16 4 11 V5 Z" />
      <path d="M12 5 V19 M7 10 H17" stroke="#000" strokeWidth="1.2" opacity="0.5" />
    </g>
  ),
  lantern: (
    <g>
      <path d="M9 2 H15 M12 2 V4 M7 6 H17 L16 18 H8 Z M6 18 H18 V21 H6 Z" />
      <circle cx="12" cy="12" r="2.6" fill="#000" opacity="0.35" />
    </g>
  ),
  scroll: (
    <g>
      <path d="M6 4 H17 C19 4 19 7 17 7 V18 C17 21 14 21 13 20 H4 C2.5 20 2.5 17 4 17 H6 Z" />
      <path d="M8 9 H14 M8 12 H14 M8 15 H12" stroke="#000" strokeWidth="1" opacity="0.6" />
    </g>
  ),
  fist: (
    <g>
      <path d="M6 9 C6 7 8 6 9 7 C9 5 11 5 12 6 C12 4.5 14.5 4.5 15 6 C15.5 5 18 5 18 7.5 V14 C18 18 15 21 11 21 C8 21 6 19 6 16 Z" />
      <path d="M9 7 V11 M12 6 V11 M15 6 V11" stroke="#000" strokeWidth="1" opacity="0.5" />
    </g>
  ),
  hammer: (
    <g>
      <path d="M4 7 L11 3 L14 6 L11 8 Z" />
      <path d="M11 7 L20 19" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </g>
  ),
  saw: (
    <g>
      <path d="M3 15 L17 4 L21 8 L7 19 Z" />
      <path d="M5 17 L6 19 M8 15 L9 17 M11 12.5 L12 14.5 M14 10 L15 12" stroke="#000" strokeWidth="1" />
    </g>
  ),
  rope: (
    <g fill="none" strokeWidth="2">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M5 12 C8 9 16 15 19 12" />
    </g>
  ),
  flag: (
    <g>
      <path d="M5 2 V22" strokeWidth="2" fill="none" />
      <path d="M6 3 H20 L16.5 8 L20 13 H6 Z" />
    </g>
  ),
  coin: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="#000" strokeWidth="1" opacity="0.4" />
      <path d="M12 8 V16 M10 10 H14" stroke="#000" strokeWidth="1.4" opacity="0.55" />
    </g>
  ),
  crew: (
    <g>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2 20 C2 14 14 14 14 20 Z M10 20 C10 14 22 14 22 20 Z" />
    </g>
  ),
  heart: <path d="M12 21 C5 15 2 12 2 8 C2 5 4.5 3 7 3 C9 3 11 4.5 12 6 C13 4.5 15 3 17 3 C19.5 3 22 5 22 8 C22 12 19 15 12 21 Z" />,
  storm: (
    <g fill="none" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 12 C12 8 16 6 19 8 M12 12 C16 12 18 16 16 19 M12 12 C12 16 8 18 5 16 M12 12 C8 12 6 8 8 5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </g>
  ),
  ship: (
    <g>
      <path d="M3 15 H21 L18 20 H6 Z" />
      <path d="M11 2 V15 M11 3 L4 12 H11 M12 4 L19 12 H12" />
    </g>
  ),
  fort: <path d="M3 21 V9 H6 V11 H8 V9 H11 V11 H13 V9 H16 V11 H18 V9 H21 V21 Z M10 21 V16 C10 14 14 14 14 16 V21 Z" />,
  free: <circle cx="12" cy="12" r="6" fill="none" strokeWidth="2" strokeDasharray="3 2" />,
  boot: <path d="M8 2 H14 V13 L20 15 C21.5 15.5 22 17 22 18 V20 H4 V17 C6 16 8 14 8 12 Z" />,
  pike: (
    <g>
      <path d="M3 21 L17 7" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M15 5 L22 2 L19 9 Z" />
      <path d="M13 5 L19 11" strokeWidth="1.6" fill="none" />
    </g>
  ),
  pistol: (
    <g>
      <path d="M2 7 H18 L20 9 H14 V11 L9 11 L7 20 H3 L5 11 H2 Z" />
      <circle cx="21" cy="8" r="1.4" />
    </g>
  ),
  hand: <path d="M7 12 V5 C7 3.5 9 3.5 9 5 V10 V3.5 C9 2 11 2 11 3.5 V10 V4 C11 2.5 13 2.5 13 4 V10 V6 C13 4.5 15 4.5 15 6 V14 C15 18 13 21 10 21 C7 21 5 19 4 16 L2.5 12 C2 10.5 4 9.5 5 11 Z" />,
  hourglass: <path d="M6 2 H18 V4 C18 8 14 10 14 12 C14 14 18 16 18 20 V22 H6 V20 C6 16 10 14 10 12 C10 10 6 8 6 4 Z" />,
  gear: (
    <g>
      <path d="M12 2 L14 5 L17.5 4 L18 7.5 L21.5 9 L20 12 L21.5 15 L18 16.5 L17.5 20 L14 19 L12 22 L10 19 L6.5 20 L6 16.5 L2.5 15 L4 12 L2.5 9 L6 7.5 L6.5 4 L10 5 Z" />
      <circle cx="12" cy="12" r="3.5" fill="#000" opacity="0.5" />
    </g>
  ),
  save: (
    <g>
      <path d="M4 3 H17 L21 7 V21 H4 Z" />
      <rect x="7" y="3" width="9" height="6" fill="#000" opacity="0.4" />
      <rect x="7" y="13" width="11" height="6" fill="#000" opacity="0.25" />
    </g>
  ),
  help: (
    <g>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9 C9 6 15 6 15 9 C15 11.5 12 11.5 12 14 M12 17 V18" stroke="#000" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
};

export function Icon({ name, size = 20, color = 'currentColor', title }: { name: IconName; size?: number; color?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color} stroke={color} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      {title && <title>{title}</title>}
      <g strokeWidth="0">{P[name]}</g>
    </svg>
  );
}

/** Glyph for embedding inside another SVG (no wrapper). */
export function Glyph({ name, x, y, size, color }: { name: IconName; x: number; y: number; size: number; color: string }) {
  const k = size / 24;
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${k})`} fill={color} stroke={color}>
      <g strokeWidth="0">{P[name]}</g>
    </g>
  );
}

export const BUILDING_ICON: Record<string, IconName> = {
  tavern: 'mug',
  vicehall: 'dice',
  berth: 'crane',
  prizecourt: 'gavel',
  warehouse: 'barrel',
  lookout: 'spyglass',
  chapel: 'cross',
  armory: 'swords',
};

export const ORDER_ICON: Record<string, IconName> = {
  protect: 'shield',
  smuggle: 'barrel',
  wreck: 'lantern',
  parley: 'scroll',
  muscle: 'fist',
  build: 'hammer',
  repair: 'saw',
  batten: 'rope',
  rally: 'flag',
};

export const FACTION_ICON: Record<string, IconName> = {
  player: 'anchor',
  knives: 'skull',
  hart: 'scales',
  company: 'crown',
  navy: 'ship',
  neutral: 'free',
};
