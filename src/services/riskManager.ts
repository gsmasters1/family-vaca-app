import type { AlpacaAccount, AlpacaPosition } from './alpaca';

export interface RiskSettings {
  maxPositionPct: number;    // % of portfolio per position (default 10)
  stopLossPct: number;       // % below entry to place stop (default 2)
  takeProfitPct: number;     // % above entry to take profit (default 6)
  maxDailyLossPct: number;   // % of portfolio daily loss before halting (default 5)
  maxOpenPositions: number;  // max concurrent open positions (default 10)
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  maxPositionPct: 10,
  stopLossPct: 2,
  takeProfitPct: 6,
  maxDailyLossPct: 5,
  maxOpenPositions: 10,
};

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  qty: number;
  stopPrice?: number;
  takeProfitPrice?: number;
}

export function calculatePositionSize(
  account: AlpacaAccount,
  price: number,
  settings: RiskSettings
): number {
  if (price <= 0) return 0;
  const maxDollar = account.portfolio_value * (settings.maxPositionPct / 100);
  const affordable = Math.min(maxDollar, account.buying_power);
  return Math.floor(affordable / price);
}

export function checkRisk(
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  symbol: string,
  side: 'buy' | 'sell',
  price: number,
  settings: RiskSettings
): RiskCheckResult {
  // Check if trading is blocked at account level
  if (account.trading_blocked || account.account_blocked) {
    return { approved: false, reason: 'Account trading is blocked', qty: 0 };
  }

  if (side === 'sell') {
    const position = positions.find((p) => p.symbol === symbol);
    if (!position) {
      return { approved: false, reason: `No open position in ${symbol} to sell`, qty: 0 };
    }
    return { approved: true, qty: Math.floor(position.qty) };
  }

  // BUY checks
  const openPositions = positions.filter((p) => p.qty > 0);
  if (openPositions.length >= settings.maxOpenPositions) {
    return {
      approved: false,
      reason: `Max open positions reached (${settings.maxOpenPositions})`,
      qty: 0,
    };
  }

  // Already holding this symbol — skip
  const existing = positions.find((p) => p.symbol === symbol && p.qty > 0);
  if (existing) {
    return { approved: false, reason: `Already holding position in ${symbol}`, qty: 0 };
  }

  // Daily loss check (equity vs last_equity)
  const dailyLossPct = ((account.last_equity - account.equity) / account.last_equity) * 100;
  if (dailyLossPct >= settings.maxDailyLossPct) {
    return {
      approved: false,
      reason: `Daily loss limit reached (${dailyLossPct.toFixed(1)}% >= ${settings.maxDailyLossPct}%)`,
      qty: 0,
    };
  }

  const qty = calculatePositionSize(account, price, settings);
  if (qty < 1) {
    return {
      approved: false,
      reason: `Insufficient buying power for even 1 share of ${symbol} at $${price.toFixed(2)}`,
      qty: 0,
    };
  }

  const stopPrice = parseFloat((price * (1 - settings.stopLossPct / 100)).toFixed(2));
  const takeProfitPrice = parseFloat((price * (1 + settings.takeProfitPct / 100)).toFixed(2));

  return { approved: true, qty, stopPrice, takeProfitPrice };
}

export interface ExitCheckResult {
  exit: boolean;
  reason: string;
}

export function shouldExitPosition(
  position: AlpacaPosition,
  settings: RiskSettings
): ExitCheckResult {
  const plPct = position.unrealized_plpc;

  if (plPct <= -settings.stopLossPct) {
    return {
      exit: true,
      reason: `Stop-loss triggered: ${plPct.toFixed(2)}% loss (limit: -${settings.stopLossPct}%)`,
    };
  }

  if (plPct >= settings.takeProfitPct) {
    return {
      exit: true,
      reason: `Take-profit triggered: +${plPct.toFixed(2)}% gain (target: +${settings.takeProfitPct}%)`,
    };
  }

  return { exit: false, reason: '' };
}
