/** Risk math and trade gates */

import { HIGH_RISK_EMOTIONS, DEFAULT_RISK } from './constants.js';

export function calcRisk({ balance, riskPct, entry, sl, pointValue = 1 }) {
  const bal = Number(balance) || 0;
  const pct = Number(riskPct) || 0;
  const riskDollars = bal * (pct / 100);
  const e = Number(entry);
  const s = Number(sl);
  const pv = Number(pointValue) || 1;
  const stopDistance = Math.abs(e - s);
  if (!stopDistance || !Number.isFinite(stopDistance)) {
    return { riskDollars, positionSize: 0, stopDistance: 0 };
  }
  const positionSize = riskDollars / (stopDistance * pv);
  return {
    riskDollars: round2(riskDollars),
    positionSize: round4(positionSize),
    stopDistance: round6(stopDistance),
  };
}

export function calcRR({ entry, sl, tp }) {
  const risk = Math.abs(Number(entry) - Number(sl));
  const reward = Math.abs(Number(tp) - Number(entry));
  if (!risk || !Number.isFinite(risk)) return 0;
  return round2(reward / risk);
}

export function calcPL({ entry, exit, direction, positionSize, pointValue = 1 }) {
  const e = Number(entry);
  const x = Number(exit);
  const size = Number(positionSize) || 0;
  const pv = Number(pointValue) || 1;
  let diff = direction === 'LONG' ? x - e : e - x;
  return round2(diff * size * pv);
}

export function calcRMultiple({ entry, sl, exit, direction }) {
  const risk = Math.abs(Number(entry) - Number(sl));
  if (!risk) return 0;
  const e = Number(entry);
  const x = Number(exit);
  const move = direction === 'LONG' ? x - e : e - x;
  return round2(move / risk);
}

export function updateEquity(startingBalance, trades) {
  const pl = (trades || []).reduce((s, t) => s + (Number(t.pl) || 0), 0);
  return round2((Number(startingBalance) || 0) + pl);
}

export function peakEquity(start, trades) {
  let equity = Number(start) || 0;
  let peak = equity;
  for (const t of trades || []) {
    equity += Number(t.pl) || 0;
    if (equity > peak) peak = equity;
  }
  return round2(peak);
}

export function drawdown(peak, current) {
  if (!peak || peak <= 0) return 0;
  return round2(((peak - current) / peak) * 100);
}

/**
 * Full gate check for starting a trade.
 * Returns { allowed: boolean, reasons: string[] }
 */
export function canStartTrade(state) {
  const reasons = [];
  const risk = state.risk || DEFAULT_RISK;
  const prep = state.preparation;
  const analysis = state.analysis;
  const trades = state.trades || [];
  const equity = state.equity ?? risk.startingBalance;

  if (!prep || !prep.accepted) {
    reasons.push('Daily rules not accepted');
  }
  if (!analysis || !analysis.complete) {
    reasons.push('Analysis incomplete');
  }
  if (state.activeTrade) {
    reasons.push('An active trade is already open');
  }

  if (analysis && analysis.complete) {
    if (analysis.bias === 'Bullish' && analysis.direction !== 'LONG') {
      reasons.push('Bullish bias → LONG only');
    }
    if (analysis.bias === 'Bearish' && analysis.direction !== 'SHORT') {
      reasons.push('Bearish bias → SHORT only');
    }
    const rr = calcRR(analysis);
    if (rr < (risk.minRR || 2)) {
      reasons.push(`RR ${rr.toFixed(2)} is below minimum ${risk.minRR}`);
    }
    if (!analysis.entry || !analysis.sl || !analysis.tp) {
      reasons.push('Entry, SL, and TP required');
    }
  }

  const today = todayISO();
  const todayTrades = trades.filter((t) => (t.closedAt || '').startsWith(today));
  if (todayTrades.length >= (risk.maxTradesPerDay || 3)) {
    reasons.push(`Max trades/day (${risk.maxTradesPerDay}) reached`);
  }

  const dailyLossAbs = todayTrades
    .filter((t) => t.result === 'LOSS')
    .reduce((s, t) => s + Math.abs(Number(t.pl) || 0), 0);
  const maxDailyLoss = equity * ((risk.dailyMaxLossPct || 1) / 100);
  if (dailyLossAbs >= maxDailyLoss && maxDailyLoss > 0) {
    reasons.push('Daily max loss limit hit');
  }

  let consec = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].result === 'LOSS') consec++;
    else break;
  }
  if (consec >= (risk.maxConsecutiveLosses || 2)) {
    reasons.push(`Max consecutive losses (${risk.maxConsecutiveLosses}) hit`);
  }

  if (risk.timeWindowEnabled) {
    // Simple HH:MM check in local time
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = (risk.timeWindowStart || '00:00').split(':').map(Number);
    const [eh, em] = (risk.timeWindowEnd || '23:59').split(':').map(Number);
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    if (mins < startM || mins > endM) {
      reasons.push('Outside allowed trading time window');
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

export function isHighRiskEmotion(state) {
  return HIGH_RISK_EMOTIONS.includes(state?.preparation?.mentalState);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
