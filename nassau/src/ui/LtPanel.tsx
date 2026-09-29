import type { GameState, LtId } from '../game';
import { LIEUTENANTS, LT_ORDER } from '../game/content/lieutenants';
import { Portrait } from './Portrait';

interface Props {
  game: GameState;
  picking: boolean;
  eligible: (id: LtId) => { ok: boolean; pct: number | null; reason?: string };
  chosen: LtId | null;
  onPick: (id: LtId) => void;
}

function Stars({ n, label }: { n: number; label: string }) {
  return (
    <span className="stars" title={`${label} ${n}/5`}>
      <i>{label[0]}</i>
      {'★'.repeat(n)}
      <span className="off">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function LtPanel({ game, picking, eligible, chosen, onPick }: Props) {
  const ids = LT_ORDER.filter((id) => game.lts[id].status !== 'unrecruited');
  return (
    <aside className="panel lts" aria-label="Lieutenants">
      <h2>Lieutenants</h2>
      {ids.map((id) => {
        const l = game.lts[id];
        const d = LIEUTENANTS[id];
        const bark = game.barks.find((b) => b.lt === id);
        const gone = l.status === 'dead' || l.status === 'defected';
        const e = picking ? eligible(id) : null;
        const status =
          l.status === 'dead'
            ? 'Dead'
            : l.status === 'defected'
              ? 'Gone to Hart'
              : l.status === 'wounded'
                ? l.woundDays > 50
                  ? 'In irons'
                  : `Wounded · ${l.woundDays}d`
                : l.orderedToday
                  ? 'Ordered'
                  : 'Ready';
        return (
          <button
            key={id}
            className={`lt-card ${gone ? 'gone' : ''} ${chosen === id ? 'chosen' : ''} ${picking && e?.ok ? 'pickable' : ''}`}
            disabled={!picking || !e?.ok}
            onClick={() => onPick(id)}
            title={`${d.specialty}\n${d.quirk}\nVice: ${d.vice}`}
          >
            <div className="lt-top">
              <Portrait look={d.look} size={54} dim={gone || l.status === 'wounded'} ring={chosen === id ? '#f0d27a' : d.accent} title={d.name} />
              <div className="lt-info">
                <div className="lt-name">{d.name}</div>
                <div className="lt-role">{d.role}</div>
                <div className="lt-stats">
                  <Stars n={d.stats.melee} label="Melee" />
                  <Stars n={d.stats.parley} label="Parley" />
                  <Stars n={d.stats.sea} label="Sea" />
                  <Stars n={d.stats.trade} label="Trade" />
                </div>
              </div>
            </div>
            {!gone && (
              <div className="loyalty" title={`Loyalty ${l.loyalty}. Below 25 they may refuse orders; below 35 Hart comes calling.`}>
                <span>Loyalty</span>
                <div className="meter">
                  <div style={{ width: `${l.loyalty}%`, background: l.loyalty < 30 ? '#b8342c' : l.loyalty < 50 ? '#c9a24a' : '#2bb3a3' }} />
                </div>
                <b>{l.loyalty}</b>
                <span className={`chip ${status === 'Ready' ? 'ready' : status === 'Ordered' ? 'busy' : 'bad'}`}>{status}</span>
              </div>
            )}
            {gone && <span className="chip bad">{status}</span>}
            {picking && e && (
              <div className={`pick-note ${e.ok ? '' : 'no'}`}>{e.ok ? (e.pct !== null ? `${e.pct}% success` : 'Lead this order') : e.reason}</div>
            )}
            {bark && !picking && <div className={`bark ${bark.mood}`}>“{bark.text}”</div>}
          </button>
        );
      })}
      {ids.length < LT_ORDER.length && <div className="hint">More officers may seek you out as your name spreads.</div>}
    </aside>
  );
}
