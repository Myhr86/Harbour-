// Public surface of the rules engine. The UI imports from here only.
export * from './types';
export { newGame } from './state';
export { endDay, chooseEvent, dismissReport, projectedIncome, projectedWages, districtIncome, rumRation, hurricaneRumCost } from './day';
export {
  issueOrder,
  orderOptions,
  orderChance,
  parleyOptions,
  buyCost,
  buildCost,
  repairCost,
  ORDER_LABELS,
  type OrderParams,
  type OrderInfo,
} from './actions';
export {
  startCombat,
  eligibleFighters,
  sailorCount,
  activeUnit,
  reachable,
  actionsAgainst,
  doMove,
  doMelee,
  doPike,
  doShove,
  doBrace,
  doPistol,
  doRally,
  doParley,
  endTurn,
  aiStep,
  retreat,
  living,
  tile,
  cheb,
  COSTS,
  AP_PER_TURN,
  ROUND_LIMIT,
  type CombatAction,
} from './combat';
export { applyCombatResult, cancelPendingCombat, type CombatSummary } from './outcomes';
export { ENDINGS, checkEnding, HOLD_DAYS_TO_WIN, DISTRICTS_TO_WIN, KING_DAWNS } from './endings';
export { saveGame, loadGame, saveSummary, loadSettings, saveSettings, type Settings } from './save';
export { globalHeat, playerDistricts, ltShort, ltName, isBlockaded, MAX_DAYS } from './helpers';
export { seedFromString } from './rng';
