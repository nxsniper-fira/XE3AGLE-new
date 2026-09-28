/** Analytics: KPIs, streaks, calendar aggregates, filters */

import { VIOLATION_YES_IDS, VIOLATION_NO_IDS } from './constants.js';
import { drawdown as ddPct } from './risk.js';

export function isCleanTrade(trade) {
  const answers = trade?.review?.answers || {};
  for (const id of VIOLATION_YES_IDS) {
    if (answers[id] === true) return false;
  }
  for (const id of VIOLATION_NO_IDS) {
    if (answers[id] === false) return false;
  }
  return true;
}

export function violationBadges(trade) {
  const answers = trade?.review?.answers || {};
  const badges = [];
  if (answers.movedStop === true) badges.push('Moved stop');
  if (answers.chased === true) badges.push('Chased');
  if (answers.revenge === true) badges.push('Revenge');
  if (answers.overstayed === true) badges.push('Overstayed');
  if (answers.followedSetup === false) badges.push('Broke setup');
  if (answers.respectedRisk === false) badges.push('Broke risk');
  if (answers.enteredPerPlan === false) badges.push('Off-plan entry');
  if (answers.exitedPerPlan === false) badges.push('Off-plan exit');
  return badges;
}

export function tradeDay(trade) {
  return (trade.day || trade.closedAt || trade.plannedAt || '').slice(0, 10);
}

export function filterTrades(trades, filters = {}) {
  let list = Array.isArray(trades) ? [...trades] : [];
  const {
    from,
    to,
    direction,
    result,
    setup,
    emotion,
    tag,
    cleanOnly,
    search,
    range, // today|7d|30d|90d|all
  } = filters;

  if (range && range !== 'all' && range !== 'custom') {
    const now = new Date();
    const start = new Date(now);
    if (range === 'today') {
      // keep same calendar day
    } else if (range === '7d') start.setDate(start.getDate() - 7);
    else if (range === '30d') start.setDate(start.getDate() - 30);
    else if (range === '90d') start.setDate(start.getDate() - 90);
    const fromISO = start.toISOString().slice(0, 10);
    list = list.filter((t) => tradeDay(t) >= fromISO);
  }
  if (from) list = list.filter((t) => tradeDay(t) >= from);
  if (to) list = list.filter((t) => tradeDay(t) <= to);
  if (direction) list = list.filter((t) => t.direction === direction);
  if (result) list = list.filter((t) => t.result === result);
  if (setup) list = list.filter((t) => t.entryModel === setup);
  if (emotion) list = list.filter((t) => t.emotion === emotion || t.mentalState === emotion);
  if (tag) {
    list = list.filter((t) => (t.tags || []).includes(tag));
  }
  if (cleanOnly) list = list.filter(isCleanTrade);
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter((t) => {
      const hay = [
        t.notes,
        t.review?.notes,
        t.entryModel,
        t.direction,
        t.result,
        t.emotion || t.mentalState,
        ...(t.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  return list;
}

export function computeKPIs(trades, startingBalance = 10000) {
  const list = trades || [];
  const wins = list.filter((t) => t.result === 'WIN');
  const losses = list.filter((t) => t.result === 'LOSS');
  const be = list.filter((t) => t.result === 'BREAKEVEN');
  const total = list.length;
  const netPL = list.reduce((s, t) => s + (Number(t.pl ?? t.resultPL) || 0), 0);
  const totalR = list.reduce((s, t) => s + (Number(t.rMultiple ?? t.resultR) || 0), 0);
  const winRate = total ? (wins.length / total) * 100 : 0;

  const grossWin = wins.reduce((s, t) => s + Math.abs(Number(t.pl ?? t.resultPL) || 0), 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(Number(t.pl ?? t.resultPL) || 0), 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const avgWinR =
    wins.length > 0
      ? wins.reduce((s, t) => s + (Number(t.rMultiple ?? t.resultR) || 0), 0) / wins.length
      : 0;
  const avgLossR =
    losses.length > 0
      ? losses.reduce((s, t) => s + (Number(t.rMultiple ?? t.resultR) || 0), 0) / losses.length
      : 0;

  // Expectancy in R: (winRate * avgWinR) + (lossRate * avgLossR)
  const wr = total ? wins.length / total : 0;
  const lr = total ? losses.length / total : 0;
  const expectancy = wr * avgWinR + lr * avgLossR;

  let equity = Number(startingBalance) || 0;
  let peak = equity;
  let maxDD = 0;
  const curve = [{ i: 0, equity }];
  for (let i = 0; i < list.length; i++) {
    equity += Number(list[i].pl ?? list[i].resultPL) || 0;
    if (equity > peak) peak = equity;
    const d = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (d > maxDD) maxDD = d;
    curve.push({ i: i + 1, equity });
  }

  const byDay = {};
  list.forEach((t) => {
    const d = tradeDay(t);
    if (!d) return;
    if (!byDay[d]) byDay[d] = 0;
    byDay[d] += Number(t.pl ?? t.resultPL) || 0;
  });
  const dayEntries = Object.entries(byDay);
  let bestDay = null;
  let worstDay = null;
  dayEntries.forEach(([d, pl]) => {
    if (!bestDay || pl > bestDay.pl) bestDay = { day: d, pl };
    if (!worstDay || pl < worstDay.pl) worstDay = { day: d, pl };
  });

  return {
    netPL: round2(netPL),
    totalR: round2(totalR),
    winRate: round2(winRate),
    profitFactor: profitFactor === Infinity ? null : round2(profitFactor),
    expectancy: round2(expectancy),
    avgWinR: round2(avgWinR),
    avgLossR: round2(avgLossR),
    maxDrawdown: round2(maxDD),
    equity: round2(equity),
    startBalance: Number(startingBalance) || 0,
    wins: wins.length,
    losses: losses.length,
    breakeven: be.length,
    total,
    bestDay,
    worstDay,
    curve,
  };
}

export function computeStreaks(trades) {
  const list = trades || [];
  let curWin = 0;
  let curLoss = 0;
  let maxWin = 0;
  let maxLoss = 0;
  let current = { type: null, count: 0 };

  // chronological
  const sorted = [...list].sort((a, b) =>
    String(a.closedAt || '').localeCompare(String(b.closedAt || ''))
  );

  for (const t of sorted) {
    if (t.result === 'WIN') {
      curWin++;
      curLoss = 0;
      if (curWin > maxWin) maxWin = curWin;
    } else if (t.result === 'LOSS') {
      curLoss++;
      curWin = 0;
      if (curLoss > maxLoss) maxLoss = curLoss;
    } else {
      curWin = 0;
      curLoss = 0;
    }
  }
  // current streak from end
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i].result;
    if (!current.type) {
      if (r === 'WIN' || r === 'LOSS') {
        current = { type: r, count: 1 };
      } else break;
    } else if (r === current.type) {
      current.count++;
    } else break;
  }

  return {
    currentWinStreak: current.type === 'WIN' ? current.count : 0,
    currentLossStreak: current.type === 'LOSS' ? current.count : 0,
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
  };
}

export function breakdown(trades, keyFn) {
  const map = {};
  for (const t of trades || []) {
    const k = keyFn(t) || '—';
    if (!map[k]) map[k] = { key: k, count: 0, pl: 0, r: 0, wins: 0 };
    map[k].count++;
    map[k].pl += Number(t.pl ?? t.resultPL) || 0;
    map[k].r += Number(t.rMultiple ?? t.resultR) || 0;
    if (t.result === 'WIN') map[k].wins++;
  }
  return Object.values(map)
    .map((row) => ({
      ...row,
      pl: round2(row.pl),
      r: round2(row.r),
      winRate: row.count ? round2((row.wins / row.count) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Month calendar cells: { day, count, pl, r } */
export function calendarMonth(trades, year, month) {
  // month 0-11
  const first = new Date(year, month, 1);
  const startPad = first.getDay(); // 0 Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = {};
  (trades || []).forEach((t) => {
    const d = tradeDay(t);
    if (!d) return;
    const [y, m, day] = d.split('-').map(Number);
    if (y !== year || m !== month + 1) return;
    if (!byDay[day]) byDay[day] = { count: 0, pl: 0, r: 0 };
    byDay[day].count++;
    byDay[day].pl += Number(t.pl ?? t.resultPL) || 0;
    byDay[day].r += Number(t.rMultiple ?? t.resultR) || 0;
  });
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const agg = byDay[day] || { count: 0, pl: 0, r: 0 };
    cells.push({
      day,
      iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      count: agg.count,
      pl: round2(agg.pl),
      r: round2(agg.r),
    });
  }
  return cells;
}

export function equityCurveSVG(curve, { width = 320, height = 100, hideBalance = false } = {}) {
  if (!curve || curve.length < 2) {
    return `<svg viewBox="0 0 ${width} ${height}" class="equity-svg"><text x="12" y="50" fill="currentColor" opacity="0.4" font-size="12">No data</text></svg>`;
  }
  const vals = curve.map((c) => c.equity);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = curve
    .map((c, i) => {
      const x = (i / (curve.length - 1)) * (width - 16) + 8;
      const y = height - 12 - ((c.equity - min) / span) * (height - 24);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = vals[vals.length - 1];
  const label = hideBalance ? '••••' : last.toFixed(0);
  return `<svg viewBox="0 0 ${width} ${height}" class="equity-svg" role="img" aria-label="Equity curve">
    <polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}" />
    <text x="${width - 8}" y="14" text-anchor="end" fill="currentColor" font-size="11" opacity="0.7">${label}</text>
  </svg>`;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
