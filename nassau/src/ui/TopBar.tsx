import type { GameState } from '../game';
import { globalHeat, isBlockaded, MAX_DAYS, projectedIncome, projectedWages, rumRation } from '../game';
import { Icon } from './Icons';

interface Props {
  game: GameState;
  onSave: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onMenu: () => void;
}

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="meter" aria-hidden>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function TopBar({ game, onSave, onSettings, onHelp, onMenu }: Props) {
  const r = game.res;
  const net = projectedIncome(game) - projectedWages(game);
  const c = game.clocks;
  const warning = c.hurricanePhase === 'warning';
  const blockade = isBlockaded(game);
  return (
    <header className="topbar">
      <button className="brand" onClick={onMenu} title="Main menu">
        <Icon name="skull" size={34} color="#e8d9b5" />
        <div>
          <div className="brand-title">NASSAU</div>
          <div className="brand-sub">
            Pirate Republic · 1718 · Day {game.day}/{MAX_DAYS}
          </div>
        </div>
      </button>

      <div className="stat" title="Doubloons. Projected net per day after wages.">
        <Icon name="coin" size={26} color="#e0b84a" />
        <div>
          <div className="stat-val">{r.doubloons.toLocaleString()}</div>
          <div className={`stat-sub ${net >= 0 ? 'pos' : 'neg'}`}>
            Doubloons · {net >= 0 ? '+' : ''}
            {net}/day
          </div>
        </div>
      </div>

      <div className="stat" title={`Rum stores. The crew drinks ${rumRation(game)} a day; storms drink far more.`}>
        <Icon name="barrel" size={26} color="#b07a44" />
        <div>
          <div className={`stat-val ${r.rum < 25 ? 'neg' : ''}`}>{r.rum}</div>
          <div className="stat-sub">Rum · −{rumRation(game)}/day</div>
        </div>
      </div>

      <div className="stat" title="Crew. More hands means more sailors in a fight, and higher wages.">
        <Icon name="crew" size={26} color="#9fd8d0" />
        <div>
          <div className="stat-val">{r.crew}</div>
          <div className="stat-sub">Crew</div>
        </div>
      </div>

      <div className="stat wide" title="Morale. At 0 the crew mutinies.">
        <Icon name="heart" size={24} color={r.morale < 30 ? '#e05a4a' : '#2bb3a3'} />
        <div>
          <div className={`stat-val ${r.morale < 30 ? 'neg' : ''}`}>{r.morale}</div>
          <Meter value={r.morale} color={r.morale < 30 ? '#b8342c' : '#2bb3a3'} />
          <div className="stat-sub">Morale</div>
        </div>
      </div>

      <div className="stat wide" title="Infamy (red) vs Pardon progress (gold). Two roads out of Nassau.">
        <div className="tracks">
          <div className="track-row">
            <span>Infamy</span>
            <Meter value={r.infamy} color="#b8342c" />
            <b>{r.infamy}</b>
          </div>
          <div className="track-row">
            <span>Pardon</span>
            <Meter value={r.pardon} color="#c9a24a" />
            <b>{r.pardon}%</b>
          </div>
          <div className="track-row">
            <span>Heat</span>
            <Meter value={globalHeat(game)} color="#d0703a" />
            <b>{globalHeat(game)}</b>
          </div>
        </div>
      </div>

      <div className={`clock ${warning ? 'alarm storm' : ''}`} title="Hurricane clock">
        <Icon name="storm" size={30} color={warning ? '#e0905a' : '#8a7a68'} />
        <div>
          <div className="clock-title">{warning ? 'HURRICANE WARNING' : 'Barometer'}</div>
          <div className="clock-sub">{warning ? `Approaching ESE · ${c.hurricaneHours}h` : c.flotsamDays > 0 ? 'Flotsam on the reef' : 'Steady, for now'}</div>
        </div>
      </div>

      <div className={`clock ${blockade ? 'alarm navy' : ''}`} title="Blockade clock: navy alert rises with heat and infamy. At 100%, blockade.">
        <Icon name="ship" size={28} color={blockade ? '#a9c3ea' : '#6a7a90'} />
        <div>
          <div className="clock-title">{blockade ? 'BLOCKADE' : 'Navy Alert'}</div>
          {blockade ? (
            <div className="clock-sub">{c.blockadeDays} days · smuggle to live</div>
          ) : (
            <>
              <Meter value={c.navyAlert} color={c.navyAlert > 70 ? '#e05a4a' : '#5b7fb5'} />
              <div className="clock-sub">{Math.round(c.navyAlert)}% to blockade</div>
            </>
          )}
        </div>
      </div>

      <div className="top-buttons">
        <button className="round" onClick={onSave} title="Save game" aria-label="Save game">
          <Icon name="save" size={18} />
        </button>
        <button className="round" onClick={onHelp} title="How to play" aria-label="How to play">
          <Icon name="help" size={18} />
        </button>
        <button className="round" onClick={onSettings} title="Settings" aria-label="Settings">
          <Icon name="gear" size={18} />
        </button>
      </div>
    </header>
  );
}
