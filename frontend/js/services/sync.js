/** Cloud sync with conflict UI support */

import { api } from './api.js';
import {
  getState,
  replaceState,
  getAuth,
  setCloudVersion,
  getCloudVersion,
} from '../domain/state.js';

let syncing = false;
let pendingConflict = null;

export function getPendingConflict() {
  return pendingConflict;
}

export function clearConflict() {
  pendingConflict = null;
}

export async function pullState() {
  const auth = getAuth();
  if (!auth?.token) return null;
  try {
    const accountId = getState().activeAccountId || 'main';
    const res = await api.getState(accountId);
    if (res.state) {
      setCloudVersion(res.version || 0);
      return res;
    }
    return null;
  } catch (e) {
    console.warn('Pull failed', e);
    return null;
  }
}

export async function pushState({ force = false } = {}) {
  const auth = getAuth();
  if (!auth?.token) return { ok: false, reason: 'not_logged_in' };
  if (syncing) return { ok: false, reason: 'busy' };
  syncing = true;
  try {
    const state = getState();
    const accountId = state.activeAccountId || 'main';
    const res = await api.putState({
      accountId,
      state,
      version: getCloudVersion(),
      clientModifiedAt: state.clientModifiedAt || new Date().toISOString(),
      force,
    });
    setCloudVersion(res.version || getCloudVersion() + 1);
    pendingConflict = null;
    return { ok: true, version: res.version };
  } catch (e) {
    if (e.status === 409 && e.data?.conflict) {
      pendingConflict = {
        serverState: e.data.serverState,
        serverVersion: e.data.serverVersion,
      };
      return { ok: false, reason: 'conflict', conflict: pendingConflict };
    }
    console.warn('Push failed', e);
    return { ok: false, reason: e.message };
  } finally {
    syncing = false;
  }
}

/** Resolve conflict: keep local or take cloud */
export async function resolveConflict(choice) {
  if (!pendingConflict) return;
  if (choice === 'cloud') {
    replaceState(pendingConflict.serverState);
    setCloudVersion(pendingConflict.serverVersion || 0);
    pendingConflict = null;
    return { ok: true };
  }
  // keep local — force push
  pendingConflict = null;
  return pushState({ force: true });
}

/** Boot: pull if logged in, merge carefully */
export async function bootSync() {
  const auth = getAuth();
  if (!auth?.token) return;
  const remote = await pullState();
  if (!remote?.state) {
    // Seed cloud with local
    await pushState({ force: true });
    return;
  }
  const local = getState();
  const localMod = local.clientModifiedAt ? new Date(local.clientModifiedAt).getTime() : 0;
  const remoteMod = remote.clientModifiedAt
    ? new Date(remote.clientModifiedAt).getTime()
    : 0;

  // If remote newer and local empty-ish, take remote
  if (remoteMod > localMod) {
    replaceState(remote.state);
    setCloudVersion(remote.version || 0);
  } else if (localMod > remoteMod) {
    await pushState({ force: false });
  } else {
    setCloudVersion(remote.version || 0);
  }
}

/** Debounced auto-push after local changes */
let pushTimer = null;
export function schedulePush(delayMs = 1500) {
  if (!getAuth()?.token) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushState().then((r) => {
      if (r.reason === 'conflict') {
        window.dispatchEvent(new CustomEvent('xe3agle:conflict', { detail: r.conflict }));
      }
    });
  }, delayMs);
}
