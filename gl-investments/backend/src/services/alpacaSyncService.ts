import {
  getPositions,
  getFilledOrders,
  getAccount,
  AlpacaPosition,
} from "./alpacaService";
import { getDb } from "./database";
import { getSetting } from "./appConfig";

export interface ClosedPosition {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  returnPct: number;
  closedAt: string;
  reason: string;
}

export interface AlpacaPortfolioSummary {
  totalValue: number;
  cash: number;
  buyingPower: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
  dayPL: number;
  positions: {
    symbol: string;
    qty: number;
    avgEntryPrice: number;
    currentPrice: number;
    marketValue: number;
    unrealizedPL: number;
    unrealizedPLPct: number;
  }[];
}

function isApexExecutedSymbol(symbol: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM trade_log
       WHERE symbol = ? AND action = 'BUY' AND result = 'executed'`
    )
    .get(symbol) as { cnt: number };
  return row.cnt > 0;
}

export async function syncPositionsFromAlpaca(): Promise<void> {
  const db = getDb();
  let alpacaPositions: AlpacaPosition[] = [];

  try {
    alpacaPositions = await getPositions();
  } catch (err) {
    console.error("[AlpacaSync] Failed to fetch positions:", err);
    return;
  }

  const alpacaSymbols = new Set(alpacaPositions.map((p) => p.symbol));

  for (const pos of alpacaPositions) {
    if (!isApexExecutedSymbol(pos.symbol)) continue;

    try {
      db.prepare(
        `INSERT OR REPLACE INTO portfolio_positions (symbol, name, asset_type, shares, avg_cost)
         VALUES (?, ?, 'stock', ?, ?)`
      ).run(
        pos.symbol,
        pos.symbol,
        parseFloat(pos.qty),
        parseFloat(pos.avg_entry_price)
      );
    } catch (err) {
      console.error(`[AlpacaSync] Failed to upsert position ${pos.symbol}:`, err);
    }
  }

  // Remove positions we no longer hold at Alpaca (APEX-executed only)
  const localRows = db
    .prepare("SELECT symbol FROM portfolio_positions")
    .all() as Array<{ symbol: string }>;

  for (const row of localRows) {
    if (!alpacaSymbols.has(row.symbol) && isApexExecutedSymbol(row.symbol)) {
      try {
        db.prepare("DELETE FROM portfolio_positions WHERE symbol = ?").run(row.symbol);
      } catch (err) {
        console.error(`[AlpacaSync] Failed to remove closed position ${row.symbol}:`, err);
      }
    }
  }
}

export async function detectClosedPositions(): Promise<ClosedPosition[]> {
  const db = getDb();

  // All APEX-executed BUY symbols that have no corresponding SELL in trade_log
  const openBuys = db
    .prepare(
      `SELECT symbol, entry_price, qty, executed_at FROM trade_log
       WHERE action = 'BUY' AND result = 'executed'
         AND symbol NOT IN (
           SELECT symbol FROM trade_log
           WHERE action = 'SELL' AND result = 'executed'
         )
       GROUP BY symbol
       ORDER BY executed_at DESC`
    )
    .all() as Array<{
      symbol: string;
      entry_price: number;
      qty: number;
      executed_at: string;
    }>;

  if (openBuys.length === 0) return [];

  let alpacaPositions: AlpacaPosition[] = [];
  try {
    alpacaPositions = await getPositions();
  } catch (err) {
    console.error("[AlpacaSync] Failed to fetch positions for closure detection:", err);
    return [];
  }

  const heldSymbols = new Set(alpacaPositions.map((p) => p.symbol));

  const closed: ClosedPosition[] = [];

  for (const buy of openBuys) {
    if (heldSymbols.has(buy.symbol)) continue;

    // Alpaca no longer holds this — find the fill in closed orders
    let exitPrice = 0;
    let closedAt = new Date().toISOString();
    let reason = "stop_or_target_hit";

    try {
      const filledOrders = await getFilledOrders(buy.executed_at);
      const sellFill = filledOrders.find(
        (o) =>
          o.symbol === buy.symbol &&
          o.side === "sell" &&
          o.filled_avg_price != null
      );

      if (sellFill) {
        exitPrice = parseFloat(sellFill.filled_avg_price ?? "0");
        closedAt = sellFill.filled_at ?? closedAt;
        reason =
          exitPrice < buy.entry_price ? "stop_loss_hit" : "take_profit_hit";
      }
    } catch (err) {
      console.warn(`[AlpacaSync] Could not fetch filled orders for ${buy.symbol}:`, err);
    }

    if (exitPrice === 0) continue;

    const returnPct =
      ((exitPrice - buy.entry_price) / buy.entry_price) * 100;

    // Record closure in trade_log
    try {
      db.prepare(
        `INSERT INTO trade_log
           (symbol, action, result, reason, apex_score, conviction, qty,
            entry_price, stop_loss, target, position_size_pct,
            order_id, claude_approved, claude_reason, regime)
         VALUES (?, 'SELL', 'executed', ?, 0, 0, ?, ?, 0, 0, 0, '', 1, 'Alpaca auto-close detected', '')`
      ).run(buy.symbol, reason, buy.qty, exitPrice);
    } catch (err) {
      console.error(`[AlpacaSync] Failed to log closure for ${buy.symbol}:`, err);
    }

    const closedPos: ClosedPosition = {
      symbol: buy.symbol,
      entryPrice: buy.entry_price,
      exitPrice,
      qty: buy.qty,
      returnPct,
      closedAt,
      reason,
    };
    closed.push(closedPos);

    // Record outcome for learning service
    try {
      const { recordTradeOutcome } = require("./learningService");
      await recordTradeOutcome({
        symbol: buy.symbol,
        entryDate: buy.executed_at,
        exitDate: closedAt,
        entryPrice: buy.entry_price,
        exitPrice,
        momentumScore: 0,
        technicalScore: 0,
        congressScore: 0,
        macroScore: 0,
        valueScore: 0,
      });
    } catch (err) {
      console.warn(`[AlpacaSync] recordTradeOutcome failed for ${buy.symbol}:`, err);
    }

    // Reserve allocation on profitable closes
    if (returnPct > 0) {
      try {
        const { recordReserveAllocation } = require("./profitManagementService");
        const gain = (exitPrice - buy.entry_price) * buy.qty;
        await recordReserveAllocation(gain, buy.symbol);
      } catch (err) {
        console.warn(`[AlpacaSync] recordReserveAllocation failed for ${buy.symbol}:`, err);
      }
    }

    // Telegram alert
    try {
      const { alertStopLossTriggered, alertTradeExecuted } =
        require("./telegramService");
      if (reason === "stop_loss_hit") {
        await alertStopLossTriggered({
          symbol: buy.symbol,
          currentPrice: exitPrice,
          stopPrice: exitPrice,
          lossPercent: Math.abs(returnPct),
        });
      } else {
        await alertTradeExecuted({
          symbol: buy.symbol,
          action: "SELL",
          qty: buy.qty,
          price: exitPrice,
          stopLoss: 0,
          target: 0,
          apexScore: 0,
          reason,
          paper: getSetting("trading_paper_mode") !== "false",
        });
      }
    } catch {
      // Telegram alerts are non-fatal
    }
  }

  return closed;
}

export async function runFullAlpacaSync(): Promise<void> {
  const db = getDb();

  await syncPositionsFromAlpaca();

  const closures = await detectClosedPositions();
  if (closures.length > 0) {
    console.log(`[AlpacaSync] Detected ${closures.length} newly closed position(s):`, closures.map((c) => c.symbol));
  }

  // Record today's equity snapshot
  try {
    const account = await getAccount();
    const equity = parseFloat(account.equity);
    const today = new Date().toISOString().split("T")[0];

    db.prepare(
      `INSERT OR REPLACE INTO daily_equity (date, starting_equity, recorded_at)
       VALUES (?, ?, datetime('now'))`
    ).run(today, equity);
  } catch (err) {
    console.error("[AlpacaSync] Failed to record daily equity:", err);
  }

  console.log("[AlpacaSync] Full sync complete");
}

export async function getAlpacaPortfolioSummary(): Promise<AlpacaPortfolioSummary> {
  const [account, positions] = await Promise.all([
    getAccount(),
    getPositions(),
  ]);

  const totalValue = parseFloat(account.portfolio_value || account.equity);
  const cash = parseFloat(account.cash);
  const buyingPower = parseFloat(account.buying_power);

  const mappedPositions = positions.map((p) => {
    const qty = parseFloat(p.qty);
    const avgEntryPrice = parseFloat(p.avg_entry_price);
    const currentPrice = parseFloat(p.current_price);
    const marketValue = parseFloat(p.market_value);
    const unrealizedPL = parseFloat(p.unrealized_pl);
    const unrealizedPLPct = parseFloat(p.unrealized_plpc) * 100;

    return {
      symbol: p.symbol,
      qty,
      avgEntryPrice,
      currentPrice,
      marketValue,
      unrealizedPL,
      unrealizedPLPct,
    };
  });

  const unrealizedPL = mappedPositions.reduce((sum, p) => sum + p.unrealizedPL, 0);
  const totalCost = mappedPositions.reduce(
    (sum, p) => sum + p.avgEntryPrice * p.qty,
    0
  );
  const unrealizedPLPct = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;

  // day P&L: not returned directly by account endpoint for all modes; best-effort
  const dayPL = unrealizedPL;

  return {
    totalValue,
    cash,
    buyingPower,
    unrealizedPL,
    unrealizedPLPct,
    dayPL,
    positions: mappedPositions,
  };
}
