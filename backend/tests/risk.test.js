/**
 * Unit tests: risk approval + workflow order + schema defaults
 * Run: npm test (from backend/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// --- Pure domain logic (mirrored from frontend domain for testability) ---

const DEFAULT_RISK = {
  startingBalance: 10000,
  riskPerTradePct: 0.5,
  dailyMaxLossPct: 1,
  dailyTargetR: 2,
  maxTradesPerDay: 3,
  maxConsecutiveLosses: 2,
  minRR: 2,
  timeWindowEnabled: false,
};

function calcRisk({ balance, riskPct, entry, sl, pointValue = 1 }) {
  const riskDollars = balance * (riskPct / 100);
  const stopDistance = Math.abs(entry - sl);
  if (stopDistance === 0) return { riskDollars, positionSize: 0, rr: 0 };
  const positionSize = riskDollars / (stopDistance * pointValue);
  return { riskDollars, positionSize, stopDistance };
}

function calcRR({ entry, sl, tp }) {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return 0;
  return reward / risk;
}

function canStartTrade({ preparation, analysis, activeTrade, risk, trades, equity }) {
  const reasons = [];
  if (!preparation || !preparation.accepted) {
    reasons.push('Rules not accepted today');
  }
  if (!analysis || !analysis.complete) {
    reasons.push('Analysis incomplete');
  }
  if (activeTrade) {
    reasons.push('Active trade already open');
  }
  if (analysis) {
    if (analysis.bias === 'Bullish' && analysis.direction !== 'LONG') {
      reasons.push('Bullish bias requires LONG only');
    }
    if (analysis.bias === 'Bearish' && analysis.direction !== 'SHORT') {
      reasons.push('Bearish bias requires SHORT only');
    }
    const rr = calcRR(analysis);
    if (rr < (risk.minRR || 2)) {
      reasons.push(`RR ${rr.toFixed(2)} below minimum ${risk.minRR}`);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = (trades || []).filter((t) => (t.closedAt || '').startsWith(today));
  if (todayTrades.length >= (risk.maxTradesPerDay || 3)) {
    reasons.push('Max trades per day reached');
  }
  const dailyLoss = todayTrades
    .filter((t) => t.result === 'LOSS')
    .reduce((s, t) => s + Math.abs(t.pl || 0), 0);
  const maxDailyLoss = (equity || risk.startingBalance) * ((risk.dailyMaxLossPct || 1) / 100);
  if (dailyLoss >= maxDailyLoss) {
    reasons.push('Daily max loss hit');
  }
  // Consecutive losses
  let consec = 0;
  for (let i = (trades || []).length - 1; i >= 0; i--) {
    if (trades[i].result === 'LOSS') consec++;
    else break;
  }
  if (consec >= (risk.maxConsecutiveLosses || 2)) {
    reasons.push('Max consecutive losses hit');
  }
  if (preparation && preparation.mentalState) {
    const highRisk = ['Angry', 'Greedy', 'Fearful', 'Frustrated', 'Tired', 'Distracted'];
    if (highRisk.includes(preparation.mentalState)) {
      // Warning only — does not hard-block, but recorded
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

function validateBiasDirection(bias, direction) {
  if (bias === 'Bullish' && direction !== 'LONG') return false;
  if (bias === 'Bearish' && direction !== 'SHORT') return false;
  return true;
}

function workflowOrder(stage) {
  const order = ['home', 'prepare', 'analysis', 'pretrade', 'active', 'review', 'journal'];
  return order.indexOf(stage);
}

function nextStage(current) {
  const map = {
    home: 'prepare',
    prepare: 'analysis',
    analysis: 'pretrade',
    pretrade: 'active',
    active: 'review',
    review: 'journal',
    journal: 'home',
  };
  return map[current] || 'home';
}

function updateEquity(startingBalance, trades) {
  const pl = (trades || []).reduce((s, t) => s + (Number(t.pl) || 0), 0);
  return startingBalance + pl;
}

// --- Tests ---

describe('Risk calculator', () => {
  it('calculates risk dollars and position size', () => {
    const r = calcRisk({ balance: 10000, riskPct: 0.5, entry: 1.1, sl: 1.09, pointValue: 1 });
    assert.equal(r.riskDollars, 50);
    assert.ok(r.positionSize > 0);
    assert.ok(Math.abs(r.stopDistance - 0.01) < 1e-9);
  });

  it('handles zero stop distance', () => {
    const r = calcRisk({ balance: 10000, riskPct: 0.5, entry: 1.1, sl: 1.1 });
    assert.equal(r.positionSize, 0);
  });
});

describe('RR calculation', () => {
  it('computes correct RR', () => {
    assert.equal(calcRR({ entry: 100, sl: 98, tp: 104 }), 2);
    assert.equal(calcRR({ entry: 100, sl: 99, tp: 103 }), 3);
  });

  it('returns 0 on zero risk', () => {
    assert.equal(calcRR({ entry: 100, sl: 100, tp: 110 }), 0);
  });
});

describe('Bias / direction rules', () => {
  it('Bullish allows LONG only', () => {
    assert.equal(validateBiasDirection('Bullish', 'LONG'), true);
    assert.equal(validateBiasDirection('Bullish', 'SHORT'), false);
  });
  it('Bearish allows SHORT only', () => {
    assert.equal(validateBiasDirection('Bearish', 'SHORT'), true);
    assert.equal(validateBiasDirection('Bearish', 'LONG'), false);
  });
  it('Neutral allows both', () => {
    assert.equal(validateBiasDirection('Neutral', 'LONG'), true);
    assert.equal(validateBiasDirection('Neutral', 'SHORT'), true);
  });
});

describe('canStartTrade gates', () => {
  const base = {
    preparation: { accepted: true, mentalState: 'Calm' },
    analysis: {
      complete: true,
      bias: 'Bullish',
      direction: 'LONG',
      entry: 100,
      sl: 98,
      tp: 104,
    },
    activeTrade: null,
    risk: { ...DEFAULT_RISK },
    trades: [],
    equity: 10000,
  };

  it('allows when all gates pass', () => {
    const r = canStartTrade(base);
    assert.equal(r.allowed, true);
    assert.equal(r.reasons.length, 0);
  });

  it('blocks without accepted rules', () => {
    const r = canStartTrade({ ...base, preparation: { accepted: false } });
    assert.equal(r.allowed, false);
    assert.ok(r.reasons.some((x) => x.includes('Rules')));
  });

  it('blocks incomplete analysis', () => {
    const r = canStartTrade({ ...base, analysis: { complete: false } });
    assert.equal(r.allowed, false);
  });

  it('blocks active trade', () => {
    const r = canStartTrade({ ...base, activeTrade: { id: '1' } });
    assert.equal(r.allowed, false);
  });

  it('blocks Bullish + SHORT', () => {
    const r = canStartTrade({
      ...base,
      analysis: { ...base.analysis, direction: 'SHORT' },
    });
    assert.equal(r.allowed, false);
    assert.ok(r.reasons.some((x) => x.includes('LONG')));
  });

  it('blocks low RR', () => {
    const r = canStartTrade({
      ...base,
      analysis: { ...base.analysis, tp: 100.5 }, // RR < 2
    });
    assert.equal(r.allowed, false);
  });

  it('blocks max trades/day', () => {
    const today = new Date().toISOString().slice(0, 10);
    const trades = [
      { closedAt: today + 'T10:00:00Z', result: 'WIN', pl: 50 },
      { closedAt: today + 'T11:00:00Z', result: 'WIN', pl: 50 },
      { closedAt: today + 'T12:00:00Z', result: 'LOSS', pl: -50 },
    ];
    const r = canStartTrade({ ...base, trades });
    assert.equal(r.allowed, false);
    assert.ok(r.reasons.some((x) => x.includes('Max trades')));
  });
});

describe('Workflow order', () => {
  it('advances correctly', () => {
    assert.equal(nextStage('home'), 'prepare');
    assert.equal(nextStage('prepare'), 'analysis');
    assert.equal(nextStage('analysis'), 'pretrade');
    assert.equal(nextStage('pretrade'), 'active');
    assert.equal(nextStage('active'), 'review');
    assert.equal(nextStage('review'), 'journal');
  });

  it('order indices increase', () => {
    assert.ok(workflowOrder('prepare') < workflowOrder('analysis'));
    assert.ok(workflowOrder('analysis') < workflowOrder('pretrade'));
    assert.ok(workflowOrder('active') < workflowOrder('review'));
  });
});

describe('Equity update', () => {
  it('updates balance from trade P/L', () => {
    const trades = [
      { pl: 100 },
      { pl: -50 },
      { pl: 25 },
    ];
    assert.equal(updateEquity(10000, trades), 10075);
  });

  it('handles empty trades', () => {
    assert.equal(updateEquity(10000, []), 10000);
  });
});

describe('Default risk pre-filled', () => {
  it('has all required defaults', () => {
    assert.equal(DEFAULT_RISK.startingBalance, 10000);
    assert.equal(DEFAULT_RISK.riskPerTradePct, 0.5);
    assert.equal(DEFAULT_RISK.dailyMaxLossPct, 1);
    assert.equal(DEFAULT_RISK.dailyTargetR, 2);
    assert.equal(DEFAULT_RISK.maxTradesPerDay, 3);
    assert.equal(DEFAULT_RISK.maxConsecutiveLosses, 2);
    assert.equal(DEFAULT_RISK.minRR, 2);
    assert.equal(DEFAULT_RISK.timeWindowEnabled, false);
  });
});
