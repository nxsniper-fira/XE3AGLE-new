/** Central state manager — offline-first localStorage + multi-account isolation */

import { DEFAULT_STATE, STAGES, DEFAULT_RISK, createAccountBag } from './constants.js';
import { updateEquity, peakEquity, todayISO } from './risk.js';

const STORAGE_KEY = 'xe3agle_state_v2';
const STORAGE_KEY_LEGACY = 'xe3agle_state_v1';
const BACKUP_KEY = 'xe3agle_backup_v2';
const AUTH_KEY = 'xe3agle_auth';

let _state = null;
let _listeners = [];
let _cloudVersion = 0;

export function getState() {
  if (!_state) _state = loadLocal();
  return _state;
}

/** Active account bag (isolated trades / equity / workflow) */
export function getActiveAccount() {
  const s = getState();
  const id = s.activeAccountId || 'main';
  if (!s.accounts[id]) {
    // Fallback: ensure main exists
    s.accounts.main = s.accounts.main || createAccountBag({ id: 'main', name: 'Main', type: 'MAIN' });
    s.activeAccountId = 'main';
    return s.accounts.main;
  }
  return s.accounts[id];
}

/**
 * Patch fields on the active account and recompute equity when trades/risk change.
 * Also mirrors a flat view on root for legacy callers (preparation, trades, etc.).
 */
export function patchActive(partial, { silent = false } = {}) {
  const s = getState();
  const id = s.activeAccountId || 'main';
  const prev = s.accounts[id] || createAccountBag({ id });
  const next = { ...prev, ...partial };

  if (partial.trades !== undefined || partial.risk !== undefined || partial.startingBalance !== undefined) {
    if (partial.startingBalance !== undefined) {
      next.startingBalance = Number(partial.startingBalance) || next.startingBalance;
      next.risk = { ...(next.risk || DEFAULT_RISK), startingBalance: next.startingBalance };
    }
    const start = next.risk?.startingBalance ?? next.startingBalance ?? DEFAULT_RISK.startingBalance;
    next.equity = updateEquity(start, next.trades || []);
    next.peakEquity = peakEquity(start, next.trades || []);
  }

  const accounts = { ...s.accounts, [id]: next };
  _state = {
    ...s,
    accounts,
    clientModifiedAt: new Date().toISOString(),
  };
  // Flat mirror for compatibility with older UI code paths
  mirrorActiveToRoot(_state);
  saveLocal(_state);
  if (!silent) notify();
  return _state;
}

/** Root-level setState — global prefs or bulk; account-scoped keys go to active account */
export function setState(partial, { silent = false } = {}) {
  const prev = getState();
  const accountKeys = [
    'preparation', 'analysis', 'activeTrade', 'pendingReview', 'trades',
    'psychology', 'lastPrepDate', 'stage', 'equity', 'peakEquity', 'risk',
    'startingBalance',
  ];
  const globalPartial = {};
  const activePartial = {};
  for (const [k, v] of Object.entries(partial || {})) {
    if (accountKeys.includes(k)) activePartial[k] = v;
    else globalPartial[k] = v;
  }

  if (Object.keys(activePartial).length) {
    // Apply global first if any, then active
    if (Object.keys(globalPartial).length) {
      _state = {
        ...prev,
        ...globalPartial,
        clientModifiedAt: new Date().toISOString(),
      };
      mirrorActiveToRoot(_state);
      saveLocal(_state);
    }
    return patchActive(activePartial, { silent });
  }

  _state = {
    ...prev,
    ...globalPartial,
    clientModifiedAt: new Date().toISOString(),
  };
  mirrorActiveToRoot(_state);
  saveLocal(_state);
  if (!silent) notify();
  return _state;
}

function mirrorActiveToRoot(state) {
  const id = state.activeAccountId || 'main';
  const a = state.accounts?.[id];
  if (!a) return;
  state.preparation = a.preparation;
  state.analysis = a.analysis;
  state.activeTrade = a.activeTrade;
  state.pendingReview = a.pendingReview;
  state.trades = a.trades || [];
  state.psychology = a.psychology || { reflections: [], eodReviews: [] };
  state.lastPrepDate = a.lastPrepDate;
  state.stage = a.stage || STAGES.HOME;
  state.equity = a.equity;
  state.peakEquity = a.peakEquity;
  state.risk = a.risk || { ...DEFAULT_RISK, startingBalance: a.startingBalance };
}

export function subscribe(fn) {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

function notify() {
  const s = getState();
  _listeners.forEach((fn) => {
    try {
      fn(s);
    } catch (e) {
      console.error('State listener error', e);
    }
  });
}

export function loadLocal() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (!raw) return finalize(DEFAULT_STATE());
    const parsed = JSON.parse(raw);
    return finalize(migrate(parsed));
  } catch (e) {
    console.warn('Corrupt local state, trying backup', e);
    try {
      const bak = localStorage.getItem(BACKUP_KEY);
      if (bak) return finalize(migrate(JSON.parse(bak)));
    } catch (_) {}
    return finalize(DEFAULT_STATE());
  }
}

function saveLocal(state) {
  try {
    const prev = localStorage.getItem(STORAGE_KEY);
    if (prev) localStorage.setItem(BACKUP_KEY, prev);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('localStorage save failed', e);
  }
}

/** Migrate v1 flat state → v2 multi-account bags */
export function migrate(s) {
  const base = DEFAULT_STATE();
  if (!s || typeof s !== 'object') return base;

  // Already v2-ish
  if (s.accounts && typeof s.accounts === 'object') {
    const accounts = {};
    for (const [id, raw] of Object.entries(s.accounts)) {
      accounts[id] = normalizeAccount(id, raw, s);
    }
    if (!Object.keys(accounts).length) {
      accounts.main = createAccountBag({ id: 'main', name: 'Main', type: 'MAIN' });
    }
    const activeAccountId = accounts[s.activeAccountId] ? s.activeAccountId : Object.keys(accounts)[0];
    const out = {
      ...base,
      ...s,
      accounts,
      activeAccountId,
      hideBalance: !!s.hideBalance,
      theme: s.theme === 'blue' ? 'blue' : 'black',
      risk: undefined, // not at root in v2
    };
    delete out.risk;
    mirrorActiveToRoot(out);
    return out;
  }

  // v1 flat → move into main
  const main = createAccountBag({
    id: 'main',
    name: (s.accounts && s.accounts.main && s.accounts.main.name) || 'Main',
    type: 'MAIN',
    startingBalance: s.risk?.startingBalance ?? DEFAULT_RISK.startingBalance,
  });
  main.risk = { ...DEFAULT_RISK, ...(s.risk || {}) };
  main.startingBalance = main.risk.startingBalance;
  main.trades = (Array.isArray(s.trades) ? s.trades : []).map((t) => ({
    ...t,
    accountId: t.accountId || 'main',
  }));
  main.preparation = s.preparation || null;
  main.analysis = s.analysis || null;
  main.activeTrade = s.activeTrade || null;
  main.pendingReview = s.pendingReview || null;
  main.psychology = s.psychology || { reflections: [], eodReviews: [] };
  main.lastPrepDate = s.lastPrepDate || null;
  main.stage = s.stage || STAGES.HOME;
  main.equity = updateEquity(main.startingBalance, main.trades);
  main.peakEquity = peakEquity(main.startingBalance, main.trades);

  // Preserve extra account metadata from v1 if any
  const accounts = { main };
  if (s.accounts && typeof s.accounts === 'object') {
    for (const [id, meta] of Object.entries(s.accounts)) {
      if (id === 'main') {
        accounts.main.name = meta.name || accounts.main.name;
        accounts.main.type = (meta.type || 'MAIN').toString().toUpperCase();
      } else if (!accounts[id]) {
        accounts[id] = createAccountBag({
          id,
          name: meta.name || id,
          type: meta.type || 'PERSONAL',
        });
      }
    }
  }

  const out = {
    ...base,
    accounts,
    activeAccountId: accounts[s.activeAccountId] ? s.activeAccountId : 'main',
    hideBalance: !!s.hideBalance,
    theme: s.theme === 'blue' ? 'blue' : 'black',
    timezone: s.timezone || base.timezone,
    sessions: s.sessions || base.sessions,
    clientModifiedAt: s.clientModifiedAt || null,
    version: (s.version || 1) + 1,
  };
  mirrorActiveToRoot(out);
  return out;
}

function normalizeAccount(id, raw, root) {
  if (!raw || typeof raw !== 'object') return createAccountBag({ id });
  // If bag already has trades array, treat as full account
  if (Array.isArray(raw.trades) || raw.risk || raw.startingBalance != null) {
    const bal = Number(raw.startingBalance ?? raw.risk?.startingBalance) || DEFAULT_RISK.startingBalance;
    const trades = Array.isArray(raw.trades) ? raw.trades : [];
    const risk = { ...DEFAULT_RISK, ...(raw.risk || {}), startingBalance: bal };
    return {
      ...createAccountBag({ id, name: raw.name, type: raw.type, startingBalance: bal }),
      ...raw,
      id,
      name: (raw.name && String(raw.name).trim()) || id,
      type: (raw.type || 'PERSONAL').toString().toUpperCase(),
      startingBalance: bal,
      risk,
      trades,
      equity: updateEquity(bal, trades),
      peakEquity: peakEquity(bal, trades),
      psychology: raw.psychology || { reflections: [], eodReviews: [] },
    };
  }
  // Metadata-only from old schema — pull shared trades filtered by accountId
  const bal = Number(raw.startingBalance) || DEFAULT_RISK.startingBalance;
  const allTrades = Array.isArray(root.trades) ? root.trades : [];
  const trades = allTrades.filter((t) => (t.accountId || 'main') === id);
  const bag = createAccountBag({
    id,
    name: raw.name || id,
    type: raw.type || 'PERSONAL',
    startingBalance: bal,
    currency: raw.currency,
    brokerLabel: raw.brokerLabel,
    archived: raw.archived,
  });
  bag.trades = trades;
  bag.equity = updateEquity(bal, trades);
  bag.peakEquity = peakEquity(bal, trades);
  if (id === (root.activeAccountId || 'main')) {
    bag.preparation = root.preparation || null;
    bag.analysis = root.analysis || null;
    bag.activeTrade = root.activeTrade || null;
    bag.pendingReview = root.pendingReview || null;
    bag.stage = root.stage || STAGES.HOME;
    bag.lastPrepDate = root.lastPrepDate || null;
    bag.psychology = root.psychology || bag.psychology;
    bag.risk = { ...DEFAULT_RISK, ...(root.risk || {}), startingBalance: bal };
  }
  return bag;
}

function finalize(state) {
  return ensureDayReset(state);
}

/** New day resets prep/analysis on active account if no open trade */
export function ensureDayReset(state) {
  const today = todayISO();
  const id = state.activeAccountId || 'main';
  const a = state.accounts?.[id];
  if (!a) return state;
  if (a.lastPrepDate && a.lastPrepDate !== today && !a.activeTrade && !a.pendingReview) {
    const next = {
      ...a,
      preparation: null,
      analysis: null,
      lastPrepDate: null,
      stage:
        a.stage === STAGES.PREPARE || a.stage === STAGES.ANALYSIS || a.stage === STAGES.PRETRADE
          ? STAGES.HOME
          : a.stage,
    };
    state = {
      ...state,
      accounts: { ...state.accounts, [id]: next },
    };
    mirrorActiveToRoot(state);
  }
  return state;
}

// --- Account CRUD ---

export function listAccounts({ includeArchived = false } = {}) {
  const s = getState();
  return Object.values(s.accounts || {}).filter((a) => includeArchived || !a.archived);
}

export function createAccount({ name, type = 'PERSONAL', startingBalance, currency, brokerLabel }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Account name is required');
  const id = 'acct_' + Date.now();
  const bag = createAccountBag({
    id,
    name: trimmed,
    type,
    startingBalance: startingBalance != null ? Number(startingBalance) : DEFAULT_RISK.startingBalance,
    currency,
    brokerLabel,
  });
  const s = getState();
  setState({
    accounts: { ...s.accounts, [id]: bag },
    activeAccountId: id,
  });
  return bag;
}

export function switchAccount(accountId) {
  const s = getState();
  if (!s.accounts[accountId]) throw new Error('Account not found');
  if (s.accounts[accountId].archived) throw new Error('Account is archived');
  _state = {
    ...s,
    activeAccountId: accountId,
    clientModifiedAt: new Date().toISOString(),
  };
  mirrorActiveToRoot(_state);
  _state = ensureDayReset(_state);
  saveLocal(_state);
  notify();
  return _state;
}

export function renameAccount(accountId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Account name is required');
  const s = getState();
  const a = s.accounts[accountId];
  if (!a) throw new Error('Account not found');
  setState({
    accounts: { ...s.accounts, [accountId]: { ...a, name: trimmed } },
  });
}

export function archiveAccount(accountId) {
  const s = getState();
  if (accountId === 'main') throw new Error('Cannot archive Main');
  const a = s.accounts[accountId];
  if (!a) throw new Error('Account not found');
  const accounts = { ...s.accounts, [accountId]: { ...a, archived: true } };
  let activeAccountId = s.activeAccountId;
  if (activeAccountId === accountId) {
    activeAccountId = 'main';
  }
  setState({ accounts, activeAccountId });
}

export function updateAccountMeta(accountId, { name, type, startingBalance, currency, brokerLabel }) {
  const s = getState();
  const a = s.accounts[accountId];
  if (!a) throw new Error('Account not found');
  const next = { ...a };
  if (name != null) {
    const t = String(name).trim();
    if (!t) throw new Error('Account name is required');
    next.name = t;
  }
  if (type != null) next.type = String(type).toUpperCase();
  if (currency != null) next.currency = currency;
  if (brokerLabel != null) next.brokerLabel = brokerLabel;
  if (startingBalance != null) {
    next.startingBalance = Number(startingBalance) || next.startingBalance;
    next.risk = { ...next.risk, startingBalance: next.startingBalance };
    next.equity = updateEquity(next.startingBalance, next.trades || []);
    next.peakEquity = peakEquity(next.startingBalance, next.trades || []);
  }
  const accounts = { ...s.accounts, [accountId]: next };
  setState({ accounts });
  if (accountId === s.activeAccountId) {
    mirrorActiveToRoot(getState());
    saveLocal(getState());
  }
}

// --- Auth ---
export function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(auth) {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  else localStorage.removeItem(AUTH_KEY);
}

export function clearAllLocal() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY_LEGACY);
  localStorage.removeItem(BACKUP_KEY);
  _state = DEFAULT_STATE();
  mirrorActiveToRoot(_state);
  notify();
}

export function replaceState(fullState) {
  _state = migrate(fullState);
  saveLocal(_state);
  notify();
  return _state;
}

export function getCloudVersion() {
  return _cloudVersion;
}

export function setCloudVersion(v) {
  _cloudVersion = v;
}

export function exportStateJSON() {
  return JSON.stringify(getState(), null, 2);
}

export function importStateJSON(json) {
  return replaceState(JSON.parse(json));
}

/** Format money respecting hideBalance */
export function formatMoney(n, hideBalance) {
  if (hideBalance) return '••••';
  if (n == null || Number.isNaN(Number(n))) return '—';
  return (
    '$' +
    Number(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
