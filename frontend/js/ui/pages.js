/** Page renderers — active-account scoped */

import { icons } from './icons.js';
import { money, fmt } from './money.js';
import {
  MENTAL_STATES, HIGH_RISK_EMOTIONS, BIASES, DIRECTIONS, ENTRY_MODELS,
  TRADE_RESULTS, REVIEW_QUESTIONS, STAGES, ACCOUNT_TYPES,
} from '../domain/constants.js';
import {
  getState, setState, getActiveAccount, patchActive,
  listAccounts, createAccount, switchAccount, renameAccount,
  archiveAccount, updateAccountMeta,
} from '../domain/state.js';
import { calcRisk, calcRR, canStartTrade, isHighRiskEmotion, drawdown, todayISO } from '../domain/risk.js';
import {
  acceptRules, saveAnalysis, startTrade, closeTrade, completeReview,
  getGateStatus, addManualTrade, updateTrade, deleteTrade,
} from '../workflow/trade.js';
import {
  filterTrades, computeKPIs, computeStreaks, breakdown, calendarMonth,
  equityCurveSVG, isCleanTrade, violationBadges, tradeDay,
} from '../domain/stats.js';
import { toast } from './toast.js';
import { schedulePush } from '../services/sync.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── HOME ───────────────────────────────────────────
export function renderHome(root) {
  const s = getState();
  const a = getActiveAccount();
  const equity = a.equity ?? a.startingBalance;
  const peak = a.peakEquity ?? equity;
  const dd = drawdown(peak, equity);
  const hasActive = !!a.activeTrade;
  const prepDone = !!a.preparation?.accepted;
  const analysisDone = !!a.analysis?.complete;

  let mission = 'Start your day with Prepare';
  let cta = 'Prepare';
  let ctaStage = STAGES.PREPARE;
  if (hasActive) {
    mission = 'Trade open — manage with discipline';
    cta = 'View Active Trade';
    ctaStage = STAGES.ACTIVE;
  } else if (a.pendingReview) {
    mission = 'Complete post-trade review';
    cta = 'Review Trade';
    ctaStage = STAGES.REVIEW;
  } else if (prepDone && analysisDone) {
    mission = 'Ready for Pre-Trade Check';
    cta = 'Pre-Trade Check';
    ctaStage = STAGES.PRETRADE;
  } else if (prepDone) {
    mission = 'Complete your Analysis';
    cta = 'Analysis';
    ctaStage = STAGES.ANALYSIS;
  }

  root.innerHTML = `
    <div class="page">
      <div class="home-status">
        <div class="dim" style="font-size:0.8rem;margin-bottom:4px">${esc(a.name)} · ${esc(a.type)}</div>
        <div class="row-between" style="justify-content:center;gap:8px">
          <div class="home-balance mono">${money(equity)}</div>
          <button class="eye-btn" id="toggle-balance" aria-label="Toggle balance visibility" style="min-width:36px;min-height:36px">
            ${s.hideBalance ? icons.eyeOff : icons.eye}
          </button>
        </div>
        <div class="dim" style="font-size:0.85rem;margin-top:4px">
          Peak ${money(peak)} · DD ${fmt(dd, 1)}%
        </div>
        <p class="home-mission">${mission}</p>
      </div>
      <div class="card mb-4">
        <div class="card-title">Today</div>
        <div class="stack-sm">
          <div class="row-between"><span class="muted">Rules</span><span class="${prepDone ? 'text-success' : 'dim'}">${prepDone ? 'Accepted' : 'Pending'}</span></div>
          <div class="row-between"><span class="muted">Analysis</span><span class="${analysisDone ? 'text-success' : 'dim'}">${analysisDone ? 'Complete' : 'Pending'}</span></div>
          <div class="row-between"><span class="muted">Active trade</span><span class="${hasActive ? 'text-accent' : 'dim'}">${hasActive ? 'Open' : 'None'}</span></div>
        </div>
      </div>
      <button class="btn btn-primary" id="home-cta">${cta}</button>
    </div>`;

  root.querySelector('#toggle-balance')?.addEventListener('click', () => {
    setState({ hideBalance: !getState().hideBalance });
    schedulePush();
    window.dispatchEvent(new CustomEvent('xe3agle:rerender'));
  });
  root.querySelector('#home-cta')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: ctaStage } }));
  });
}

// ─── PREPARE ────────────────────────────────────────
export function renderPrepare(root) {
  const a = getActiveAccount();
  const prep = a.preparation || {};
  const risk = a.risk;

  root.innerHTML = `
    <div class="page">
      <h1>Prepare</h1>
      <p>Check in with yourself before any trade.</p>
      <div class="field">
        <label>Mental state</label>
        <div class="pills" id="mental-pills">
          ${MENTAL_STATES.map((m) =>
            `<button type="button" class="pill ${HIGH_RISK_EMOTIONS.includes(m) ? 'danger' : ''} ${prep.mentalState === m ? 'active' : ''}" data-state="${m}">${m}</button>`
          ).join('')}
        </div>
      </div>
      <div id="emotion-warn" class="warn-banner ${isHighRiskEmotion({ preparation: prep }) ? '' : 'hidden'} mb-4">
        High-risk emotion detected. Consider sitting out or reducing size.
      </div>
      <div class="field"><label>Focus / notes</label><textarea id="prep-notes" placeholder="What am I focusing on today?">${esc(prep.notes || '')}</textarea></div>
      <div class="field"><label>News / markets</label><textarea id="prep-news" placeholder="Key news, events, levels…">${esc(prep.news || '')}</textarea></div>
      <div class="card mb-4">
        <div class="card-title">Daily Rules Contract</div>
        <div class="stack-sm">
          <div class="row-between"><span class="muted">Risk / trade</span><span>${risk.riskPerTradePct}%</span></div>
          <div class="row-between"><span class="muted">Daily max loss</span><span>${risk.dailyMaxLossPct}%</span></div>
          <div class="row-between"><span class="muted">Daily target</span><span>+${risk.dailyTargetR}R</span></div>
          <div class="row-between"><span class="muted">Max trades / day</span><span>${risk.maxTradesPerDay}</span></div>
          <div class="row-between"><span class="muted">Max consecutive losses</span><span>${risk.maxConsecutiveLosses}</span></div>
          <div class="row-between"><span class="muted">Min RR</span><span>${risk.minRR}</span></div>
        </div>
      </div>
      <button class="btn btn-primary" id="accept-rules">I Accept Today's Rules</button>
    </div>`;

  let selected = prep.mentalState || null;
  root.querySelectorAll('#mental-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      selected = btn.dataset.state;
      root.querySelectorAll('#mental-pills .pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const warn = root.querySelector('#emotion-warn');
      if (HIGH_RISK_EMOTIONS.includes(selected)) warn.classList.remove('hidden');
      else warn.classList.add('hidden');
    });
  });
  root.querySelector('#accept-rules').addEventListener('click', () => {
    if (!selected) return toast('Select a mental state', 'error');
    acceptRules({
      mentalState: selected,
      notes: root.querySelector('#prep-notes').value.trim(),
      news: root.querySelector('#prep-news').value.trim(),
    });
  });
}

// ─── ANALYSIS ───────────────────────────────────────
export function renderAnalysis(root) {
  const a = getActiveAccount();
  const an = a.analysis || {};
  const risk = a.risk;
  const equity = a.equity ?? risk.startingBalance;

  root.innerHTML = `
    <div class="page">
      <h1>Analysis / Setup</h1>
      <p>Define bias, model, and levels. Bias locks direction.</p>
      <div class="field"><label>Bias (HTF)</label>
        <div class="pills" id="bias-pills">${BIASES.map((b) => `<button type="button" class="pill ${an.bias === b ? 'active' : ''}" data-v="${b}">${b}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Direction</label>
        <div class="pills" id="dir-pills">${DIRECTIONS.map((d) => `<button type="button" class="pill ${an.direction === d ? 'active' : ''}" data-v="${d}">${d}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Entry model</label>
        <div class="pills" id="model-pills">${ENTRY_MODELS.map((m) => `<button type="button" class="pill ${an.entryModel === m ? 'active' : ''}" data-v="${m}">${m}</button>`).join('')}</div>
      </div>
      <div class="field"><label>Liquidity notes</label><textarea id="liq-notes">${esc(an.liquidityNotes || '')}</textarea></div>
      <div class="row gap-2 mb-4">
        <label class="row" style="flex:1"><input type="checkbox" id="sweep" ${an.sweepConfirmed ? 'checked' : ''}> Sweep confirmed</label>
        <label class="row" style="flex:1"><input type="checkbox" id="mss" ${an.mssConfirmed ? 'checked' : ''}> MSS confirmed</label>
      </div>
      <div class="field-row">
        <div class="field"><label>Entry</label><input type="number" step="any" id="entry" value="${an.entry ?? ''}"></div>
        <div class="field"><label>SL</label><input type="number" step="any" id="sl" value="${an.sl ?? ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>TP</label><input type="number" step="any" id="tp" value="${an.tp ?? ''}"></div>
        <div class="field"><label>Point value</label><input type="number" step="any" id="pv" value="${an.pointValue ?? 1}"></div>
      </div>
      <div class="card mb-4">
        <div class="card-title">Live risk calculator</div>
        <div class="stats-grid">
          <div class="stat-box"><div class="stat-value mono" id="r-dollars">—</div><div class="stat-label">Risk $</div></div>
          <div class="stat-box"><div class="stat-value mono" id="r-size">—</div><div class="stat-label">Position</div></div>
          <div class="stat-box"><div class="stat-value mono" id="r-rr">—</div><div class="stat-label">RR</div></div>
          <div class="stat-box"><div class="stat-value mono" id="r-pl">—</div><div class="stat-label">Potential P/L</div></div>
        </div>
      </div>
      <div class="field"><label>Setup notes</label><textarea id="setup-notes">${esc(an.notes || '')}</textarea></div>
      <button class="btn btn-primary" id="save-analysis">Save Analysis</button>
    </div>`;

  let bias = an.bias || null;
  let direction = an.direction || null;
  let entryModel = an.entryModel || null;

  function bindPills(sel, setter) {
    root.querySelectorAll(sel + ' .pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        setter(btn.dataset.v);
        root.querySelectorAll(sel + ' .pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (sel === '#bias-pills') {
          if (btn.dataset.v === 'Bullish') {
            direction = 'LONG';
            root.querySelectorAll('#dir-pills .pill').forEach((b) => b.classList.toggle('active', b.dataset.v === 'LONG'));
          } else if (btn.dataset.v === 'Bearish') {
            direction = 'SHORT';
            root.querySelectorAll('#dir-pills .pill').forEach((b) => b.classList.toggle('active', b.dataset.v === 'SHORT'));
          }
        }
        updateCalc();
      });
    });
  }
  bindPills('#bias-pills', (v) => (bias = v));
  bindPills('#dir-pills', (v) => (direction = v));
  bindPills('#model-pills', (v) => (entryModel = v));

  function updateCalc() {
    const entry = parseFloat(root.querySelector('#entry').value);
    const sl = parseFloat(root.querySelector('#sl').value);
    const tp = parseFloat(root.querySelector('#tp').value);
    const pv = parseFloat(root.querySelector('#pv').value) || 1;
    const { riskDollars, positionSize } = calcRisk({ balance: equity, riskPct: risk.riskPerTradePct, entry, sl, pointValue: pv });
    const rr = calcRR({ entry, sl, tp });
    const potPL = riskDollars * rr;
    root.querySelector('#r-dollars').textContent = Number.isFinite(riskDollars) ? fmt(riskDollars) : '—';
    root.querySelector('#r-size').textContent = Number.isFinite(positionSize) ? fmt(positionSize, 4) : '—';
    root.querySelector('#r-rr').textContent = Number.isFinite(rr) ? fmt(rr) : '—';
    root.querySelector('#r-pl').textContent = Number.isFinite(potPL) ? fmt(potPL) : '—';
  }
  ['#entry', '#sl', '#tp', '#pv'].forEach((id) => root.querySelector(id)?.addEventListener('input', updateCalc));
  updateCalc();

  root.querySelector('#save-analysis').addEventListener('click', () => {
    if (!bias) return toast('Select bias', 'error');
    if (!direction) return toast('Select direction', 'error');
    if (!entryModel) return toast('Select entry model', 'error');
    saveAnalysis({
      bias, direction, entryModel,
      liquidityNotes: root.querySelector('#liq-notes').value.trim(),
      sweepConfirmed: root.querySelector('#sweep').checked,
      mssConfirmed: root.querySelector('#mss').checked,
      entry: parseFloat(root.querySelector('#entry').value),
      sl: parseFloat(root.querySelector('#sl').value),
      tp: parseFloat(root.querySelector('#tp').value),
      pointValue: parseFloat(root.querySelector('#pv').value) || 1,
      notes: root.querySelector('#setup-notes').value.trim(),
    });
  });
}

// ─── PRETRADE / ACTIVE / REVIEW ─────────────────────
export function renderPreTrade(root) {
  const gate = getGateStatus();
  const a = getActiveAccount();
  const an = a.analysis || {};
  const items = [
    { ok: !!a.preparation?.accepted, label: 'Daily rules accepted' },
    { ok: !!an.complete, label: 'Analysis complete' },
    { ok: !a.activeTrade, label: 'No active trade' },
    { ok: !(an.bias === 'Bullish' && an.direction !== 'LONG') && !(an.bias === 'Bearish' && an.direction !== 'SHORT'), label: 'Bias matches direction' },
    { ok: (an.rr || 0) >= (a.risk.minRR || 2), label: `RR ≥ ${a.risk.minRR} (current ${fmt(an.rr || 0)})` },
    { ok: !gate.reasons.some((r) => r.includes('Max trades')), label: 'Under max trades/day' },
    { ok: !gate.reasons.some((r) => r.includes('max loss') || r.includes('Daily max')), label: 'Under daily max loss' },
    { ok: !gate.reasons.some((r) => r.includes('consecutive')), label: 'Under consecutive loss limit' },
  ];
  root.innerHTML = `
    <div class="page">
      <h1>Pre-Trade Check</h1>
      <p>All gates must pass before you can start.</p>
      <div class="card mb-4">${items.map((i) => `<div class="check-item ${i.ok ? 'pass' : 'fail'}"><span>${i.ok ? '✓' : '✗'}</span><span>${i.label}</span></div>`).join('')}</div>
      ${!gate.allowed ? `<div class="warn-banner mb-4">${gate.reasons.map((r) => `<div>${esc(r)}</div>`).join('')}</div>` : ''}
      ${an.complete ? `<div class="card mb-4"><div class="card-title">Plan summary</div>
        <div class="stack-sm">
          <div class="row-between"><span class="muted">Bias / Dir</span><span>${an.bias} · ${an.direction}</span></div>
          <div class="row-between"><span class="muted">Model</span><span>${an.entryModel}</span></div>
          <div class="row-between"><span class="muted">Entry / SL / TP</span><span class="mono">${an.entry} / ${an.sl} / ${an.tp}</span></div>
          <div class="row-between"><span class="muted">Risk $ · RR</span><span class="mono">${fmt(an.riskDollars)} · ${fmt(an.rr)}</span></div>
        </div></div>` : ''}
      <button class="btn btn-primary" id="start-trade" ${gate.allowed ? '' : 'disabled'}>Start Trade</button>
    </div>`;
  root.querySelector('#start-trade')?.addEventListener('click', () => startTrade());
}

export function renderActive(root) {
  const a = getActiveAccount();
  const t = a.activeTrade;
  if (!t) {
    root.innerHTML = `<div class="page"><div class="empty">No active trade</div>
      <button class="btn btn-primary" id="go-prep">Go to Prepare</button></div>`;
    root.querySelector('#go-prep')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: STAGES.PREPARE } }));
    });
    return;
  }
  root.innerHTML = `
    <div class="page">
      <h1>Active Trade</h1>
      <span class="badge badge-active">OPEN</span>
      <div class="card mt-4 mb-4"><div class="stack-sm">
        <div class="row-between"><span class="muted">Direction</span><span>${t.direction}</span></div>
        <div class="row-between"><span class="muted">Bias</span><span>${t.bias}</span></div>
        <div class="row-between"><span class="muted">Model</span><span>${t.entryModel}</span></div>
        <div class="row-between"><span class="muted">Entry / SL / TP</span><span class="mono">${t.entry} / ${t.sl} / ${t.tp}</span></div>
        <div class="row-between"><span class="muted">Risk $ · RR</span><span class="mono">${fmt(t.riskDollars)} · ${fmt(t.rr)}</span></div>
      </div></div>
      <div class="field"><label>Result</label>
        <div class="pills" id="result-pills">${TRADE_RESULTS.map((r) => `<button type="button" class="pill" data-v="${r}">${r}</button>`).join('')}</div>
      </div>
      <div class="field"><label>R multiple</label><input type="number" step="0.1" id="r-mult" placeholder="0"></div>
      <div class="field"><label>Exit price (optional)</label><input type="number" step="any" id="exit-price"></div>
      <button class="btn btn-primary" id="close-trade">Close Trade</button>
    </div>`;
  let result = null;
  root.querySelectorAll('#result-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      result = btn.dataset.v;
      root.querySelectorAll('#result-pills .pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  root.querySelector('#close-trade').addEventListener('click', () => {
    if (!result) return toast('Select result', 'error');
    const rMultiple = parseFloat(root.querySelector('#r-mult').value);
    if (!Number.isFinite(rMultiple)) return toast('Enter R multiple', 'error');
    const exitPrice = parseFloat(root.querySelector('#exit-price').value);
    closeTrade({ result, rMultiple, exitPrice: Number.isFinite(exitPrice) ? exitPrice : null });
  });
}

export function renderReview(root) {
  const a = getActiveAccount();
  const pending = a.pendingReview;
  if (!pending) {
    root.innerHTML = `<div class="page"><div class="empty">No trade pending review</div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="page">
      <h1>Post-Trade Review</h1>
      <p>Mandatory. Answer every question before the trade is logged.</p>
      <div class="card mb-4">
        <div class="row-between"><span class="muted">${pending.direction}</span>
          <span class="badge badge-${pending.result === 'WIN' ? 'win' : pending.result === 'LOSS' ? 'loss' : 'be'}">${pending.result}</span></div>
        <div class="row-between mt-2"><span class="muted">R</span><span class="mono">${fmt(pending.rMultiple)}</span></div>
        <div class="row-between"><span class="muted">P/L</span><span class="mono">${money(pending.pl)}</span></div>
      </div>
      <div id="review-qs">${REVIEW_QUESTIONS.map((q) => `
        <div class="yn-row" data-qid="${q.id}">
          <span>${q.label}</span>
          <div class="yn-btns">
            <button type="button" class="yn-btn yes" data-val="true">YES</button>
            <button type="button" class="yn-btn no" data-val="false">NO</button>
          </div>
        </div>`).join('')}</div>
      <div class="field mt-4"><label>Notes</label><textarea id="review-notes" placeholder="What did I learn?"></textarea></div>
      <div class="field"><label>Tags (comma-separated)</label><input id="review-tags" placeholder="e.g. FVG, morning"></div>
      <button class="btn btn-primary" id="complete-review">Complete Review</button>
    </div>`;
  const answers = {};
  root.querySelectorAll('.yn-row').forEach((row) => {
    const qid = row.dataset.qid;
    row.querySelectorAll('.yn-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        answers[qid] = btn.dataset.val === 'true';
        row.querySelectorAll('.yn-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });
  root.querySelector('#complete-review').addEventListener('click', () => {
    const tagStr = root.querySelector('#review-tags').value.trim();
    const tags = tagStr ? tagStr.split(',').map((t) => t.trim()).filter(Boolean) : [];
    completeReview({ answers, notes: root.querySelector('#review-notes').value.trim(), tags });
  });
}

// ─── JOURNAL ────────────────────────────────────────
export function renderJournal(root) {
  const a = getActiveAccount();
  const filters = root._jFilters || { search: '', direction: '', result: '', setup: '', emotion: '', cleanOnly: false, from: '', to: '' };
  root._jFilters = filters;
  let trades = filterTrades(a.trades || [], filters);
  trades = [...trades].sort((x, y) => String(y.closedAt || '').localeCompare(String(x.closedAt || '')));

  // Day groups
  const groups = {};
  trades.forEach((t) => {
    const d = tradeDay(t) || 'unknown';
    if (!groups[d]) groups[d] = { trades: [], pl: 0 };
    groups[d].trades.push(t);
    groups[d].pl += Number(t.pl ?? t.resultPL) || 0;
  });
  const days = Object.keys(groups).sort().reverse();

  const detailId = root._detailId;
  if (detailId) {
    const t = (a.trades || []).find((x) => x.id === detailId);
    if (t) {
      renderTradeDetail(root, t);
      return;
    }
    root._detailId = null;
  }

  root.innerHTML = `
    <div class="page page--wide">
      <div class="row-between mb-4">
        <h1 style="margin:0">Journal</h1>
        <div class="row gap-2">
          <button class="btn btn-ghost btn-sm" id="j-add">Add</button>
          <button class="btn btn-ghost btn-sm" id="export-csv">CSV</button>
          <button class="btn btn-ghost btn-sm" id="export-json">JSON</button>
        </div>
      </div>
      <div class="field"><input type="search" id="j-search" placeholder="Search notes, tags, setup…" value="${esc(filters.search || '')}"></div>
      <div class="field-row">
        <div class="field"><label>From</label><input type="date" id="j-from" value="${filters.from || ''}"></div>
        <div class="field"><label>To</label><input type="date" id="j-to" value="${filters.to || ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Direction</label>
          <select id="j-dir"><option value="">All</option>${DIRECTIONS.map((d) => `<option value="${d}" ${filters.direction === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Result</label>
          <select id="j-res"><option value="">All</option>${TRADE_RESULTS.map((r) => `<option value="${r}" ${filters.result === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Setup</label>
          <select id="j-setup"><option value="">All</option>${ENTRY_MODELS.map((m) => `<option value="${m}" ${filters.setup === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Emotion</label>
          <select id="j-emo"><option value="">All</option>${MENTAL_STATES.map((m) => `<option value="${m}" ${filters.emotion === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        </div>
      </div>
      <label class="row mb-4"><input type="checkbox" id="j-clean" ${filters.cleanOnly ? 'checked' : ''}> Clean process only</label>

      ${days.length === 0
        ? `<div class="empty">No trades yet<button class="btn btn-primary mt-4" id="j-empty-cta">Start Prepare</button></div>`
        : days.map((d) => `
          <div class="card mb-4">
            <div class="row-between mb-2">
              <strong>${d}</strong>
              <span class="mono ${groups[d].pl >= 0 ? 'text-success' : 'text-danger'}">${money(groups[d].pl)}</span>
            </div>
            ${groups[d].trades.map((t) => {
              const clean = isCleanTrade(t);
              return `<div class="trade-row" data-id="${t.id}">
                <div>
                  <div><strong>${t.direction}</strong> · ${esc(t.entryModel || '—')} · <span class="mono">${fmt(t.rMultiple ?? t.resultR)}R</span>
                    <span class="badge ${clean ? 'badge-win' : 'badge-loss'}" style="margin-left:6px">${clean ? 'Clean' : 'Break'}</span>
                  </div>
                  <div class="dim" style="font-size:0.8rem">${esc(t.emotion || t.mentalState || '')} · ${(t.tags || []).join(', ')}</div>
                </div>
                <div style="text-align:right">
                  <span class="badge badge-${t.result === 'WIN' ? 'win' : t.result === 'LOSS' ? 'loss' : 'be'}">${t.result}</span>
                  <div class="mono" style="font-size:0.9rem;margin-top:4px">${money(t.pl ?? t.resultPL)}</div>
                </div>
              </div>`;
            }).join('')}
          </div>`).join('')}
    </div>`;

  function applyFilters() {
    root._jFilters = {
      search: root.querySelector('#j-search')?.value || '',
      from: root.querySelector('#j-from')?.value || '',
      to: root.querySelector('#j-to')?.value || '',
      direction: root.querySelector('#j-dir')?.value || '',
      result: root.querySelector('#j-res')?.value || '',
      setup: root.querySelector('#j-setup')?.value || '',
      emotion: root.querySelector('#j-emo')?.value || '',
      cleanOnly: root.querySelector('#j-clean')?.checked || false,
    };
    renderJournal(root);
  }
  ['#j-search', '#j-from', '#j-to', '#j-dir', '#j-res', '#j-setup', '#j-emo', '#j-clean'].forEach((sel) => {
    root.querySelector(sel)?.addEventListener('change', applyFilters);
    root.querySelector(sel)?.addEventListener('input', (e) => {
      if (sel === '#j-search') {
        clearTimeout(root._searchT);
        root._searchT = setTimeout(applyFilters, 200);
      }
    });
  });
  root.querySelectorAll('.trade-row').forEach((row) => {
    row.addEventListener('click', () => {
      root._detailId = row.dataset.id;
      renderJournal(root);
    });
  });
  root.querySelector('#j-empty-cta')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: STAGES.PREPARE } }));
  });
  root.querySelector('#j-add')?.addEventListener('click', () => showManualAdd(root));
  root.querySelector('#export-csv')?.addEventListener('click', () => {
    const rows = [
      ['id', 'day', 'direction', 'result', 'r', 'pl', 'entry', 'sl', 'tp', 'model', 'emotion', 'tags', 'notes'].join(','),
      ...trades.map((t) =>
        [t.id, tradeDay(t), t.direction, t.result, t.rMultiple ?? t.resultR, t.pl ?? t.resultPL, t.entry, t.sl, t.tp, t.entryModel, t.emotion || t.mentalState, (t.tags || []).join(';'), JSON.stringify(t.review?.notes || t.notes || '')].join(',')
      ),
    ];
    downloadBlob(rows.join('\n'), 'xe3agle-journal.csv', 'text/csv');
    toast('CSV exported');
  });
  root.querySelector('#export-json')?.addEventListener('click', () => {
    downloadBlob(JSON.stringify(trades, null, 2), 'xe3agle-journal.json', 'application/json');
    toast('JSON exported');
  });
}

function renderTradeDetail(root, t) {
  const badges = violationBadges(t);
  const clean = isCleanTrade(t);
  const answers = t.review?.answers || {};
  root.innerHTML = `
    <div class="page">
      <button class="btn btn-ghost btn-sm mb-4" id="j-back">← Back</button>
      <div class="row-between">
        <h1 style="margin:0">${t.direction} · ${esc(t.entryModel || '')}</h1>
        <span class="badge badge-${t.result === 'WIN' ? 'win' : t.result === 'LOSS' ? 'loss' : 'be'}">${t.result}</span>
      </div>
      <div class="mt-2"><span class="badge ${clean ? 'badge-win' : 'badge-loss'}">${clean ? 'Clean process' : 'Process break'}</span></div>
      <div class="card mt-4 mb-4"><div class="stack-sm">
        <div class="row-between"><span class="muted">Date</span><span>${esc(tradeDay(t))} ${(t.closedAt || '').slice(11, 16)}</span></div>
        <div class="row-between"><span class="muted">Entry / SL / TP</span><span class="mono">${t.entry} / ${t.sl} / ${t.tp}</span></div>
        <div class="row-between"><span class="muted">R · P/L</span><span class="mono">${fmt(t.rMultiple ?? t.resultR)} · ${money(t.pl ?? t.resultPL)}</span></div>
        <div class="row-between"><span class="muted">Emotion</span><span>${esc(t.emotion || t.mentalState || '—')}</span></div>
        <div class="row-between"><span class="muted">Tags</span><span>${esc((t.tags || []).join(', ') || '—')}</span></div>
      </div></div>
      ${badges.length ? `<div class="warn-banner mb-4">${badges.map((b) => `<div>• ${esc(b)}</div>`).join('')}</div>` : ''}
      <div class="card mb-4"><div class="card-title">Review answers</div>
        ${REVIEW_QUESTIONS.map((q) => {
          const v = answers[q.id];
          const label = v === true ? 'YES' : v === false ? 'NO' : '—';
          return `<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="muted">${q.label}</span><span>${label}</span></div>`;
        }).join('')}
        <p class="mt-2" style="color:var(--text)">${esc(t.review?.notes || t.notes || '')}</p>
      </div>
      <div class="field"><label>Edit tags (comma-separated)</label><input id="edit-tags" value="${esc((t.tags || []).join(', '))}"></div>
      <button class="btn btn-primary mb-4" id="save-tags">Save tags</button>
      <button class="btn btn-danger btn-block" id="del-trade">Delete trade</button>
    </div>`;
  root.querySelector('#j-back')?.addEventListener('click', () => {
    root._detailId = null;
    renderJournal(root);
  });
  root.querySelector('#save-tags')?.addEventListener('click', () => {
    const tags = root.querySelector('#edit-tags').value.split(',').map((x) => x.trim()).filter(Boolean);
    updateTrade(t.id, { tags });
    toast('Tags saved');
    root._detailId = t.id;
    renderJournal(root);
  });
  root.querySelector('#del-trade')?.addEventListener('click', () => {
    if (!confirm('Delete this trade?')) return;
    deleteTrade(t.id);
    root._detailId = null;
    toast('Trade deleted');
    renderJournal(root);
  });
}

function showManualAdd(root) {
  root.innerHTML = `
    <div class="page">
      <button class="btn btn-ghost btn-sm mb-4" id="m-back">← Back</button>
      <h1>Manual trade</h1>
      <div class="field"><label>Direction</label>
        <select id="m-dir">${DIRECTIONS.map((d) => `<option>${d}</option>`).join('')}</select></div>
      <div class="field"><label>Result</label>
        <select id="m-res">${TRADE_RESULTS.map((r) => `<option>${r}</option>`).join('')}</select></div>
      <div class="field"><label>Setup</label>
        <select id="m-setup">${ENTRY_MODELS.map((m) => `<option>${m}</option>`).join('')}</select></div>
      <div class="field-row">
        <div class="field"><label>R</label><input type="number" step="0.1" id="m-r" value="1"></div>
        <div class="field"><label>P/L $</label><input type="number" step="0.01" id="m-pl" value="0"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Entry</label><input type="number" step="any" id="m-entry"></div>
        <div class="field"><label>SL</label><input type="number" step="any" id="m-sl"></div>
      </div>
      <div class="field"><label>TP</label><input type="number" step="any" id="m-tp"></div>
      <div class="field"><label>Day</label><input type="date" id="m-day" value="${todayISO()}"></div>
      <div class="field"><label>Notes</label><textarea id="m-notes"></textarea></div>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;
  root.querySelector('#m-back')?.addEventListener('click', () => renderJournal(root));
  root.querySelector('#m-save')?.addEventListener('click', () => {
    addManualTrade({
      direction: root.querySelector('#m-dir').value,
      result: root.querySelector('#m-res').value,
      entryModel: root.querySelector('#m-setup').value,
      rMultiple: parseFloat(root.querySelector('#m-r').value) || 0,
      pl: parseFloat(root.querySelector('#m-pl').value) || 0,
      entry: parseFloat(root.querySelector('#m-entry').value) || 0,
      sl: parseFloat(root.querySelector('#m-sl').value) || 0,
      tp: parseFloat(root.querySelector('#m-tp').value) || 0,
      day: root.querySelector('#m-day').value,
      notes: root.querySelector('#m-notes').value.trim(),
    });
    toast('Trade added');
    renderJournal(root);
  });
}

function downloadBlob(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── ANALYTICS + CALENDAR ───────────────────────────
export function renderAnalytics(root) {
  const a = getActiveAccount();
  const filters = root._aFilters || { range: 'all', direction: '', setup: '', emotion: '', result: '', cleanOnly: false };
  root._aFilters = filters;
  const cal = root._cal || { y: new Date().getFullYear(), m: new Date().getMonth() };
  root._cal = cal;

  const trades = filterTrades(a.trades || [], filters);
  // Sort chronologically for curve
  const chrono = [...trades].sort((x, y) => String(x.closedAt || '').localeCompare(String(y.closedAt || '')));
  const kpis = computeKPIs(chrono, a.startingBalance ?? a.risk?.startingBalance);
  const streaks = computeStreaks(chrono);
  const byDir = breakdown(chrono, (t) => t.direction);
  const bySetup = breakdown(chrono, (t) => t.entryModel);
  const byEmotion = breakdown(chrono, (t) => t.emotion || t.mentalState);
  const cleanTrades = chrono.filter(isCleanTrade);
  const violTrades = chrono.filter((t) => !isCleanTrade(t));
  const cleanKPI = computeKPIs(cleanTrades, a.startingBalance);
  const violKPI = computeKPIs(violTrades, a.startingBalance);
  const cells = calendarMonth(a.trades || [], cal.y, cal.m);
  const monthLabel = new Date(cal.y, cal.m, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const hide = !!getState().hideBalance;

  const selectedDay = root._calDay;
  if (selectedDay) {
    const dayTrades = (a.trades || []).filter((t) => tradeDay(t) === selectedDay);
    root.innerHTML = `
      <div class="page">
        <button class="btn btn-ghost btn-sm mb-4" id="cal-back">← Calendar</button>
        <h1>${selectedDay}</h1>
        ${dayTrades.length === 0 ? '<div class="empty">No trades</div>' :
          dayTrades.map((t) => `<div class="trade-row" data-id="${t.id}">
            <div><strong>${t.direction}</strong> · ${esc(t.entryModel)} · ${fmt(t.rMultiple ?? t.resultR)}R</div>
            <div class="mono">${money(t.pl ?? t.resultPL)}</div>
          </div>`).join('')}
      </div>`;
    root.querySelector('#cal-back')?.addEventListener('click', () => {
      root._calDay = null;
      renderAnalytics(root);
    });
    root.querySelectorAll('.trade-row').forEach((row) => {
      row.addEventListener('click', () => {
        // jump to journal detail
        window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: 'journal' } }));
        setTimeout(() => {
          const main = document.getElementById('main');
          if (main) {
            main._detailId = row.dataset.id;
            renderJournal(main);
          }
        }, 50);
      });
    });
    return;
  }

  root.innerHTML = `
    <div class="page page--wide">
      <h1>Analytics</h1>
      <p class="dim">${esc(a.name)}</p>
      <div class="tabs mb-4">
        ${['all', 'today', '7d', '30d', '90d'].map((r) =>
          `<button class="tab ${filters.range === r ? 'active' : ''}" data-range="${r}">${r === 'all' ? 'All' : r}</button>`
        ).join('')}
      </div>
      <div class="field-row mb-4">
        <div class="field"><label>Direction</label>
          <select id="a-dir"><option value="">All</option>${DIRECTIONS.map((d) => `<option value="${d}" ${filters.direction === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field"><label>Result</label>
          <select id="a-res"><option value="">All</option>${TRADE_RESULTS.map((r) => `<option value="${r}" ${filters.result === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      </div>
      <label class="row mb-4"><input type="checkbox" id="a-clean" ${filters.cleanOnly ? 'checked' : ''}> Clean only</label>

      <div class="stats-grid mb-4">
        <div class="stat-box"><div class="stat-value mono">${money(kpis.netPL)}</div><div class="stat-label">Net P/L</div></div>
        <div class="stat-box"><div class="stat-value mono">${fmt(kpis.totalR)}</div><div class="stat-label">Total R</div></div>
        <div class="stat-box"><div class="stat-value mono">${fmt(kpis.winRate, 1)}%</div><div class="stat-label">Win rate</div></div>
        <div class="stat-box"><div class="stat-value mono">${kpis.profitFactor == null ? '∞' : fmt(kpis.profitFactor)}</div><div class="stat-label">Profit factor</div></div>
        <div class="stat-box"><div class="stat-value mono">${fmt(kpis.expectancy)}</div><div class="stat-label">Expectancy R</div></div>
        <div class="stat-box"><div class="stat-value mono">${fmt(kpis.maxDrawdown, 1)}%</div><div class="stat-label">Max DD</div></div>
        <div class="stat-box"><div class="stat-value mono">${fmt(kpis.avgWinR)} / ${fmt(kpis.avgLossR)}</div><div class="stat-label">Avg W / L R</div></div>
        <div class="stat-box"><div class="stat-value mono">${kpis.wins}W / ${kpis.losses}L / ${kpis.breakeven}BE</div><div class="stat-label">Counts</div></div>
      </div>

      <div class="card mb-4">
        <div class="card-title">Equity curve</div>
        <div class="text-accent">${equityCurveSVG(kpis.curve, { hideBalance: hide })}</div>
        <div class="row-between mt-2"><span class="muted">Start</span><span class="mono">${money(kpis.startBalance)}</span></div>
        <div class="row-between"><span class="muted">Equity</span><span class="mono">${money(kpis.equity)}</span></div>
      </div>

      <div class="card mb-4">
        <div class="card-title">Streaks</div>
        <div class="stack-sm">
          <div class="row-between"><span class="muted">Current win / loss</span><span>${streaks.currentWinStreak} / ${streaks.currentLossStreak}</span></div>
          <div class="row-between"><span class="muted">Max win / loss</span><span>${streaks.maxWinStreak} / ${streaks.maxLossStreak}</span></div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-title">Clean vs violated</div>
        <div class="row-between"><span class="muted">Clean P/L · R</span><span class="mono">${money(cleanKPI.netPL)} · ${fmt(cleanKPI.totalR)}R</span></div>
        <div class="row-between"><span class="muted">Violated P/L · R</span><span class="mono">${money(violKPI.netPL)} · ${fmt(violKPI.totalR)}R</span></div>
      </div>

      <div class="card mb-4">
        <div class="card-title">By direction</div>
        ${byDir.map((r) => `<div class="row-between" style="padding:6px 0"><span>${r.key} (${r.count})</span><span class="mono">${money(r.pl)} · ${fmt(r.r)}R</span></div>`).join('') || '<div class="dim">—</div>'}
      </div>
      <div class="card mb-4">
        <div class="card-title">By setup</div>
        ${bySetup.map((r) => `<div class="row-between" style="padding:6px 0"><span>${esc(r.key)} (${r.count})</span><span class="mono">${money(r.pl)}</span></div>`).join('') || '<div class="dim">—</div>'}
      </div>
      <div class="card mb-4">
        <div class="card-title">By emotion</div>
        ${byEmotion.map((r) => `<div class="row-between" style="padding:6px 0"><span>${esc(r.key)} (${r.count})</span><span class="mono">${money(r.pl)}</span></div>`).join('') || '<div class="dim">—</div>'}
      </div>

      <div class="card mb-4">
        <div class="card-title">Calendar</div>
        <div class="row-between mb-4">
          <button class="btn btn-ghost btn-sm" id="cal-prev">‹</button>
          <strong>${monthLabel}</strong>
          <button class="btn btn-ghost btn-sm" id="cal-next">›</button>
        </div>
        <button class="btn btn-ghost btn-sm mb-4" id="cal-today">Today</button>
        <div class="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;font-size:0.75rem">
          ${['S','M','T','W','T','F','S'].map((d) => `<div class="dim" style="text-align:center">${d}</div>`).join('')}
          ${cells.map((c) => {
            if (!c) return '<div></div>';
            const color = c.count === 0 ? 'var(--text-dim)' : c.pl >= 0 ? 'var(--success)' : 'var(--danger)';
            return `<button type="button" class="cal-cell" data-iso="${c.iso}" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:6px 2px;color:${color};min-height:48px;cursor:pointer">
              <div>${c.day}</div>
              ${c.count ? `<div class="mono">${c.count}t</div><div class="mono">${hide ? '' : (c.pl >= 0 ? '+' : '') + (hide ? '' : c.pl.toFixed(0))}</div>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>

      <button class="btn btn-ghost btn-block" id="export-stats">Export stats JSON</button>
    </div>`;

  root.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root._aFilters = { ...filters, range: btn.dataset.range };
      renderAnalytics(root);
    });
  });
  root.querySelector('#a-dir')?.addEventListener('change', (e) => {
    root._aFilters = { ...filters, direction: e.target.value };
    renderAnalytics(root);
  });
  root.querySelector('#a-res')?.addEventListener('change', (e) => {
    root._aFilters = { ...filters, result: e.target.value };
    renderAnalytics(root);
  });
  root.querySelector('#a-clean')?.addEventListener('change', (e) => {
    root._aFilters = { ...filters, cleanOnly: e.target.checked };
    renderAnalytics(root);
  });
  root.querySelector('#cal-prev')?.addEventListener('click', () => {
    cal.m -= 1;
    if (cal.m < 0) { cal.m = 11; cal.y -= 1; }
    renderAnalytics(root);
  });
  root.querySelector('#cal-next')?.addEventListener('click', () => {
    cal.m += 1;
    if (cal.m > 11) { cal.m = 0; cal.y += 1; }
    renderAnalytics(root);
  });
  root.querySelector('#cal-today')?.addEventListener('click', () => {
    const n = new Date();
    cal.y = n.getFullYear();
    cal.m = n.getMonth();
    renderAnalytics(root);
  });
  root.querySelectorAll('.cal-cell').forEach((btn) => {
    btn.addEventListener('click', () => {
      root._calDay = btn.dataset.iso;
      renderAnalytics(root);
    });
  });
  root.querySelector('#export-stats')?.addEventListener('click', () => {
    downloadBlob(JSON.stringify({ kpis, streaks, byDir, bySetup, byEmotion }, null, 2), 'xe3agle-stats.json', 'application/json');
    toast('Stats exported');
  });
}

// ─── PSYCHOLOGY / STATUS / GUIDE ────────────────────
export function renderPsychology(root) {
  const a = getActiveAccount();
  const refs = a.psychology?.reflections || [];
  root.innerHTML = `
    <div class="page">
      <h1>Psychology</h1>
      <div class="card mb-4"><div class="card-title">Discipline reminder</div>
        <p style="color:var(--text);margin:0">Process before impulse. Accept rules. Honor the plan. Review every trade.</p>
      </div>
      <div class="card mb-4"><div class="card-title">End-of-day prompts</div>
        <ul style="color:var(--text);margin:0;padding-left:1.2rem">
          <li>Did I follow my process today?</li>
          <li>Where did emotion interfere?</li>
          <li>One improvement for tomorrow?</li>
        </ul>
      </div>
      <div class="field"><label>Reflection note</label><textarea id="refl-text" placeholder="How did I handle emotions today?"></textarea></div>
      <button class="btn btn-primary mb-4" id="save-refl">Save reflection</button>
      <div class="card"><div class="card-title">Recent reflections</div>
        ${refs.length === 0 ? '<div class="dim">None yet</div>' :
          refs.slice().reverse().slice(0, 10).map((r) => `
            <div style="padding:10px 0;border-bottom:1px solid var(--border)">
              <div class="dim" style="font-size:0.8rem">${(r.at || '').slice(0, 16)}</div>
              <div>${esc(r.text)}</div>
            </div>`).join('')}
      </div>
    </div>`;
  root.querySelector('#save-refl')?.addEventListener('click', () => {
    const text = root.querySelector('#refl-text').value.trim();
    if (!text) return toast('Write something', 'error');
    const psychology = {
      ...(a.psychology || {}),
      reflections: [...(a.psychology?.reflections || []), { text, at: new Date().toISOString() }],
    };
    patchActive({ psychology });
    schedulePush();
    toast('Reflection saved');
    window.dispatchEvent(new CustomEvent('xe3agle:rerender'));
  });
}

export function renderStatus(root) {
  const a = getActiveAccount();
  const gate = canStartTrade({
    preparation: a.preparation,
    analysis: a.analysis,
    activeTrade: a.activeTrade,
    risk: a.risk,
    trades: a.trades,
    equity: a.equity,
  });
  const today = todayISO();
  const todayTrades = (a.trades || []).filter((t) => tradeDay(t) === today);
  const streaks = computeStreaks(a.trades || []);
  root.innerHTML = `
    <div class="page">
      <h1>Status</h1>
      <div class="card mb-4"><div class="card-title">Trading status</div>
        <div class="stack-sm">
          <div class="row-between"><span class="muted">Can trade</span><span class="${gate.allowed ? 'text-success' : 'text-danger'}">${gate.allowed ? 'YES' : 'NO'}</span></div>
          ${gate.reasons.map((r) => `<div class="text-danger" style="font-size:0.9rem">• ${esc(r)}</div>`).join('')}
        </div>
      </div>
      <div class="card mb-4"><div class="card-title">Today's usage</div>
        <div class="stack-sm">
          <div class="row-between"><span class="muted">Trades today</span><span>${todayTrades.length} / ${a.risk.maxTradesPerDay}</span></div>
          <div class="row-between"><span class="muted">Win streak</span><span>${streaks.currentWinStreak}</span></div>
          <div class="row-between"><span class="muted">Loss streak</span><span>${streaks.currentLossStreak}</span></div>
        </div>
      </div>
      <div class="card mb-4"><div class="card-title">Equity snapshot</div>
        <div class="stack-sm">
          <div class="row-between"><span class="muted">Account</span><span>${esc(a.name)}</span></div>
          <div class="row-between"><span class="muted">Start</span><span class="mono">${money(a.startingBalance)}</span></div>
          <div class="row-between"><span class="muted">Equity</span><span class="mono">${money(a.equity)}</span></div>
          <div class="row-between"><span class="muted">Stage</span><span>${a.stage}</span></div>
        </div>
      </div>
      <button class="btn btn-ghost btn-block" id="go-cal">Open calendar (Analytics)</button>
    </div>`;
  root.querySelector('#go-cal')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('xe3agle:navigate', { detail: { stage: 'analytics' } }));
  });
}

export function renderGuide(root) {
  root.innerHTML = `
    <div class="page">
      <h1>Guide</h1>
      <div class="card mb-4"><div class="card-title">Core loop</div>
        <p style="color:var(--text)">Home → Prepare → Analysis → Pre-Trade Check → Active Trade → Post-Trade Review (mandatory) → Journal</p>
      </div>
      <div class="card mb-4"><div class="card-title">What is R?</div>
        <p style="color:var(--text)">R is your risk unit. Risk $50 on a trade: +2R = +$100, −1R = −$50. Position size comes from risk % and stop distance.</p>
      </div>
      <div class="card mb-4"><div class="card-title">Accounts</div>
        <p style="color:var(--text)">Each account has isolated trades, equity, prep, and analysis. Switch in Settings → Accounts.</p>
      </div>
      <div class="card mb-4"><div class="card-title">Calendar & privacy</div>
        <p style="color:var(--text)">Analytics includes a month calendar. Use the eye icon on Home to hide all money amounts (R and counts stay visible).</p>
      </div>
      <div class="card"><div class="card-title">What stops trading?</div>
        <ul style="color:var(--text);margin:0;padding-left:1.2rem">
          <li>Daily max loss / max trades / consecutive losses</li>
          <li>Bias/direction conflict or RR below minimum</li>
          <li>Active trade open or rules/analysis incomplete</li>
        </ul>
      </div>
    </div>`;
}

// ─── SETTINGS ───────────────────────────────────────
export function renderSettings(root) {
  const s = getState();
  const a = getActiveAccount();
  const tab = root._settingsTab || 'Accounts';
  const tabs = ['Accounts', 'Risk', 'Sessions', 'Appearance', 'Data', 'Security'];

  let body = '';
  if (tab === 'Accounts') {
    const accounts = listAccounts({ includeArchived: true });
    body = `
      <div class="field"><label>Active account</label>
        <select id="active-acct">${accounts.filter((x) => !x.archived).map((x) =>
          `<option value="${x.id}" ${x.id === s.activeAccountId ? 'selected' : ''}>${esc(x.name)} (${x.type})</option>`
        ).join('')}</select>
      </div>
      <div class="card mb-4">${accounts.map((x) => `
        <div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <strong>${esc(x.name)}</strong> <span class="dim">${x.type}</span>
            ${x.archived ? '<span class="badge badge-be">Archived</span>' : ''}
            <div class="dim mono" style="font-size:0.8rem">${money(x.equity)}</div>
          </div>
          <div class="row gap-2">
            ${!x.archived && x.id !== s.activeAccountId ? `<button class="btn btn-ghost btn-sm" data-switch="${x.id}">Switch</button>` : ''}
            ${!x.archived ? `<button class="btn btn-ghost btn-sm" data-rename="${x.id}">Rename</button>` : ''}
            ${!x.archived && x.id !== 'main' ? `<button class="btn btn-ghost btn-sm" data-archive="${x.id}">Archive</button>` : ''}
          </div>
        </div>`).join('')}
      </div>
      <h3>Create account</h3>
      <div class="field"><label>Name (required)</label><input id="new-acct-name" placeholder="e.g. Funded Challenge" autocomplete="off"></div>
      <div class="field"><label>Type</label>
        <select id="new-acct-type">${ACCOUNT_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Starting balance</label><input type="number" id="new-acct-bal" value="10000"></div>
      <div class="field"><label>Currency</label><input id="new-acct-ccy" value="USD"></div>
      <div class="field"><label>Broker label (optional)</label><input id="new-acct-broker" placeholder="e.g. FTMO"></div>
      <button class="btn btn-primary mb-4" id="create-acct">Create account</button>
      <h3>Edit active starting balance</h3>
      <div class="field"><label>Starting balance</label><input type="number" id="edit-start" value="${a.startingBalance}"></div>
      <button class="btn btn-ghost btn-block" id="save-start">Save starting balance</button>
    `;
  } else if (tab === 'Risk') {
    const r = a.risk;
    body = `
      <div class="field-row">
        <div class="field"><label>Risk / trade %</label><input type="number" step="0.1" id="r-pct" value="${r.riskPerTradePct}"></div>
        <div class="field"><label>Daily max loss %</label><input type="number" step="0.1" id="r-dloss" value="${r.dailyMaxLossPct}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Daily target R</label><input type="number" step="0.5" id="r-target" value="${r.dailyTargetR}"></div>
        <div class="field"><label>Min RR</label><input type="number" step="0.1" id="r-minrr" value="${r.minRR}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Max trades / day</label><input type="number" id="r-maxtrades" value="${r.maxTradesPerDay}"></div>
        <div class="field"><label>Max consec. losses</label><input type="number" id="r-consec" value="${r.maxConsecutiveLosses}"></div>
      </div>
      <label class="row mb-4"><input type="checkbox" id="r-time" ${r.timeWindowEnabled ? 'checked' : ''}> Trading time window</label>
      <div class="field-row">
        <div class="field"><label>Window start</label><input type="time" id="r-tstart" value="${r.timeWindowStart || '00:00'}"></div>
        <div class="field"><label>Window end</label><input type="time" id="r-tend" value="${r.timeWindowEnd || '23:59'}"></div>
      </div>
      <button class="btn btn-primary" id="save-risk">Save risk rules</button>`;
  } else if (tab === 'Sessions') {
    body = `
      <div class="field"><label>Timezone</label><input id="tz" value="${esc(s.timezone || 'UTC')}"></div>
      <div class="field-row">
        <div class="field"><label>London start</label><input type="time" id="lon-s" value="${s.sessions?.london?.start || '07:00'}"></div>
        <div class="field"><label>London end</label><input type="time" id="lon-e" value="${s.sessions?.london?.end || '16:00'}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>NY start</label><input type="time" id="ny-s" value="${s.sessions?.ny?.start || '12:00'}"></div>
        <div class="field"><label>NY end</label><input type="time" id="ny-e" value="${s.sessions?.ny?.end || '21:00'}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Asia start</label><input type="time" id="as-s" value="${s.sessions?.asia?.start || '00:00'}"></div>
        <div class="field"><label>Asia end</label><input type="time" id="as-e" value="${s.sessions?.asia?.end || '09:00'}"></div>
      </div>
      <button class="btn btn-primary" id="save-sessions">Save sessions</button>`;
  } else if (tab === 'Appearance') {
    body = `
      <div class="field"><label>Theme</label>
        <div class="pills" id="theme-pills">
          <button type="button" class="pill ${s.theme === 'black' ? 'active' : ''}" data-v="black">Black</button>
          <button type="button" class="pill ${s.theme === 'blue' ? 'active' : ''}" data-v="blue">Blue</button>
        </div>
      </div>
      <label class="row mt-4"><input type="checkbox" id="hide-bal" ${s.hideBalance ? 'checked' : ''}> Hide balances (privacy)</label>`;
  } else if (tab === 'Data') {
    body = `
      <button class="btn btn-ghost btn-block mb-4" id="export-backup">Export full backup (JSON)</button>
      <button class="btn btn-danger btn-block" id="delete-local">Delete all local data</button>`;
  } else if (tab === 'Security') {
    body = `
      <div class="field"><label>Current password</label><input type="password" id="cur-pw"></div>
      <div class="field"><label>New password</label><input type="password" id="new-pw"></div>
      <button class="btn btn-primary mb-4" id="change-pw">Change password</button>
      <div class="field"><label>New email</label><input type="email" id="new-email"></div>
      <div class="field"><label>Confirm password</label><input type="password" id="email-pw"></div>
      <button class="btn btn-ghost btn-block mb-4" id="change-email">Change email</button>
      <button class="btn btn-danger btn-block" id="del-account">Delete account</button>
      <button class="btn btn-ghost btn-block mt-4" id="logout">Logout</button>`;
  }

  root.innerHTML = `
    <div class="page">
      <h1>Settings</h1>
      <div class="tabs">${tabs.map((t) => `<button class="tab ${t === tab ? 'active' : ''}" data-tab="${t}">${t}</button>`).join('')}</div>
      ${body}
    </div>`;

  root.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      root._settingsTab = btn.dataset.tab;
      renderSettings(root);
    });
  });

  // Accounts handlers
  root.querySelector('#active-acct')?.addEventListener('change', (e) => {
    try {
      switchAccount(e.target.value);
      toast('Account switched');
      window.dispatchEvent(new CustomEvent('xe3agle:rerender'));
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.querySelectorAll('[data-switch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchAccount(btn.dataset.switch);
      toast('Account switched');
      window.dispatchEvent(new CustomEvent('xe3agle:rerender'));
    });
  });
  root.querySelectorAll('[data-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = prompt('New name');
      if (name == null) return;
      try {
        renameAccount(btn.dataset.rename, name);
        toast('Renamed');
        renderSettings(root);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
  root.querySelectorAll('[data-archive]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Archive this account?')) return;
      try {
        archiveAccount(btn.dataset.archive);
        toast('Archived');
        renderSettings(root);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
  root.querySelector('#create-acct')?.addEventListener('click', () => {
    const name = root.querySelector('#new-acct-name').value.trim();
    if (!name) return toast('Enter an account name', 'error');
    try {
      createAccount({
        name,
        type: root.querySelector('#new-acct-type').value,
        startingBalance: parseFloat(root.querySelector('#new-acct-bal').value) || 10000,
        currency: root.querySelector('#new-acct-ccy').value.trim() || 'USD',
        brokerLabel: root.querySelector('#new-acct-broker').value.trim(),
      });
      toast('Account created');
      schedulePush();
      window.dispatchEvent(new CustomEvent('xe3agle:rerender'));
    } catch (err) {
      toast(err.message || 'Failed', 'error');
    }
  });
  root.querySelector('#save-start')?.addEventListener('click', () => {
    try {
      updateAccountMeta(a.id, { startingBalance: parseFloat(root.querySelector('#edit-start').value) });
      toast('Starting balance updated');
      window.dispatchEvent(new CustomEvent('xe3agle:rerender'));
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  root.querySelector('#save-risk')?.addEventListener('click', () => {
    const risk = {
      ...a.risk,
      riskPerTradePct: parseFloat(root.querySelector('#r-pct').value) || 0.5,
      dailyMaxLossPct: parseFloat(root.querySelector('#r-dloss').value) || 1,
      dailyTargetR: parseFloat(root.querySelector('#r-target').value) || 2,
      maxTradesPerDay: parseInt(root.querySelector('#r-maxtrades').value, 10) || 3,
      maxConsecutiveLosses: parseInt(root.querySelector('#r-consec').value, 10) || 2,
      minRR: parseFloat(root.querySelector('#r-minrr').value) || 2,
      timeWindowEnabled: root.querySelector('#r-time').checked,
      timeWindowStart: root.querySelector('#r-tstart').value,
      timeWindowEnd: root.querySelector('#r-tend').value,
      startingBalance: a.startingBalance,
    };
    patchActive({ risk });
    schedulePush();
    toast('Risk rules saved');
  });

  root.querySelector('#save-sessions')?.addEventListener('click', () => {
    setState({
      timezone: root.querySelector('#tz').value.trim() || 'UTC',
      sessions: {
        london: { start: root.querySelector('#lon-s').value, end: root.querySelector('#lon-e').value },
        ny: { start: root.querySelector('#ny-s').value, end: root.querySelector('#ny-e').value },
        asia: { start: root.querySelector('#as-s').value, end: root.querySelector('#as-e').value },
      },
    });
    schedulePush();
    toast('Sessions saved');
  });

  root.querySelectorAll('#theme-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      setState({ theme: btn.dataset.v });
      document.documentElement.setAttribute('data-theme', btn.dataset.v);
      schedulePush();
      toast('Theme updated');
      window.dispatchEvent(new CustomEvent('xe3agle:rerender'));
    });
  });
  root.querySelector('#hide-bal')?.addEventListener('change', (e) => {
    setState({ hideBalance: e.target.checked });
    schedulePush();
    toast(e.target.checked ? 'Balances hidden' : 'Balances visible');
  });

  root.querySelector('#export-backup')?.addEventListener('click', () => {
    downloadBlob(JSON.stringify(getState(), null, 2), 'xe3agle-backup.json', 'application/json');
    toast('Backup exported');
  });
  root.querySelector('#delete-local')?.addEventListener('click', () => {
    if (!confirm('Delete all local data?')) return;
    localStorage.clear();
    location.reload();
  });

  root.querySelector('#logout')?.addEventListener('click', () => {
    localStorage.removeItem('xe3agle_auth');
    location.href = '/login.html';
  });
  root.querySelector('#change-pw')?.addEventListener('click', async () => {
    try {
      const { api } = await import('../services/api.js');
      await api.changePassword({
        currentPassword: root.querySelector('#cur-pw').value,
        newPassword: root.querySelector('#new-pw').value,
      });
      toast('Password changed');
    } catch (e) {
      toast(e.message || 'Failed', 'error');
    }
  });
  root.querySelector('#change-email')?.addEventListener('click', async () => {
    try {
      const { api } = await import('../services/api.js');
      await api.changeEmail({
        email: root.querySelector('#new-email').value,
        password: root.querySelector('#email-pw').value,
      });
      toast('Email updated');
    } catch (e) {
      toast(e.message || 'Failed', 'error');
    }
  });
  root.querySelector('#del-account')?.addEventListener('click', async () => {
    if (!confirm('Permanently delete your account?')) return;
    try {
      const { api } = await import('../services/api.js');
      await api.deleteAccount({});
      localStorage.clear();
      location.href = '/';
    } catch (e) {
      toast(e.message || 'Failed', 'error');
    }
  });
}
