/** Workflow stages and defaults — single source of truth */

export const STAGES = {
  HOME: 'home',
  PREPARE: 'prepare',
  ANALYSIS: 'analysis',
  PRETRADE: 'pretrade',
  ACTIVE: 'active',
  REVIEW: 'review',
  JOURNAL: 'journal',
};

export const STAGE_ORDER = [
  STAGES.HOME,
  STAGES.PREPARE,
  STAGES.ANALYSIS,
  STAGES.PRETRADE,
  STAGES.ACTIVE,
  STAGES.REVIEW,
  STAGES.JOURNAL,
];

export const NEXT_STAGE = {
  [STAGES.HOME]: STAGES.PREPARE,
  [STAGES.PREPARE]: STAGES.ANALYSIS,
  [STAGES.ANALYSIS]: STAGES.PRETRADE,
  [STAGES.PRETRADE]: STAGES.ACTIVE,
  [STAGES.ACTIVE]: STAGES.REVIEW,
  [STAGES.REVIEW]: STAGES.JOURNAL,
  [STAGES.JOURNAL]: STAGES.HOME,
};

export const MENTAL_STATES = [
  'Calm', 'Focused', 'Patient', 'Confident',
  'Tired', 'Distracted', 'Frustrated', 'Angry', 'Greedy', 'Fearful',
];

export const HIGH_RISK_EMOTIONS = ['Angry', 'Greedy', 'Fearful', 'Frustrated', 'Tired', 'Distracted'];

export const BIASES = ['Bullish', 'Bearish', 'Neutral'];
export const DIRECTIONS = ['LONG', 'SHORT'];
export const ENTRY_MODELS = ['FVG', 'Order Block', 'OTE', 'Other'];
export const TRADE_RESULTS = ['WIN', 'LOSS', 'BREAKEVEN'];

export const REVIEW_QUESTIONS = [
  { id: 'followedSetup', label: 'Did I follow my setup?' },
  { id: 'respectedRisk', label: 'Did I respect my risk?' },
  { id: 'enteredPerPlan', label: 'Did I enter according to plan?' },
  { id: 'movedStop', label: 'Did I move my stop?' },
  { id: 'chased', label: 'Did I chase?' },
  { id: 'revenge', label: 'Did I revenge trade?' },
  { id: 'overstayed', label: 'Did I overstay?' },
  { id: 'exitedPerPlan', label: 'Did I exit according to plan?' },
];

/** Review answers that count as process breaks when YES (true) */
export const VIOLATION_YES_IDS = ['movedStop', 'chased', 'revenge', 'overstayed'];
/** Review answers that count as process breaks when NO (false) */
export const VIOLATION_NO_IDS = ['followedSetup', 'respectedRisk', 'enteredPerPlan', 'exitedPerPlan'];

export const DEFAULT_RISK = {
  startingBalance: 10000,
  riskPerTradePct: 0.5,
  dailyMaxLossPct: 1,
  dailyTargetR: 2,
  maxTradesPerDay: 3,
  maxConsecutiveLosses: 2,
  minRR: 2,
  timeWindowEnabled: false,
  timeWindowStart: '00:00',
  timeWindowEnd: '23:59',
};

export const ACCOUNT_TYPES = ['MAIN', 'FUNDED', 'PERSONAL', 'DEMO'];

export function createAccountBag({
  id = 'main',
  name = 'Main',
  type = 'MAIN',
  startingBalance = DEFAULT_RISK.startingBalance,
  currency = 'USD',
  brokerLabel = '',
  archived = false,
} = {}) {
  const bal = Number(startingBalance) || DEFAULT_RISK.startingBalance;
  return {
    id,
    name: String(name).trim() || 'Account',
    type: ACCOUNT_TYPES.includes(String(type).toUpperCase())
      ? String(type).toUpperCase()
      : 'PERSONAL',
    startingBalance: bal,
    currency: currency || 'USD',
    brokerLabel: brokerLabel || '',
    archived: !!archived,
    createdAt: new Date().toISOString(),
    risk: { ...DEFAULT_RISK, startingBalance: bal },
    equity: bal,
    peakEquity: bal,
    preparation: null,
    analysis: null,
    activeTrade: null,
    pendingReview: null,
    trades: [],
    psychology: { reflections: [], eodReviews: [] },
    lastPrepDate: null,
    stage: STAGES.HOME,
  };
}

export const DEFAULT_STATE = () => ({
  accounts: {
    main: createAccountBag({ id: 'main', name: 'Main', type: 'MAIN' }),
  },
  activeAccountId: 'main',
  hideBalance: false,
  theme: 'black',
  timezone: typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    : 'UTC',
  sessions: {
    london: { start: '07:00', end: '16:00' },
    ny: { start: '12:00', end: '21:00' },
    asia: { start: '00:00', end: '09:00' },
  },
  version: 1,
  clientModifiedAt: null,
});
