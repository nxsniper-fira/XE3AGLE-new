/**
 * Stats, isolation, calendar, filter composition tests
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function isCleanTrade(trade) {
  const answers = trade?.review?.answers || {};
  const yesBad = ['movedStop', 'chased', 'revenge', 'overstayed'];
  const noBad = ['followedSetup', 'respectedRisk', 'enteredPerPlan', 'exitedPerPlan'];
  for (const id of yesBad) if (answers[id] === true) return false;
  for (const id of noBad) if (answers[id] === false) return false;
  return true;
}

function tradeDay(t) {
  return (t.day || t.closedAt || '').slice(0, 10);
}

function filterTrades(trades, filters = {}) {
  let list = [...(trades || [])];
  if (filters.direction) list = list.filter((t) => t.direction === filters.direction);
  if (filters.result) list = list.filter((t) => t.result === filters.result);
  if (filters.cleanOnly) list = list.filter(isCleanTrade);
  if (filters.from) list = list.filter((t) => tradeDay(t) >= filters.from);
  if (filters.to) list = list.filter((t) => tradeDay(t) <= filters.to);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter((t) => JSON.stringify(t).toLowerCase().includes(q));
  }
  return list;
}

function computeKPIs(trades, startingBalance = 10000) {
  const list = trades || [];
  const wins = list.filter((t) => t.result === 'WIN');
  const losses = list.filter((t) => t.result === 'LOSS');
  const netPL = list.reduce((s, t) => s + (Number(t.pl) || 0), 0);
  const totalR = list.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0);
  const total = list.length;
  const winRate = total ? (wins.length / total) * 100 : 0;
  const grossWin = wins.reduce((s, t) => s + Math.abs(Number(t.pl) || 0), 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(Number(t.pl) || 0), 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const avgWinR = wins.length
    ? wins.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0) / wins.length
    : 0;
  const avgLossR = losses.length
    ? losses.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0) / losses.length
    : 0;
  const wr = total ? wins.length / total : 0;
  const lr = total ? losses.length / total : 0;
  const expectancy = wr * avgWinR + lr * avgLossR;

  let equity = startingBalance;
  let peak = equity;
  let maxDD = 0;
  for (const t of list) {
    equity += Number(t.pl) || 0;
    if (equity > peak) peak = equity;
    const d = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (d > maxDD) maxDD = d;
  }
  return { netPL, totalR, winRate, profitFactor, expectancy, maxDrawdown: maxDD, equity };
}

function calendarDayAggregate(trades, day) {
  const list = (trades || []).filter((t) => tradeDay(t) === day);
  return {
    count: list.length,
    pl: list.reduce((s, t) => s + (Number(t.pl) || 0), 0),
    r: list.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0),
  };
}

function accountIsolation(accounts, accountId) {
  return (accounts[accountId]?.trades || []).filter((t) => (t.accountId || accountId) === accountId);
}

const sample = [
  {
    id: '1',
    accountId: 'main',
    direction: 'LONG',
    result: 'WIN',
    pl: 100,
    rMultiple: 2,
    closedAt: '2026-09-01T10:00:00Z',
    day: '2026-09-01',
    review: {
      answers: {
        followedSetup: true,
        respectedRisk: true,
        enteredPerPlan: true,
        movedStop: false,
        chased: false,
        revenge: false,
        overstayed: false,
        exitedPerPlan: true,
      },
    },
  },
  {
    id: '2',
    accountId: 'main',
    direction: 'SHORT',
    result: 'LOSS',
    pl: -50,
    rMultiple: -1,
    closedAt: '2026-09-01T12:00:00Z',
    day: '2026-09-01',
    review: {
      answers: {
        followedSetup: false,
        respectedRisk: true,
        enteredPerPlan: true,
        movedStop: true,
        chased: false,
        revenge: false,
        overstayed: false,
        exitedPerPlan: true,
      },
    },
  },
  {
    id: '3',
    accountId: 'funded',
    direction: 'LONG',
    result: 'WIN',
    pl: 200,
    rMultiple: 3,
    closedAt: '2026-09-02T10:00:00Z',
    day: '2026-09-02',
    review: { answers: {} },
  },
];

describe('isCleanTrade', () => {
  it('marks clean when no violations', () => {
    assert.equal(isCleanTrade(sample[0]), true);
  });
  it('marks break when moved stop / broke setup', () => {
    assert.equal(isCleanTrade(sample[1]), false);
  });
});

describe('filter composition', () => {
  it('filters by direction + clean', () => {
    const r = filterTrades(sample.filter((t) => t.accountId === 'main'), { direction: 'LONG', cleanOnly: true });
    assert.equal(r.length, 1);
    assert.equal(r[0].id, '1');
  });
  it('filters by day range', () => {
    const r = filterTrades(sample, { from: '2026-09-02', to: '2026-09-02' });
    assert.equal(r.length, 1);
    assert.equal(r[0].id, '3');
  });
});

describe('KPIs', () => {
  it('computes win rate, PF, expectancy, drawdown', () => {
    const main = sample.filter((t) => t.accountId === 'main');
    const k = computeKPIs(main, 10000);
    assert.equal(k.netPL, 50);
    assert.equal(k.totalR, 1);
    assert.equal(k.winRate, 50);
    assert.ok(k.profitFactor > 1);
    assert.ok(typeof k.expectancy === 'number');
    assert.ok(k.maxDrawdown >= 0);
    assert.equal(k.equity, 10050);
  });
});

describe('calendar day aggregate', () => {
  it('aggregates count and P/L for a day', () => {
    const agg = calendarDayAggregate(sample, '2026-09-01');
    assert.equal(agg.count, 2);
    assert.equal(agg.pl, 50);
    assert.equal(agg.r, 1);
  });
});

describe('account isolation', () => {
  it('account A trades never appear on B', () => {
    const accounts = {
      main: { trades: sample.filter((t) => t.accountId === 'main') },
      funded: { trades: sample.filter((t) => t.accountId === 'funded') },
    };
    const mainT = accountIsolation(accounts, 'main');
    const fundedT = accountIsolation(accounts, 'funded');
    assert.equal(mainT.length, 2);
    assert.equal(fundedT.length, 1);
    assert.ok(mainT.every((t) => t.accountId === 'main'));
    assert.ok(fundedT.every((t) => t.accountId === 'funded'));
    assert.equal(
      mainT.find((t) => t.id === '3'),
      undefined
    );
  });
});
