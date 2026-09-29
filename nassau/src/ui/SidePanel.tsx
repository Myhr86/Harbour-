import type { DistrictId, GameState } from '../game';
import { districtIncome, DISTRICTS_TO_WIN, HOLD_DAYS_TO_WIN, KING_DAWNS, playerDistricts } from '../game';
import { DISTRICTS } from '../game/content/districts';
import { BUILDINGS } from '../game/content/buildings';
import { FACTIONS, RIVALS } from '../game/content/factions';
import { BUILDING_ICON, FACTION_ICON, Icon } from './Icons';

export function DistrictCard({ game, id }: { game: GameState; id: DistrictId }) {
  const d = DISTRICTS[id];
  const st = game.districts[id];
  const f = FACTIONS[st.owner];
  const inc = st.owner === 'player' ? districtIncome(game, id) : null;
  return (
    <section className="district-card" style={{ borderColor: f.color }}>
      <div className="dc-head">
        <Icon name={FACTION_ICON[st.owner]} size={30} color={f.color} />
        <div>
          <h3>{d.name}</h3>
          <div className="dc-tag">{d.tagline}</div>
        </div>
      </div>
      <p className="dc-blurb">{d.blurb}</p>
      <dl className="dc-stats">
        <dt>Held by</dt>
        <dd style={{ color: f.ink }}>{st.owner === 'player' ? game.crewName : f.name}</dd>
        <dt>Income</dt>
        <dd>{inc !== null ? `${inc}/day${st.lockedDays ? ` (sacked ${st.lockedDays}d)` : ''}` : `~${d.baseIncome}/day`}</dd>
        <dt>Heat</dt>
        <dd className={st.heat > 60 ? 'neg' : ''}>{st.heat}</dd>
        <dt>Fortification</dt>
        <dd>
          {'■'.repeat(st.fort)}
          <span className="off">{'■'.repeat(5 - st.fort)}</span>
        </dd>
        {st.battened && (
          <>
            <dt>Storm</dt>
            <dd>Battened down</dd>
          </>
        )}
      </dl>
      <div className="dc-slots">
        {st.slots.map((sl, i) =>
          sl ? (
            <div key={i} className={`slot ${sl.damaged ? 'damaged' : ''}`} title={`${BUILDINGS[sl.id].blurb}\n${BUILDINGS[sl.id].effect}`}>
              <Icon name={BUILDING_ICON[sl.id]} size={18} />
              <span>
                {BUILDINGS[sl.id].name}
                {sl.damaged ? ' (damaged)' : ''}
              </span>
            </div>
          ) : (
            <div key={i} className="slot empty">
              Empty lot
            </div>
          ),
        )}
      </div>
      <div className="dc-adj">Borders: {d.adj.map((a) => DISTRICTS[a].name).join(', ')}</div>
    </section>
  );
}

export function Factions({ game }: { game: GameState }) {
  const mine = playerDistricts(game).length;
  return (
    <section className="factions">
      <h2>Objectives</h2>
      <ul className="objectives">
        <li className={mine >= DISTRICTS_TO_WIN ? 'active' : ''}>
          Hold {DISTRICTS_TO_WIN} of 6 districts for {KING_DAWNS} dawns{' '}
          <b>
            {mine}/{DISTRICTS_TO_WIN}
            {game.kingDays > 0 ? ` · ${game.kingDays}/${KING_DAWNS}` : ''}
          </b>
        </li>
        <li className={game.holdDays > 0 ? 'active' : ''}>
          Hold Prize Court + Shipyard <b>{game.holdDays}/{HOLD_DAYS_TO_WIN}d</b>
        </li>
        <li className={game.res.pardon >= 50 ? 'active' : ''}>
          Earn the King’s pardon <b>{game.res.pardon}%</b>
        </li>
        {game.companyDocksDays > 0 && (
          <li className="danger">
            Company occupies the Docks <b>{game.companyDocksDays}/3</b>
          </li>
        )}
        {game.bankruptDays > 0 && (
          <li className="danger">
            Wages unpaid <b>{game.bankruptDays}/3</b>
          </li>
        )}
      </ul>
      <h2>Rivals</h2>
      {RIVALS.map((fid) => {
        const f = game.factions[fid];
        const def = FACTIONS[fid];
        const held = Object.values(game.districts).filter((d) => d.owner === fid).length;
        return (
          <div key={fid} className="faction" title={def.blurb}>
            <Icon name={FACTION_ICON[fid]} size={24} color={def.color} />
            <div className="f-body">
              <div className="f-name" style={{ color: def.ink }}>
                {def.name}
                {f.truceDays > 0 && <span className="chip ready">Truce {f.truceDays}d</span>}
              </div>
              <div className="f-row">
                <span>Strength {f.strength}</span>
                <span>Districts {held}</span>
                <span className={f.attitude < -20 ? 'neg' : f.attitude > 20 ? 'pos' : ''}>
                  {f.attitude < -40 ? 'Hostile' : f.attitude < -10 ? 'Wary' : f.attitude < 20 ? 'Neutral' : f.attitude < 50 ? 'Friendly' : 'Allied'}
                </span>
              </div>
              {f.lastMove && <div className="f-move">Last: {f.lastMove}</div>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function LogPanel({ game }: { game: GameState }) {
  const lines = game.log.slice(-40).reverse();
  return (
    <section className="log" aria-live="polite">
      <h2>Ship’s Log</h2>
      <ol>
        {lines.map((l, i) => (
          <li key={i} className={l.tone}>
            <span className="log-day">D{l.day}</span> {l.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
