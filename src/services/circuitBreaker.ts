import type { AlpacaAccount, AlpacaOrder } from './alpaca';

export interface CircuitBreakerSettings {
  dailyLossPct: number;          // halt if portfolio down this % today (default 3)
  consecutiveLosses: number;     // halt after N losing trades in a row (default 3)
  cooldownMinutes: number;       // minimum minutes between trips before auto-trade can resume manually (default 60)
  haltedActions: 'block_buys' | 'block_all';  // what to do when tripped (default block_buys — sells still allowed)
}

export const DEFAULT_BREAKER_SETTINGS: CircuitBreakerSettings = {
  dailyLossPct: 3,
  consecutiveLosses: 3,
  cooldownMinutes: 60,
  haltedActions: 'block_buys',
};

export interface CircuitBreakerState {
  tripped: boolean;
  trippedAt: string | null;       // ISO timestamp
  reason: string | null;
  recentTradePLs: number[];       // last 10 closed-trade P&L %s, newest first
  trippedToday: number;           // how many times the breaker has tripped today
  lastResetDate: string | null;   // YYYY-MM-DD of last manual reset
}

const STORAGE_KEY = 'tradingCircuitBreaker.v1';

export function loadBreakerState(): CircuitBreakerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultBreakerState();
    const parsed = JSON.parse(raw) as CircuitBreakerState;
    // Auto-reset daily counter if it's a new day
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.lastResetDate !== today) {
      parsed.trippedToday = 0;
    }
    return parsed;
  } catch {
    return defaultBreakerState();
  }
}

export function saveBreakerState(state: CircuitBreakerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function defaultBreakerState(): CircuitBreakerState {
  return {
    tripped: false,
    trippedAt: null,
    reason: null,
    recentTradePLs: [],
    trippedToday: 0,
    lastResetDate: null,
  };
}

export interface BreakerCheckInput {
  account: AlpacaAccount;
  settings: CircuitBreakerSettings;
  prevState: CircuitBreakerState;
}

export interface BreakerCheckResult {
  state: CircuitBreakerState;
  newlyTripped: boolean;
  tripReason: string | null;
}

export function evaluateBreaker(input: BreakerCheckInput): BreakerCheckResult {
  const { account, settings, prevState } = input;
  let { tripped, trippedAt, reason, recentTradePLs, trippedToday, lastResetDate } = prevState;
  let newlyTripped = false;
  let tripReason: string | null = null;

  // Already tripped — stay tripped (manual reset required)
  if (tripped) {
    return { state: prevState, newlyTripped: false, tripReason: null };
  }

  // 1) Daily loss check
  if (account.last_equity > 0) {
    const dailyLossPct = ((account.last_equity - account.equity) / account.last_equity) * 100;
    if (dailyLossPct >= settings.dailyLossPct) {
      tripped = true;
      newlyTripped = true;
      tripReason = `Daily loss ${dailyLossPct.toFixed(2)}% reached limit of ${settings.dailyLossPct}%`;
    }
  }

  // 2) Consecutive losses check
  if (!tripped && recentTradePLs.length >= settings.consecutiveLosses) {
    const lastN = recentTradePLs.slice(0, settings.consecutiveLosses);
    if (lastN.every((p) => p < 0)) {
      tripped = true;
      newlyTripped = true;
      tripReason = `${settings.consecutiveLosses} consecutive losing trades`;
    }
  }

  if (newlyTripped) {
    trippedAt = new Date().toISOString();
    reason = tripReason;
    trippedToday += 1;
    lastResetDate = lastResetDate || new Date().toISOString().slice(0, 10);
  }

  const newState: CircuitBreakerState = {
    tripped,
    trippedAt,
    reason,
    recentTradePLs,
    trippedToday,
    lastResetDate,
  };

  return { state: newState, newlyTripped, tripReason };
}

export function recordTradeOutcome(
  state: CircuitBreakerState,
  plPct: number
): CircuitBreakerState {
  return {
    ...state,
    recentTradePLs: [plPct, ...state.recentTradePLs].slice(0, 10),
  };
}

export function resetBreaker(state: CircuitBreakerState): CircuitBreakerState {
  return {
    ...state,
    tripped: false,
    trippedAt: null,
    reason: null,
    lastResetDate: new Date().toISOString().slice(0, 10),
  };
}

export function canResume(state: CircuitBreakerState, settings: CircuitBreakerSettings): {
  ok: boolean;
  waitMs: number;
} {
  if (!state.trippedAt) return { ok: true, waitMs: 0 };
  const trippedTime = new Date(state.trippedAt).getTime();
  const cooldownMs = settings.cooldownMinutes * 60_000;
  const elapsed = Date.now() - trippedTime;
  if (elapsed >= cooldownMs) return { ok: true, waitMs: 0 };
  return { ok: false, waitMs: cooldownMs - elapsed };
}

export function isBuyBlocked(state: CircuitBreakerState, settings: CircuitBreakerSettings): boolean {
  return state.tripped;
}

export function isSellBlocked(state: CircuitBreakerState, settings: CircuitBreakerSettings): boolean {
  return state.tripped && settings.haltedActions === 'block_all';
}

export async function onCircuitTripped(
  cancelAllOrders: () => Promise<void>
): Promise<void> {
  try {
    await cancelAllOrders();
  } catch {
    // best-effort cleanup
  }
}
