import { useEffect, useMemo, useState } from 'react';
import type { BuildingId, DistrictId, GameState, LtId, OrderKind, ParleyKind } from '../game';
import { buildCost, buyCost, orderChance, orderOptions, parleyOptions, repairCost } from '../game';
import { DISTRICTS } from '../game/content/districts';
import { BUILDINGS, BUILDING_ORDER } from '../game/content/buildings';
import { LIEUTENANTS, LT_ORDER } from '../game/content/lieutenants';
import { BUILDING_ICON, Icon, ORDER_ICON } from './Icons';
import { Portrait } from './Portrait';

interface Props {
  game: GameState;
  district: DistrictId | null;
  onIssue: (p: { kind: OrderKind; district: DistrictId; lt: LtId; building?: BuildingId; parley?: ParleyKind }) => void;
  onEndDay: () => void;
  blocked: boolean;
}

export function OrderBar({ game, district, onIssue, onEndDay, blocked }: Props) {
  const [kind, setKind] = useState<OrderKind | null>(null);
  const [lt, setLt] = useState<LtId | null>(null);
  const [building, setBuilding] = useState<BuildingId | null>(null);
  const [parley, setParley] = useState<ParleyKind | null>(null);

  useEffect(() => {
    setKind(null);
    setLt(null);
    setBuilding(null);
    setParley(null);
  }, [district, game.day]);

  const opts = district ? orderOptions(game, district) : [];
  const ready = LT_ORDER.filter((id) => game.lts[id].status === 'active' && !game.lts[id].orderedToday);
  const ordersLeft = ready.length;

  const parleys = useMemo(() => (district && kind === 'parley' ? parleyOptions(game, district) : []), [game, district, kind]);
  useEffect(() => {
    if (kind === 'parley' && !parley) {
      const first = parleys.find((p) => p.ok);
      if (first) setParley(first.kind);
    }
  }, [kind, parley, parleys]);

  const needsBuilding = kind === 'build';
  const needsParley = kind === 'parley';
  const complete = !!(district && kind && lt && (!needsBuilding || building) && (!needsParley || parley));

  const summary = (() => {
    if (!district || !kind || !lt) return null;
    const p = { kind, district, lt, building: building ?? undefined, parley: parley ?? undefined };
    const pct = orderChance(game, p);
    const bits: string[] = [];
    if (pct !== null) bits.push(`${pct}% chance`);
    if (kind === 'build' && building) bits.push(`costs ${buildCost(building, lt)}`);
    if (kind === 'parley' && parley === 'buy') bits.push(`price ${buyCost(game, district, lt)}`);
    if (kind === 'parley' && parley === 'navy') bits.push('costs 60');
    if (kind === 'repair') bits.push(`costs ${repairCost(game, district)}`);
    if (kind === 'muscle') bits.push(`${LIEUTENANTS[lt].name.split(' ').slice(-1)[0]} leads the brawl`);
    return bits.join(' · ');
  })();

  const confirm = () => {
    if (!complete || !district || !kind || !lt) return;
    onIssue({ kind, district, lt, building: building ?? undefined, parley: parley ?? undefined });
    setKind(null);
    setLt(null);
    setBuilding(null);
    setParley(null);
  };

  return (
    <footer className="orderbar">
      <div className="ap-box" title="Each ready lieutenant can lead one order per day.">
        <div className="ap-big">{ordersLeft}</div>
        <div className="ap-sub">orders left</div>
      </div>

      <div className="orders">
        {!district && <div className="hint big">Select a district on the map to give orders.</div>}
        {district && (
          <div className="order-cards" role="toolbar" aria-label={`Orders for ${DISTRICTS[district].name}`}>
            {opts.map((o) => (
              <button
                key={o.kind}
                className={`order-card ${kind === o.kind ? 'on' : ''}`}
                disabled={!o.ok || !ordersLeft || blocked}
                title={o.reason ?? o.hint}
                onClick={() => {
                  setKind(kind === o.kind ? null : o.kind);
                  setLt(null);
                  setBuilding(null);
                  setParley(null);
                }}
              >
                <Icon name={ORDER_ICON[o.kind]} size={30} />
                <span className="oc-label">{o.label}</span>
                <span className="oc-hint">{o.ok ? o.hint : o.reason}</span>
                <span className="oc-cost">{o.cost}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="endday">
        <button className="end-btn" onClick={onEndDay} disabled={blocked} title="End the day (E)">
          END DAY
          <Icon name="skull" size={30} color="#e8d9b5" />
        </button>
        <div className="endday-sub">
          Day {game.day} · press <kbd>E</kbd>
        </div>
      </div>

      {district && kind && (
        <div className="order-sheet" role="dialog" aria-label="Order details">
          <div className="os-head">
            <Icon name={ORDER_ICON[kind]} size={22} />
            <b>{opts.find((o) => o.kind === kind)?.label}</b> — {DISTRICTS[district].name}
            <button className="x" onClick={() => setKind(null)} aria-label="Cancel order">
              ×
            </button>
          </div>
          {needsParley && (
            <div className="os-row">
              {parleys.map((p) => (
                <button key={p.kind} className={`pill ${parley === p.kind ? 'on' : ''}`} disabled={!p.ok} title={p.reason} onClick={() => setParley(p.kind)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {needsBuilding && (
            <div className="os-row wrap">
              {BUILDING_ORDER.filter((b) => !game.districts[district].slots.some((sl) => sl?.id === b)).map((b) => {
                const cost = buildCost(b, lt ?? undefined);
                return (
                  <button
                    key={b}
                    className={`pill build ${building === b ? 'on' : ''}`}
                    disabled={game.res.doubloons < cost}
                    title={`${BUILDINGS[b].blurb}\n${BUILDINGS[b].effect}`}
                    onClick={() => setBuilding(b)}
                  >
                    <Icon name={BUILDING_ICON[b]} size={16} /> {BUILDINGS[b].name} <small>{cost}</small>
                    <em>{BUILDINGS[b].effect}</em>
                  </button>
                );
              })}
            </div>
          )}
          <div className="os-row">
            <span className="os-label">Who leads?</span>
            {ready.length === 0 && <span className="hint">Every officer has orders today.</span>}
            {ready.map((id) => {
              const pct = orderChance(game, { kind, district, lt: id, building: building ?? undefined, parley: parley ?? undefined });
              return (
                <button key={id} className={`lt-pick ${lt === id ? 'on' : ''}`} onClick={() => setLt(id)} title={LIEUTENANTS[id].specialty}>
                  <Portrait look={LIEUTENANTS[id].look} size={40} ring={lt === id ? '#f0d27a' : undefined} />
                  <span>{LIEUTENANTS[id].name.split(' ').slice(-1)[0]}</span>
                  {pct !== null && <b className={pct >= 60 ? 'pos' : pct < 40 ? 'neg' : ''}>{pct}%</b>}
                </button>
              );
            })}
          </div>
          <div className="os-foot">
            <span className="os-sum">{summary ?? 'Choose who leads the order.'}</span>
            <button className="primary" disabled={!complete} onClick={confirm}>
              {kind === 'muscle' ? 'To the fight!' : 'Give the order'}
            </button>
          </div>
        </div>
      )}
    </footer>
  );
}
