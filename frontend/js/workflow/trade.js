/** Trade routing, auto-advance, step completion — active-account scoped */

import { STAGES, NEXT_STAGE, REVIEW_QUESTIONS } from '../domain/constants.js';
import { getState, setState, getActiveAccount, patchActive } from '../domain/state.js';
import { canStartTrade, calcRR, calcRisk, todayISO } from '../domain/risk.js';
import { schedulePush } from '../services/sync.js';
import { toast } from '../ui/toast.js';

export function getCurrentStage() {
  return getActiveAccount().stage || STAGES.HOME;
}

export function goTo(stage) {
  patchActive({ stage });
  schedulePush();
  window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage } }));
}

export function advanceFrom(stage) {
  const next = NEXT_STAGE[stage] || STAGES.HOME;
  goTo(next);
  return next;
}

/** Correct next step for Trade tab */
export function resolveTradeStep() {
  const a = getActiveAccount();
  if (a.activeTrade) return STAGES.ACTIVE;
  if (a.pendingReview || a.stage === STAGES.REVIEW) return STAGES.REVIEW;
  if (!a.preparation?.accepted) return STAGES.PREPARE;
  if (!a.analysis?.complete) return STAGES.ANALYSIS;
  return STAGES.PRETRADE;
}

export function acceptRules(prepData) {
  const preparation = {
    ...prepData,
    accepted: true,
    acceptedAt: new Date().toISOString(),
  };
  patchActive({
    preparation,
    lastPrepDate: todayISO(),
    stage: STAGES.ANALYSIS,
  });
  schedulePush();
  toast('Rules accepted — proceed to Analysis');
  window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: STAGES.ANALYSIS } }));
}

export function saveAnalysis(data) {
  if (!data.bias || !data.direction || !data.entryModel) {
    toast('Bias, direction, and entry model are required', 'error');
    return false;
  }
  if (data.bias === 'Bullish' && data.direction !== 'LONG') {
    toast('Bullish bias requires LONG only', 'error');
    return false;
  }
  if (data.bias === 'Bearish' && data.direction !== 'SHORT') {
    toast('Bearish bias requires SHORT only', 'error');
    return false;
  }
  const entry = Number(data.entry);
  const sl = Number(data.sl);
  const tp = Number(data.tp);
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp)) {
    toast('Entry, SL, and TP are required', 'error');
    return false;
  }
  if (entry === sl) {
    toast('Stop must differ from entry', 'error');
    return false;
  }

  const a = getActiveAccount();
  const risk = a.risk || {};
  const rr = calcRR({ entry, sl, tp });
  const minRR = risk.minRR || 2;
  if (rr < minRR) {
    toast(`RR ${rr.toFixed(2)} is below minimum ${minRR}`, 'error');
    return false;
  }

  const equity = a.equity ?? risk.startingBalance ?? 10000;
  const { riskDollars, positionSize } = calcRisk({
    balance: equity,
    riskPct: risk.riskPerTradePct,
    entry,
    sl,
    pointValue: data.pointValue || 1,
  });

  const analysis = {
    ...data,
    entry,
    sl,
    tp,
    complete: true,
    rr,
    riskDollars,
    positionSize,
    savedAt: new Date().toISOString(),
  };
  patchActive({ analysis, stage: STAGES.PRETRADE });
  schedulePush();
  toast('Analysis saved — Pre-Trade Check');
  window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: STAGES.PRETRADE } }));
  return true;
}

export function startTrade() {
  const a = getActiveAccount();
  const gate = canStartTrade({
    preparation: a.preparation,
    analysis: a.analysis,
    activeTrade: a.activeTrade,
    risk: a.risk,
    trades: a.trades,
    equity: a.equity,
  });
  if (!gate.allowed) {
    toast(gate.reasons[0] || 'Cannot start trade', 'error');
    return { ok: false, reasons: gate.reasons };
  }
  const analysis = a.analysis;
  const activeTrade = {
    id: 't_' + Date.now(),
    accountId: a.id,
    openedAt: new Date().toISOString(),
    plannedAt: analysis.savedAt || new Date().toISOString(),
    bias: analysis.bias,
    direction: analysis.direction,
    entry: analysis.entry,
    sl: analysis.sl,
    tp: analysis.tp,
    pointValue: analysis.pointValue || 1,
    positionSize: analysis.positionSize,
    riskDollars: analysis.riskDollars,
    rr: analysis.rr,
    entryModel: analysis.entryModel,
    notes: analysis.notes || '',
    emotion: a.preparation?.mentalState,
    mentalState: a.preparation?.mentalState,
  };
  patchActive({ activeTrade, stage: STAGES.ACTIVE });
  schedulePush();
  toast('Trade started — stay disciplined');
  window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: STAGES.ACTIVE } }));
  return { ok: true };
}

export function closeTrade({ result, rMultiple, exitPrice }) {
  const a = getActiveAccount();
  if (!a.activeTrade) {
    toast('No active trade', 'error');
    return false;
  }
  const r = Number(rMultiple) || 0;
  const closed = {
    ...a.activeTrade,
    result,
    rMultiple: r,
    resultR: r,
    exitPrice: exitPrice != null ? Number(exitPrice) : null,
    closedAt: new Date().toISOString(),
    day: todayISO(),
    pl: r * (a.activeTrade.riskDollars || 0),
    resultPL: r * (a.activeTrade.riskDollars || 0),
  };
  patchActive({
    activeTrade: null,
    pendingReview: closed,
    stage: STAGES.REVIEW,
  });
  schedulePush();
  window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: STAGES.REVIEW } }));
  return true;
}

/**
 * Complete mandatory review — ONLY path that saves live trades to journal.
 */
export function completeReview({ answers, notes, tags }) {
  const a = getActiveAccount();
  const pending = a.pendingReview;
  if (!pending) {
    toast('No trade pending review', 'error');
    return false;
  }
  for (const q of REVIEW_QUESTIONS) {
    if (answers[q.id] !== true && answers[q.id] !== false) {
      toast(`Please answer: ${q.label}`, 'error');
      return false;
    }
  }

  const trade = {
    ...pending,
    accountId: a.id,
    day: pending.day || todayISO(),
    emotion: pending.emotion || pending.mentalState,
    resultR: pending.resultR ?? pending.rMultiple,
    resultPL: pending.resultPL ?? pending.pl,
    tags: Array.isArray(tags) ? tags : pending.tags || [],
    review: { answers, notes: notes || '', reviewedAt: new Date().toISOString() },
  };
  const trades = [...(a.trades || []), trade];

  patchActive({
    trades,
    pendingReview: null,
    stage: STAGES.JOURNAL,
    analysis: null,
  });
  schedulePush();
  toast('Trade saved to Journal');
  window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: STAGES.JOURNAL } }));
  return true;
}

export function getGateStatus() {
  const a = getActiveAccount();
  return canStartTrade({
    preparation: a.preparation,
    analysis: a.analysis,
    activeTrade: a.activeTrade,
    risk: a.risk,
    trades: a.trades,
    equity: a.equity,
  });
}

export function addManualTrade(data) {
  const a = getActiveAccount();
  const trade = {
    id: 'm_' + Date.now(),
    accountId: a.id,
    day: data.day || todayISO(),
    direction: data.direction,
    entry: Number(data.entry),
    sl: Number(data.sl),
    tp: Number(data.tp),
    entryModel: data.entryModel || 'Other',
    result: data.result,
    rMultiple: Number(data.rMultiple) || 0,
    resultR: Number(data.rMultiple) || 0,
    pl: Number(data.pl) || 0,
    resultPL: Number(data.pl) || 0,
    emotion: data.emotion || '',
    mentalState: data.emotion || '',
    notes: data.notes || '',
    tags: data.tags || [],
    plannedAt: data.plannedAt || new Date().toISOString(),
    closedAt: data.closedAt || new Date().toISOString(),
    review: data.review || { answers: {}, notes: '', reviewedAt: new Date().toISOString() },
    manual: true,
  };
  patchActive({ trades: [...(a.trades || []), trade] });
  schedulePush();
  return trade;
}

export function updateTrade(tradeId, patch) {
  const a = getActiveAccount();
  const trades = (a.trades || []).map((t) =>
    t.id === tradeId ? { ...t, ...patch, accountId: a.id } : t
  );
  patchActive({ trades });
  schedulePush();
}

export function deleteTrade(tradeId) {
  const a = getActiveAccount();
  const trades = (a.trades || []).filter((t) => t.id !== tradeId);
  patchActive({ trades });
  schedulePush();
}
