/**
 * Stop-Loss Position Monitor
 *
 * Runs every 5 minutes during market hours.
 * Checks all open Alpaca positions against their stored stop-loss levels.
 * If price ≤ stop, closes the position immediately and sends a Telegram alert.
 *
 * This is the EXIT side of the trading engine — just as important as entries.
 */

import { getDb } from "./database";
import { getSetting } from "./appConfig";
import { alertStopLossTriggered } from "./telegramService";

interface TradeLogEntry {
  symbol: string;
  stop_loss: number;
  entry_price: number;
  qty: number;
  order_id: string;
}

export async function checkStopLosses(): Promise<void> {
  if (getSetting("trading_kill_switch") === "true") return;
  if (getSetting("trading_enabled") !== "true") return;

  const db = getDb();
  const isPaper = getSetting("trading_paper_mode") !== "false";

  // Get most recent BUY log entries that don't have a corresponding SELL
  const openTrades = db
    .prepare(
      `SELECT tl.symbol, tl.stop_loss, tl.entry_price, tl.qty, tl.order_id
       FROM trade_log tl
       WHERE tl.action = 'BUY' AND tl.result = 'executed'
         AND tl.symbol NOT IN (
           SELECT symbol FROM trade_log
           WHERE action = 'SELL' AND result = 'executed'
             AND executed_at > tl.executed_at
         )
       ORDER BY tl.executed_at DESC`
    )
    .all() as TradeLogEntry[];

  if (openTrades.length === 0) return;

  // Get current prices
  const { getQuotes } = require("./marketData") as { getQuotes: (symbols: string[]) => Promise<Array<{ symbol: string; price: number }>> };
  const symbols = [...new Set(openTrades.map((t) => t.symbol))];
  const quotes = await getQuotes(symbols).catch(() => []);
  const priceMap = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));

  for (const trade of openTrades) {
    const currentPrice = priceMap[trade.symbol];
    if (!currentPrice || !trade.stop_loss) continue;

    if (currentPrice <= trade.stop_loss) {
      console.log(
        `[StopLoss] ${trade.symbol} at $${currentPrice} ≤ stop $${trade.stop_loss} — closing`
      );

      // Execute close via Alpaca
      try {
        const { alpacaClient } = require("./alpacaService") as { alpacaClient: { post: (path: string, body: Record<string, unknown>) => Promise<void> } };
        await alpacaClient.post(`/v2/orders`, {
          symbol: trade.symbol,
          qty: Math.abs(trade.qty),
          side: "sell",
          type: "market",
          time_in_force: "day",
        });
      } catch (err) {
        console.error(`[StopLoss] Failed to close ${trade.symbol}:`, err);
      }

      // Log the stop-loss exit
      db.prepare(
        `INSERT INTO trade_log (symbol, action, result, reason, entry_price, stop_loss, qty, regime)
         VALUES (?, 'SELL', 'executed', 'stop_loss_triggered', ?, ?, ?, 'MONITOR')`
      ).run(trade.symbol, currentPrice, trade.stop_loss, trade.qty);

      // Alert via Telegram
      await alertStopLossTriggered({
        symbol: trade.symbol,
        currentPrice,
        stopLoss: trade.stop_loss,
        paper: isPaper,
      });
    }
  }
}
