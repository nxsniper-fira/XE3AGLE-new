/** Money display helper — respects hideBalance */

import { getState, formatMoney } from '../domain/state.js';

export function money(n) {
  return formatMoney(n, !!getState().hideBalance);
}

export function fmt(n, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
