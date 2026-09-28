/** XE3AGLE app shell — nav, routing, boot */

import { icons } from './ui/icons.js';
import { getState, setState, getAuth, subscribe, getActiveAccount } from './domain/state.js';
import { STAGES } from './domain/constants.js';
import { resolveTradeStep, goTo } from './workflow/trade.js';
import { bootSync, schedulePush, resolveConflict, getPendingConflict } from './services/sync.js';
import {
  renderHome,
  renderPrepare,
  renderAnalysis,
  renderPreTrade,
  renderActive,
  renderReview,
  renderJournal,
  renderAnalytics,
  renderPsychology,
  renderStatus,
  renderGuide,
  renderSettings,
} from './ui/pages.js';
import { toast } from './ui/toast.js';

const ROUTES = {
  [STAGES.HOME]: renderHome,
  [STAGES.PREPARE]: renderPrepare,
  [STAGES.ANALYSIS]: renderAnalysis,
  [STAGES.PRETRADE]: renderPreTrade,
  [STAGES.ACTIVE]: renderActive,
  [STAGES.REVIEW]: renderReview,
  journal: renderJournal,
  analytics: renderAnalytics,
  psychology: renderPsychology,
  status: renderStatus,
  guide: renderGuide,
  settings: renderSettings,
};

let currentView = STAGES.HOME;
let mainEl = null;

function applyTheme() {
  const theme = getState().theme || 'black';
  document.documentElement.setAttribute('data-theme', theme);
}

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-logo">XE3AGLE</div>
      <div class="sidebar-group">
        <div class="sidebar-group-title">Session</div>
        <button class="sidebar-link" data-view="home">${icons.home} Home</button>
        <button class="sidebar-link" data-view="prepare">${icons.prepare} Prepare</button>
        <button class="sidebar-link" data-view="analysis">${icons.analysis} Analysis</button>
        <button class="sidebar-link" data-view="pretrade">${icons.check} Pre-Trade</button>
        <button class="sidebar-link" data-view="active">${icons.trade} Active Trade</button>
      </div>
      <div class="sidebar-group">
        <div class="sidebar-group-title">Review</div>
        <button class="sidebar-link" data-view="journal">${icons.journal} Journal</button>
        <button class="sidebar-link" data-view="analytics">${icons.analytics} Analytics</button>
        <button class="sidebar-link" data-view="psychology">${icons.psych} Psychology</button>
        <button class="sidebar-link" data-view="status">${icons.status} Status</button>
      </div>
      <div class="sidebar-group">
        <div class="sidebar-group-title">System</div>
        <button class="sidebar-link" data-view="settings">${icons.settings} Settings</button>
        <button class="sidebar-link" data-view="guide">${icons.guide} Guide</button>
      </div>
    </aside>

    <main class="main-content" id="main"></main>

    <nav class="bottom-nav" id="bottom-nav">
      <button data-nav="home">${icons.home}<span>Home</span></button>
      <button data-nav="trade">${icons.trade}<span>Trade</span></button>
      <button data-nav="journal">${icons.journal}<span>Journal</span></button>
      <button data-nav="analytics">${icons.analytics}<span>Analytics</span></button>
      <button data-nav="more">${icons.more}<span>More</span></button>
    </nav>

    <div class="sheet-backdrop" id="sheet-backdrop"></div>
    <div class="sheet" id="more-sheet">
      <div class="sheet-handle"></div>
      <button class="sheet-item" data-view="prepare">${icons.prepare} Prepare</button>
      <button class="sheet-item" data-view="analysis">${icons.analysis} Analysis</button>
      <button class="sheet-item" data-view="pretrade">${icons.check} Pre-Trade</button>
      <button class="sheet-item" data-view="psychology">${icons.psych} Psychology</button>
      <button class="sheet-item" data-view="status">${icons.status} Status</button>
      <button class="sheet-item" data-view="settings">${icons.settings} Settings</button>
      <button class="sheet-item" data-view="guide">${icons.guide} Guide</button>
      <button class="sheet-item" data-view="analytics">${icons.analytics} Stats</button>
    </div>

    <div id="conflict-root"></div>
  `;

  mainEl = document.getElementById('main');

  // Bottom nav
  document.getElementById('bottom-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    const nav = btn.dataset.nav;
    if (nav === 'more') {
      openSheet(true);
      return;
    }
    if (nav === 'trade') {
      navigate(resolveTradeStep());
      return;
    }
    navigate(nav);
  });

  // Sidebar
  document.getElementById('sidebar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    navigate(btn.dataset.view);
  });

  // Sheet
  document.getElementById('sheet-backdrop').addEventListener('click', () => openSheet(false));
  document.getElementById('more-sheet').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    openSheet(false);
    navigate(btn.dataset.view);
  });
}

function openSheet(open) {
  const backdrop = document.getElementById('sheet-backdrop');
  const sheet = document.getElementById('more-sheet');
  if (!backdrop || !sheet) return;
  backdrop.classList.toggle('open', open);
  sheet.classList.toggle('open', open);
  document.body.classList.toggle('sheet-open', open);
  // Prevent background scroll while sheet is open (mobile)
  document.body.style.overflow = open ? 'hidden' : '';
}

function navigate(view) {
  currentView = view;
  // Sync stage for workflow views
  if (Object.values(STAGES).includes(view)) {
    setState({ stage: view }, { silent: true });
  }
  renderView();
  updateNavActive();
  window.scrollTo(0, 0);
}

function renderView() {
  const renderer = ROUTES[currentView] || renderHome;
  renderer(mainEl);
}

function updateNavActive() {
  const bottomMap = {
    home: 'home',
    prepare: 'trade',
    analysis: 'trade',
    pretrade: 'trade',
    active: 'trade',
    review: 'trade',
    journal: 'journal',
    analytics: 'analytics',
  };
  const activeNav = bottomMap[currentView] || null;
  document.querySelectorAll('#bottom-nav [data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === activeNav);
  });
  document.querySelectorAll('#sidebar [data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === currentView);
  });
}

function showConflictUI(conflict) {
  const root = document.getElementById('conflict-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Sync conflict</h2>
        <p>Local and cloud data differ. Choose which to keep.</p>
        <button class="btn btn-primary mb-4" id="keep-local">Keep local</button>
        <button class="btn btn-ghost btn-block" id="keep-cloud">Use cloud</button>
      </div>
    </div>
  `;
  root.querySelector('#keep-local').onclick = async () => {
    await resolveConflict('local');
    root.innerHTML = '';
    toast('Kept local data');
    renderView();
  };
  root.querySelector('#keep-cloud').onclick = async () => {
    await resolveConflict('cloud');
    root.innerHTML = '';
    toast('Loaded cloud data');
    renderView();
  };
}

async function boot() {
  // Auth gate
  const auth = getAuth();
  if (!auth?.token) {
    // Allow offline use without account — but prefer login
    // For production flow: redirect if you want forced auth
    // location.href = '/login.html';
  }

  applyTheme();
  renderShell();

  // Boot from active account stage
  const s = getState();
  const acct = getActiveAccount();
  currentView = acct.stage || STAGES.HOME;
  if (acct.pendingReview) currentView = STAGES.REVIEW;
  else if (acct.activeTrade) currentView = STAGES.ACTIVE;

  renderView();
  updateNavActive();

  // Events
  window.addEventListener('xe3agle:navigate', (e) => {
    navigate(e.detail.stage);
  });
  window.addEventListener('xe3agle:rerender', () => {
    applyTheme();
    renderView();
  });
  window.addEventListener('xe3agle:conflict', (e) => {
    showConflictUI(e.detail);
  });

  subscribe(() => {
    schedulePush();
  });

  // Cloud sync — after merge, re-resolve view from authoritative state
  if (auth?.token) {
    try {
      await bootSync();
      const after = getActiveAccount();
      if (after.pendingReview) currentView = STAGES.REVIEW;
      else if (after.activeTrade) currentView = STAGES.ACTIVE;
      else if (Object.values(STAGES).includes(after.stage)) currentView = after.stage;
      applyTheme();
      renderView();
      updateNavActive();
    } catch (e) {
      console.warn('Boot sync failed', e);
    }
  }
}

boot();
