import yahooFinance from "yahoo-finance2";
import { getDb } from "./database";
import { getSetting } from "./appConfig";

export interface ProfitRules {
  takeProfitTiers: { gainPct: number; sellPct: number }[];
  trailingStopPct: number;
  reservePct: number;
  maxDrawdownBeforeHalt: number;
  doubleDownThreshold: number;
}

export interface TakeProfitAction {
  symbol: string;
  currentPrice: number;
  avgCost: number;
  gainPct: number;
  triggeredTier: { gainPct: number; sellPct: number };
  shares: number;
  sharesToSell: number;
}

export function getProfitRules(): ProfitRules {
  const tiersRaw =
    getSetting("profit_take_tiers") ??
    '[{"gainPct":20,"sellPct":25},{"gainPct":40,"sellPct":25},{"gainPct":60,"sellPct":100}]';
  const trailingStop = parseFloat(getSetting("profit_trailing_stop_pct") ?? "8");
  const reservePct = parseFloat(getSetting("profit_reserve_pct") ?? "30");
  const maxDrawdown = parseFloat(getSetting("profit_max_drawdown_halt") ?? "15");
  const doubleDown = parseFloat(getSetting("profit_double_down_threshold") ?? "-10");

  let takeProfitTiers: { gainPct: number; sellPct: number }[] = [];
  try {
    takeProfitTiers = JSON.parse(tiersRaw);
  } catch {
    takeProfitTiers = [
      { gainPct: 20, sellPct: 25 },
      { gainPct: 40, sellPct: 25 },
      { gainPct: 60, sellPct: 100 },
    ];
  }

  return {
    takeProfitTiers,
    trailingStopPct: isNaN(trailingStop) ? 8 : trailingStop,
    reservePct: isNaN(reservePct) ? 30 : reservePct,
    maxDrawdownBeforeHalt: isNaN(maxDrawdown) ? 15 : maxDrawdown,
    doubleDownThreshold: isNaN(doubleDown) ? -10 : doubleDown,
  };
}

export async function checkTakeProfitTriggers(): Promise<TakeProfitAction[]> {
  const db = getDb();
  const rules = getProfitRules();
  const actions: TakeProfitAction[] = [];

  let positions: Array<{ symbol: string; shares: number; avg_cost: number }> = [];
  try {
    positions = db
      .prepare(
        "SELECT symbol, SUM(shares) as shares, AVG(avg_cost) as avg_cost FROM portfolio_positions GROUP BY symbol"
      )
      .all() as Array<{ symbol: string; shares: number; avg_cost: number }>;
  } catch {
    return [];
  }

  await Promise.allSettled(
    positions.map(async (pos) => {
      if (pos.avg_cost <= 0 || pos.shares <= 0) return;

      let currentPrice = 0;
      try {
        const quote = await yahooFinance.quote(pos.symbol);
        currentPrice = quote.regularMarketPrice ?? 0;
      } catch {
        return;
      }

      if (currentPrice <= 0) return;

      const gainPct = ((currentPrice - pos.avg_cost) / pos.avg_cost) * 100;

      // Find the highest triggered tier
      const triggeredTiers = rules.takeProfitTiers.filter(
        (tier) => gainPct >= tier.gainPct
      );
      if (triggeredTiers.length === 0) return;

      const triggeredTier = triggeredTiers[triggeredTiers.length - 1];
      const sharesToSell = Math.floor(pos.shares * (triggeredTier.sellPct / 100));

      if (sharesToSell <= 0) return;

      actions.push({
        symbol: pos.symbol,
        currentPrice,
        avgCost: pos.avg_cost,
        gainPct,
        triggeredTier,
        shares: pos.shares,
        sharesToSell,
      });
    })
  );

  return actions;
}

export async function recordReserveAllocation(
  realizedGainAmount: number,
  sourceSymbol: string
): Promise<void> {
  const db = getDb();
  const rules = getProfitRules();
  const reservedAmount = realizedGainAmount * (rules.reservePct / 100);

  try {
    db.prepare(
      `INSERT INTO profit_reserve (source_symbol, realized_gain, reserved_amount, recorded_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(sourceSymbol, realizedGainAmount, reservedAmount);
  } catch {
    // Non-fatal
  }
}

export async function getReserveSummary(): Promise<{
  totalReserved: number;
  totalRealized: number;
  reservePct: number;
}> {
  const db = getDb();
  const rules = getProfitRules();

  try {
    const row = db
      .prepare(
        "SELECT COALESCE(SUM(reserved_amount), 0) as totalReserved, COALESCE(SUM(realized_gain), 0) as totalRealized FROM profit_reserve"
      )
      .get() as { totalReserved: number; totalRealized: number } | undefined;

    return {
      totalReserved: row?.totalReserved ?? 0,
      totalRealized: row?.totalRealized ?? 0,
      reservePct: rules.reservePct,
    };
  } catch {
    return { totalReserved: 0, totalRealized: 0, reservePct: rules.reservePct };
  }
}
