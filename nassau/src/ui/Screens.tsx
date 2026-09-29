import { useState } from 'react';
import type { GameState, Settings } from '../game';
import { ENDINGS, playerDistricts, saveSummary } from '../game';
import { LIEUTENANTS, LT_ORDER } from '../game/content/lieutenants';
import { Portrait } from './Portrait';
import { Icon } from './Icons';

interface TitleProps {
  onNew: (crew: string, seed: string) => void;
  onLoad: (slot: 'auto' | 'manual') => void;
  settings: Settings;
  onSettings: () => void;
}

export function TitleScreen({ onNew, onLoad, onSettings }: TitleProps) {
  const [crew, setCrew] = useState('Cooper’s Crew');
  const [seed, setSeed] = useState('');
  const auto = saveSummary('auto');
  const manual = saveSummary('manual');
  return (
    <div className="title-screen">
      <svg className="title-art" viewBox="0 0 1200 500" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="tsky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a1020" />
            <stop offset="0.55" stopColor="#7a3a2a" />
            <stop offset="0.8" stopColor="#e2863a" />
          </linearGradient>
        </defs>
        <rect width="1200" height="500" fill="url(#tsky)" />
        <circle cx="820" cy="360" r="60" fill="#f0b060" opacity="0.8" />
        <rect y="360" width="1200" height="140" fill="#0b1a1e" />
        <path d="M0 370 C200 360 400 380 600 368 C800 356 1000 380 1200 366" stroke="#e2863a" strokeOpacity="0.4" fill="none" strokeWidth="3" />
        {[
          [160, 360, 1.6],
          [420, 372, 1],
          [990, 364, 1.3],
        ].map(([x, y, k], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${k})`} fill="#07080a">
            <path d="M-60 0 L60 0 L48 16 L-48 16 Z" />
            <path d="M-4 0 V-90 M26 0 V-70 M-34 0 V-60" stroke="#07080a" strokeWidth="4" />
            <path d="M-4 -86 C-40 -70 -40 -30 -4 -18 Z M26 -66 C0 -54 0 -26 26 -16 Z M-34 -56 C-56 -44 -56 -24 -34 -16 Z" opacity="0.85" />
          </g>
        ))}
        <path d="M0 360 L60 300 L120 330 L200 280 L260 330 L330 300 L360 360 Z" fill="#0a0a0c" />
      </svg>
      <div className="title-card">
        <Icon name="skull" size={54} color="#e8d9b5" />
        <h1>NASSAU</h1>
        <div className="title-sub">Pirate Republic · 1718</div>
        <p className="title-pitch">You are a captain who stayed ashore. Own the docks, keep your lieutenants loyal, and survive empires — and weather — much bigger than you.</p>
        <label className="field">
          Name your crew
          <input value={crew} maxLength={28} onChange={(e) => setCrew(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onNew(crew, seed)} />
        </label>
        <label className="field small">
          Seed (optional — same seed, same island)
          <input value={seed} maxLength={24} placeholder="random" onChange={(e) => setSeed(e.target.value)} />
        </label>
        <button className="primary wide" onClick={() => onNew(crew, seed)}>
          Set sail — New Game
        </button>
        {auto && (
          <button className="wide" onClick={() => onLoad('auto')}>
            Continue (dawn autosave) — {auto}
          </button>
        )}
        {manual && (
          <button className="wide" onClick={() => onLoad('manual')}>
            Load saved game — {manual}
          </button>
        )}
        <button className="link" onClick={onSettings}>
          Settings &amp; accessibility
        </button>
      </div>
    </div>
  );
}

export function EndingScreen({ game, onNew }: { game: GameState; onNew: () => void }) {
  const e = ENDINGS[game.ending!];
  const ids = LT_ORDER.filter((id) => game.lts[id].status !== 'unrecruited');
  return (
    <div className={`ending-screen ${e.id}`}>
      <div className="ending-card">
        <div className="ending-kicker">Day {game.day} · {game.crewName}</div>
        <h1>{e.title}</h1>
        <div className="title-sub">{e.subtitle}</div>
        {e
          .body(game)
          .split('\n\n')
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        <div className="ending-stats">
          <div>
            <b>{playerDistricts(game).length}</b> districts
          </div>
          <div>
            <b>{game.res.doubloons}</b> doubloons
          </div>
          <div>
            <b>{game.res.infamy}</b> infamy
          </div>
          <div>
            <b>{game.res.pardon}%</b> pardon
          </div>
          <div>
            <b>{game.stats.fightsWon}</b>–{game.stats.fightsLost} fights
          </div>
          <div>
            <b>{game.stats.prizes}</b> prizes
          </div>
          <div>
            <b>{game.stats.stormsSurvived}</b> storms
          </div>
        </div>
        <div className="ending-lts">
          {ids.map((id) => {
            const l = game.lts[id];
            const fate = l.status === 'dead' ? 'Died in Nassau' : l.status === 'defected' ? 'Went over to Hart' : l.loyalty > 60 ? 'Loyal to the end' : 'Stayed, grumbling';
            return (
              <div key={id} className="el">
                <Portrait look={LIEUTENANTS[id].look} size={52} dim={l.status === 'dead' || l.status === 'defected'} />
                <div>
                  <b>{LIEUTENANTS[id].name}</b>
                  <small>{fate}</small>
                </div>
              </div>
            );
          })}
        </div>
        <button className="primary wide" onClick={onNew}>
          Another season
        </button>
      </div>
    </div>
  );
}
