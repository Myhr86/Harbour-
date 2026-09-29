// Stylized SVG bust portraits, built from a few parameters so every face
// shares one visual language (dark wood frame, ink-heavy shading).
import type { PortraitLook } from '../game/content/lieutenants';

export interface PortraitProps {
  look: PortraitLook;
  size?: number;
  dim?: boolean;
  ring?: string;
  title?: string;
  x?: number;
  y?: number;
  round?: boolean;
}

export const ENEMY_LOOKS: Record<string, PortraitLook> = {
  neutral: { skin: '#b98962', hair: '#3a2a1c', hat: 'none', hatColor: '#000', coat: '#5a4a38', beard: 'stubble' },
  knives: { skin: '#c49068', hair: '#1e120c', hat: 'bandana', hatColor: '#8e1f1a', coat: '#3a1612', beard: 'full', scar: true },
  hart: { skin: '#d2a07a', hair: '#4a3020', hat: 'tricorn', hatColor: '#3e2e5a', coat: '#4a3868', beard: 'stubble' },
  company: { skin: '#e0b894', hair: '#d8d0c0', hat: 'tricorn', hatColor: '#2a2418', coat: '#6a5424', beard: 'none' },
  navy: { skin: '#e6bc98', hair: '#e8e4dc', hat: 'bicorne', hatColor: '#141c30', coat: '#9a2a24', beard: 'none' },
  sailor: { skin: '#b67c56', hair: '#2a1a10', hat: 'scarf', hatColor: '#2a6a64', coat: '#3a4a48', beard: 'stubble' },
};

export function Portrait({ look, size = 64, dim, ring, title, x, y, round }: PortraitProps) {
  const { skin, hair, hat, hatColor, coat, beard } = look;
  return (
    <svg viewBox="0 0 64 64" x={x} y={y} width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ filter: dim ? 'grayscale(1) brightness(0.55)' : undefined, display: 'block', clipPath: round ? 'circle(50%)' : undefined }}>
      <defs>
        <radialGradient id="pbg" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3b2a1c" />
          <stop offset="100%" stopColor="#140d08" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="4" fill="url(#pbg)" />
      {/* shoulders / coat */}
      <path d="M6 64 C8 48 20 44 32 44 C44 44 56 48 58 64 Z" fill={coat} />
      <path d="M26 45 L32 56 L38 45" fill="#e8dcc0" opacity="0.85" />
      <path d="M6 64 C8 48 20 44 32 44" stroke="#000" strokeOpacity="0.35" fill="none" />
      {/* neck + head */}
      <rect x="27" y="36" width="10" height="10" fill={skin} />
      <ellipse cx="32" cy="28" rx="11" ry="13" fill={skin} />
      <path d="M21 28 C21 36 26 41 32 41 C38 41 43 36 43 28" fill="#000" opacity="0.12" />
      {/* hair */}
      {hat !== 'cleric' && <path d="M21 26 C20 16 26 13 32 13 C39 13 44 17 43 26 L41 22 C37 19 27 19 23 22 Z" fill={hair} />}
      {/* eyes & brows */}
      <ellipse cx="27.5" cy="28" rx="1.6" ry="1.2" fill="#140c08" />
      <ellipse cx="36.5" cy="28" rx="1.6" ry="1.2" fill="#140c08" />
      <path d="M25 25 L30 25.6 M34 25.6 L39 25" stroke={hair} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M32 29 L31 33 L33 33.4" stroke="#000" strokeOpacity="0.35" fill="none" strokeWidth="0.9" />
      {/* beard */}
      {beard === 'full' && <path d="M22 30 C22 40 27 44 32 44 C37 44 42 40 42 30 C39 35 36 36 32 36 C28 36 25 35 22 30 Z" fill={hair} />}
      {beard === 'grey' && <path d="M23 32 C23 40 27 43 32 43 C37 43 41 40 41 32 C38 36 35 37 32 37 C29 37 26 36 23 32 Z" fill="#cfc8bc" />}
      {beard === 'stubble' && <path d="M23 32 C24 39 28 41 32 41 C36 41 40 39 41 32 C38 36 26 36 23 32 Z" fill={hair} opacity="0.35" />}
      <path d="M29 37 Q32 38.4 35 37" stroke="#5a2a1a" strokeWidth="1" fill="none" />
      {look.scar && <path d="M37 22 L40 31" stroke="#8a3a2a" strokeWidth="1.1" />}
      {look.earring && <circle cx="21.5" cy="31" r="1.3" fill="none" stroke="#e0b84a" strokeWidth="0.9" />}
      {/* hats */}
      {hat === 'tricorn' && (
        <g>
          <path d="M12 20 C20 22 44 22 52 20 C48 12 40 7 32 7 C24 7 16 12 12 20 Z" fill={hatColor} />
          <path d="M12 20 C20 23 44 23 52 20" stroke="#e0c070" strokeWidth="0.8" fill="none" opacity="0.7" />
        </g>
      )}
      {hat === 'bicorne' && (
        <g>
          <path d="M8 19 C18 21 46 21 56 19 C50 9 40 6 32 6 C24 6 14 9 8 19 Z" fill={hatColor} />
          <circle cx="32" cy="14" r="2.4" fill="#e8e0d0" />
          <path d="M8 19 C18 22 46 22 56 19" stroke="#d8b050" strokeWidth="0.9" fill="none" />
        </g>
      )}
      {hat === 'bandana' && (
        <g>
          <path d="M20 22 C20 13 26 11 32 11 C39 11 44 14 44 22 C38 19 26 19 20 22 Z" fill={hatColor} />
          <path d="M43 20 L50 26 L46 27 Z" fill={hatColor} />
          <circle cx="27" cy="15" r="0.9" fill="#f0e0c0" opacity="0.6" />
          <circle cx="36" cy="14" r="0.9" fill="#f0e0c0" opacity="0.6" />
        </g>
      )}
      {hat === 'scarf' && <path d="M20 23 C19 13 26 11 32 11 C39 11 45 14 44 23 C38 19 26 19 20 23 Z" fill={hatColor} />}
      {hat === 'cleric' && (
        <g>
          <path d="M20 24 C20 18 26 16 32 16 C38 16 44 18 44 24 C38 21 26 21 20 24 Z" fill={hair} />
          <ellipse cx="32" cy="15" rx="17" ry="3.5" fill={hatColor} />
          <path d="M22 15 C22 8 27 6 32 6 C37 6 42 8 42 15 Z" fill={hatColor} />
          <rect x="29" y="46" width="6" height="3" fill="#f0ece0" />
        </g>
      )}
      {ring && <rect x="1" y="1" width="62" height="62" rx="4" fill="none" stroke={ring} strokeWidth="2" />}
    </svg>
  );
}
