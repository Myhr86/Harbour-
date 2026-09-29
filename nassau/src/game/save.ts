// localStorage persistence. The autosave is written at every dawn, so
// reloading it replays the same day with the same RNG state.
import type { GameState } from './types';

const AUTO = 'nassau.autosave.v1';
const MANUAL = 'nassau.save.v1';
const SETTINGS = 'nassau.settings.v1';

export type Slot = 'auto' | 'manual';

function key(slot: Slot) {
  return slot === 'auto' ? AUTO : MANUAL;
}

export function saveGame(s: GameState, slot: Slot): boolean {
  try {
    localStorage.setItem(key(slot), JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot: Slot): GameState | null {
  try {
    const raw = localStorage.getItem(key(slot));
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSummary(slot: Slot): string | null {
  const s = loadGame(slot);
  if (!s) return null;
  return `${s.crewName} · Day ${s.day} · ${s.res.doubloons} doubloons`;
}

export interface Settings {
  reduceFlash: boolean;
  muted: boolean;
  volume: number;
}

export const DEFAULT_SETTINGS: Settings = { reduceFlash: false, muted: false, volume: 0.6 };

export function loadSettings(): Settings {
  const base = { ...DEFAULT_SETTINGS };
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) base.reduceFlash = true;
    const raw = localStorage.getItem(SETTINGS);
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<Settings>) } : base;
  } catch {
    return base;
  }
}

export function saveSettings(st: Settings): void {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(st));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
