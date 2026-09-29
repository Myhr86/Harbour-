import { useCallback, useEffect, useRef, useState } from 'react';
import type { DistrictId, GameState, LtId, OrderParams, Settings } from './game';
import {
  applyCombatResult,
  cancelPendingCombat,
  chooseEvent,
  dismissReport,
  endDay,
  issueOrder,
  loadGame,
  loadSettings,
  newGame,
  saveGame,
  saveSettings,
  seedFromString,
  startCombat,
} from './game';
import { setAudio, play } from './audio';
import { TopBar } from './ui/TopBar';
import { LtPanel } from './ui/LtPanel';
import { MapView } from './ui/MapView';
import { DistrictCard, Factions, LogPanel } from './ui/SidePanel';
import { OrderBar } from './ui/OrderBar';
import { AftermathModal, EventModal, HelpModal, ReportModal, SettingsModal } from './ui/Modals';
import { CombatPrep, CombatView } from './ui/CombatScreen';
import { EndingScreen, TitleScreen } from './ui/Screens';

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const ref = useRef<GameState | null>(null);
  ref.current = game;
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selected, setSelected] = useState<DistrictId | null>('docks');
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const [aftermath, setAftermath] = useState<{ lines: string[]; won: boolean } | null>(null);

  useEffect(() => {
    setAudio(settings);
    saveSettings(settings);
    document.documentElement.classList.toggle('reduce-flash', settings.reduceFlash);
  }, [settings]);

  /** Apply a rules mutation to a fresh copy of the state. */
  const mutate = useCallback((fn: (s: GameState) => void) => {
    const cur = ref.current;
    if (!cur) return;
    const next = structuredClone(cur);
    fn(next);
    ref.current = next;
    setGame(next);
  }, []);

  const flash = (text: string, good: boolean) => {
    setToast({ text, good });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3800);
  };

  const onNew = (crew: string, seedText: string) => {
    const seed = seedText.trim() ? seedFromString(seedText.trim()) : (Math.random() * 2 ** 32) >>> 0;
    const s = newGame(seed, crew);
    saveGame(s, 'auto');
    setGame(s);
    setSelected('docks');
    play('bell');
  };

  const onLoad = (slot: 'auto' | 'manual') => {
    const s = loadGame(slot);
    if (s) {
      setGame(s);
      play('bell');
    }
  };

  const onEndDay = useCallback(() => {
    mutate((s) => endDay(s));
    const s = ref.current;
    if (!s) return;
    if (s.report?.storm) play('thunder');
    else play('bell');
    if (!s.ending) saveGame(s, 'auto');
  }, [mutate]);

  const onIssue = (p: OrderParams) => {
    let res = { ok: false, text: '' };
    mutate((s) => {
      res = issueOrder(s, p);
    });
    flash(res.text, res.ok);
    if (res.ok) play(p.kind === 'smuggle' || p.kind === 'wreck' ? 'coins' : 'click');
    else play('miss');
  };

  const blocked = !game || !!game.report || game.pendingEvents.length > 0 || !!game.pendingCombat || !!game.combat || !!game.ending;

  // Keyboard: E ends the day.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'e' || e.key === 'E') && !blocked && !showHelp && !showSettings) onEndDay();
      if (e.key === 'Escape') {
        setShowHelp(false);
        setShowSettings(false);
      }
      if (e.key === '?') setShowHelp(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocked, onEndDay, showHelp, showSettings]);

  const settingsModal = showSettings && <SettingsModal settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />;

  if (!game) {
    return (
      <>
        <TitleScreen onNew={onNew} onLoad={onLoad} settings={settings} onSettings={() => setShowSettings(true)} />
        {settingsModal}
      </>
    );
  }

  if (game.ending && !game.combat) {
    return <EndingScreen game={game} onNew={() => setGame(null)} />;
  }

  if (game.combat) {
    return (
      <>
        <CombatView
          game={game}
          act={mutate}
          reduceFlash={settings.reduceFlash}
          onFinish={() => {
            let sum = { lines: [] as string[], result: 'loss' as string };
            mutate((s) => {
              sum = applyCombatResult(s);
            });
            setAftermath({ lines: sum.lines, won: sum.result === 'win' });
          }}
        />
        {settingsModal}
      </>
    );
  }

  return (
    <div className="game">
      <TopBar
        game={game}
        onMenu={() => {
          if (window.confirm('Return to the title screen? Unsaved progress since dawn will be lost.')) setGame(null);
        }}
        onSave={() => flash(saveGame(game, 'manual') ? 'Game saved to the ship’s log.' : 'Could not save (storage unavailable).', true)}
        onSettings={() => setShowSettings(true)}
        onHelp={() => setShowHelp(true)}
      />
      <div className="main">
        <LtPanel game={game} picking={false} eligible={() => ({ ok: false, pct: null })} chosen={null} onPick={(_id: LtId) => undefined} />
        <div className="map-wrap">
          <MapView game={game} selected={selected} onSelect={(d) => setSelected(d)} reduceFlash={settings.reduceFlash} />
          {toast && <div className={`toast ${toast.good ? 'good' : 'bad'}`}>{toast.text}</div>}
        </div>
        <aside className="panel right">
          {selected && <DistrictCard game={game} id={selected} />}
          <Factions game={game} />
          <LogPanel game={game} />
        </aside>
      </div>
      <OrderBar game={game} district={selected} onIssue={onIssue} onEndDay={onEndDay} blocked={blocked} />

      {game.report && <ReportModal game={game} reduceFlash={settings.reduceFlash} onClose={() => mutate((s) => dismissReport(s))} />}
      {!game.report && game.pendingEvents.length > 0 && !game.pendingCombat && (
        <EventModal
          game={game}
          reduceFlash={settings.reduceFlash}
          onChoose={(i) => {
            mutate((s) => chooseEvent(s, i));
            play('click');
          }}
        />
      )}
      {!game.report && game.pendingCombat && (
        <CombatPrep
          game={game}
          onFight={(lts) => {
            mutate((s) => {
              startCombat(s, s.pendingCombat!, lts);
              s.pendingCombat = null;
            });
            play('drum');
          }}
          onBackOff={() => mutate((s) => cancelPendingCombat(s))}
        />
      )}
      {aftermath && <AftermathModal lines={aftermath.lines} won={aftermath.won} onClose={() => setAftermath(null)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {settingsModal}
    </div>
  );
}
