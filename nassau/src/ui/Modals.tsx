import { useEffect } from 'react';
import type { GameState, Settings } from '../game';
import { EVENTS, type EventArt } from '../game/content/events';
import { LIEUTENANTS } from '../game/content/lieutenants';
import { Portrait } from './Portrait';
import { Glyph, type IconName } from './Icons';

const ART: Record<EventArt, { sky: [string, string]; glyph: IconName; tint: string }> = {
  storm: { sky: ['#2a1418', '#a0583a'], glyph: 'storm', tint: '#e0905a' },
  ship: { sky: ['#1a2a3a', '#e2863a'], glyph: 'ship', tint: '#f0d27a' },
  navy: { sky: ['#101a2e', '#5b7fb5'], glyph: 'ship', tint: '#a9c3ea' },
  knives: { sky: ['#1e0c0a', '#b8342c'], glyph: 'skull', tint: '#f07a6c' },
  hart: { sky: ['#1a1228', '#8a6cc4'], glyph: 'scales', tint: '#c3aef0' },
  company: { sky: ['#1e180a', '#c9a24a'], glyph: 'crown', tint: '#f0d27a' },
  chapel: { sky: ['#14121a', '#8a7a9a'], glyph: 'cross', tint: '#e8d9b5' },
  crew: { sky: ['#0e1a1a', '#2bb3a3'], glyph: 'crew', tint: '#9fe0d8' },
  rum: { sky: ['#1a0e06', '#b07a44'], glyph: 'barrel', tint: '#e0b07a' },
  wedding: { sky: ['#1a1014', '#c9a24a'], glyph: 'heart', tint: '#f0c0b0' },
  recruit: { sky: ['#101a1a', '#2bb3a3'], glyph: 'flag', tint: '#e8d9b5' },
  harbour: { sky: ['#1a1a2a', '#e2863a'], glyph: 'anchor', tint: '#2bb3a3' },
};

export function SceneArt({ art, reduceFlash }: { art: EventArt; reduceFlash: boolean }) {
  const a = ART[art];
  return (
    <svg className="scene" viewBox="0 0 600 150" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`sky-${art}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a.sky[0]} />
          <stop offset="1" stopColor={a.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="600" height="150" fill={`url(#sky-${art})`} />
      {art === 'storm' && !reduceFlash && <rect width="600" height="150" fill="#fff" className="lightning" />}
      <circle cx="470" cy="95" r="34" fill={a.tint} opacity="0.35" />
      <path d="M0 112 C100 104 200 120 300 110 C400 100 500 118 600 108 V150 H0 Z" fill="#0c1416" />
      <path d="M0 122 C120 116 240 128 360 120 C460 114 540 126 600 120" stroke="#9fd8d0" strokeOpacity="0.2" fill="none" />
      <path d="M40 112 L40 70 L70 60 L100 70 L100 112 Z M120 112 V80 H160 V112 Z M180 112 V64 L205 50 L230 64 V112 Z" fill="#0a0806" opacity="0.9" />
      <Glyph name={a.glyph} x={300} y={62} size={70} color={a.tint} />
    </svg>
  );
}

export function EventModal({ game, onChoose, reduceFlash }: { game: GameState; onChoose: (i: number) => void; reduceFlash: boolean }) {
  const ev = game.pendingEvents[0];
  const def = EVENTS[ev.id];
  const choices = def.choices(game, ev);
  const speaker = def.speaker?.(game, ev);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length && !choices[n - 1].disabled) onChoose(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, onChoose]);
  return (
    <div className="overlay">
      <div className="modal event" role="dialog" aria-modal="true" aria-labelledby="ev-title">
        <SceneArt art={def.art} reduceFlash={reduceFlash} />
        <h2 id="ev-title">{def.title}</h2>
        <div className="ev-body">
          {speaker && game.lts[speaker]?.status === 'active' && (
            <div className="speaker">
              <Portrait look={LIEUTENANTS[speaker].look} size={64} ring={LIEUTENANTS[speaker].accent} />
              <span>{LIEUTENANTS[speaker].name}</span>
            </div>
          )}
          <div className="ev-text">
            {def.body(game, ev)
              .split('\n\n')
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
        </div>
        <div className="choices">
          {choices.map((c, i) => (
            <button key={i} className="choice" disabled={!!c.disabled} onClick={() => onChoose(i)}>
              <span className="ch-num">{i + 1}</span>
              <span className="ch-body">
                <b>{c.label}</b>
                <small>{c.disabled ?? c.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReportModal({ game, onClose, reduceFlash }: { game: GameState; onClose: () => void; reduceFlash: boolean }) {
  const r = game.report!;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`overlay ${r.storm && !reduceFlash ? 'storm-flash' : ''}`}>
      <div className="modal report" role="dialog" aria-modal="true" aria-labelledby="rep-title">
        {r.storm && <SceneArt art="storm" reduceFlash={reduceFlash} />}
        <h2 id="rep-title">Night of Day {r.day} — Dawn of Day {r.day + 1}</h2>
        <div className="rep-money">
          <span className="pos">Takings +{r.income}</span>
          <span className="neg">Wages −{r.wages}</span>
          <span className={r.income - r.wages >= 0 ? 'pos' : 'neg'}>
            Net {r.income - r.wages >= 0 ? '+' : ''}
            {r.income - r.wages}
          </span>
        </div>
        <ul className="rep-lines">
          {r.lines.map((l, i) => (
            <li key={i} className={l.tone}>
              {l.text}
            </li>
          ))}
        </ul>
        {r.barks.length > 0 && (
          <div className="rep-barks">
            {r.barks.map((b) => (
              <div key={b.lt} className={`rb ${b.mood}`}>
                <Portrait look={LIEUTENANTS[b.lt].look} size={40} />
                <span>“{b.text}”</span>
              </div>
            ))}
          </div>
        )}
        <button className="primary wide" onClick={onClose} autoFocus>
          To work
        </button>
      </div>
    </div>
  );
}

export function AftermathModal({ lines, won, onClose }: { lines: string[]; won: boolean; onClose: () => void }) {
  return (
    <div className="overlay">
      <div className="modal report" role="dialog" aria-modal="true">
        <h2>{won ? 'Victory' : 'Defeat'} — Aftermath</h2>
        <ul className="rep-lines">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <button className="primary wide" onClick={onClose} autoFocus>
          Back to Nassau
        </button>
      </div>
    </div>
  );
}

export function SettingsModal({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal small" role="dialog" aria-modal="true" aria-labelledby="set-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="set-title">Settings</h2>
        <label className="toggle">
          <input type="checkbox" checked={settings.reduceFlash} onChange={(e) => onChange({ ...settings, reduceFlash: e.target.checked })} />
          Reduce flashes &amp; motion (storm lightning, screen shake, spinning hurricane)
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.muted} onChange={(e) => onChange({ ...settings, muted: e.target.checked })} />
          Mute sound stings
        </label>
        <label className="toggle">
          Volume
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => onChange({ ...settings, volume: Number(e.target.value) })} />
        </label>
        <button className="primary wide" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="help-title">How to run Nassau</h2>
        <div className="help-cols">
          <div>
            <h3>Each day</h3>
            <ol>
              <li>Read the dawn events and choose.</li>
              <li>Click a district on the map, pick an order, choose which lieutenant leads it. Each lieutenant leads one order a day.</li>
              <li>
                Press <kbd>E</kbd> or <b>End Day</b>: income, wages, rum, heat, weather and the navy clock tick; rivals move.
              </li>
            </ol>
            <h3>Win</h3>
            <ul>
              <li>Hold 4 of 6 districts through 3 consecutive dawns, or</li>
              <li>hold the Prize Court + Shipyard 8 days running, or</li>
              <li>reach 100% pardon.</li>
            </ul>
            <h3>Lose</h3>
            <ul>
              <li>Morale 0, 3 days unable to pay wages, the Company holding the Docks 3 days, or the season ending (day 40).</li>
            </ul>
          </div>
          <div>
            <h3>Bigger than raids</h3>
            <ul>
              <li>
                <b>Hurricanes</b> give 48h warning. Landfall drinks rum, unroofs buildings not battened down, and sinks ships not docked. <i>Batten Down</i> a coastal district to double-moor your ships.
              </li>
              <li>
                <b>Blockades</b> start when Navy Alert hits 100%. Ship trade collapses; <i>Smuggle</i> pays nearly double; marines land on your wharves. Father Thorne can <i>Parley</i> the navy down.
              </li>
            </ul>
            <h3>Combat</h3>
            <ul>
              <li>4 AP per unit per turn. Move 1/tile, Melee 2, Pike 2 (reach 2, knocks back), Shove 1, Brace 1 (ends turn), Pistol 2 (once per fight, loud), Rally 2, Parley 3 (Thorne &amp; Beaumont).</li>
              <li>Shove or pike an enemy into the sea or over the rail: they’re out of the fight.</li>
              <li>
                Keys: <kbd>1</kbd>–<kbd>8</kbd> actions, <kbd>Space</kbd> end unit turn.
              </li>
            </ul>
          </div>
        </div>
        <button className="primary wide" onClick={onClose}>
          Aye
        </button>
      </div>
    </div>
  );
}
