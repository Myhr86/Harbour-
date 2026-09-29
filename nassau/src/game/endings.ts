import type { EndingId, GameState } from './types';
import { MAX_DAYS, playerDistricts } from './helpers';

export const HOLD_DAYS_TO_WIN = 8;
export const DISTRICTS_TO_WIN = 4;
export const KING_DAWNS = 3;

export interface EndingDef {
  id: EndingId;
  title: string;
  subtitle: string;
  body: (s: GameState) => string;
}

export const ENDINGS: Record<EndingId, EndingDef> = {
  king: {
    id: 'king',
    title: 'Pirate King of the Docks',
    subtitle: 'Nassau answers to you.',
    body: (s) =>
      s.endingReason === 'admiralty'
        ? `For eight days running, every captured hull in Nassau has been careened in your shipyard and condemned in your prize court. The Company’s clerks now bring you their paperwork. The navy counts your ships through a spyglass and sends polite letters.\n\nYou never went back to sea. You didn’t need to. The sea comes to you.`
        : `Four districts fly your colours. Rents are paid in your taverns, cargo is weighed on your scales, and the harbourmaster counts badly on your behalf.\n\n${s.crewName} are the law in Nassau — for now. Somewhere offshore a frigate is reading about you. Let it read.`,
  },
  pardon: {
    id: 'pardon',
    title: 'Bought Pardon',
    subtitle: 'The King’s mercy, at a very reasonable price.',
    body: (s) =>
      `The Governor’s seal is pressed into red wax, and just like that, ${s.crewName} are honest merchants. The prize court calls it a “retroactive letter of marque.” The crew calls it a miracle.\n\n${s.lts.thorne.status === 'active' ? 'Father Thorne weeps at the signing, then asks if the pardon covers future sins. It does not.' : 'You wish Father Thorne had lived to see it.'} ${s.lts.dixon.status === 'active' ? 'Anne Dixon signs the articles of peace, then goes looking for a war somewhere else.' : ''}`,
  },
  washed: {
    id: 'washed',
    title: 'Washed Out',
    subtitle: 'The tide goes out. You go with it.',
    body: (s) => {
      const why: Record<string, string> = {
        mutiny: 'Morale hit rock bottom. The crew voted you off your own tavern, and the articles were very clear about it.',
        bankrupt: 'Three days without paying wages. In Nassau, a captain who cannot pay is just a man with a hat.',
        company: 'The Charter Company held the Docks for three days. By the fourth, it held everything else, including your debts.',
        season: 'The hurricane season ended, the Governor’s new men arrived, and nobody remembered your name.',
        landless: 'You lost your last street. A captain with no ground is just a passenger.',
      };
      return `${why[s.endingReason] ?? 'Nassau moved on without you.'}\n\nYou took a berth on a Charles Town sloop with one sea chest and a very good story. Nobody believed a word of it.`;
    },
  },
};

/** Sets s.ending if the game is decided. Safe to call any time. */
export function checkEnding(s: GameState): void {
  if (s.ending) return;
  const mine = playerDistricts(s);
  const end = (id: EndingId, reason: string) => {
    s.ending = id;
    s.endingReason = reason;
  };
  if (s.res.pardon >= 100) return end('pardon', 'pardon');
  if (s.kingDays >= KING_DAWNS) return end('king', 'districts');
  if (s.holdDays >= HOLD_DAYS_TO_WIN) return end('king', 'admiralty');
  if (s.res.morale <= 0) return end('washed', 'mutiny');
  if (s.bankruptDays >= 3) return end('washed', 'bankrupt');
  if (s.companyDocksDays >= 3) return end('washed', 'company');
  if (!mine.length && !s.pendingCombat && !s.combat) return end('washed', 'landless');
  if (s.day > MAX_DAYS) return end('washed', 'season');
}
