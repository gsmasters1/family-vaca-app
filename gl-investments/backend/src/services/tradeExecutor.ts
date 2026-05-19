/**
 * Trade Executor
 *
 * Core execution engine for the automated trading system.
 * All guardrails live here. Trading is OFF by default.
 * Every decision — executed, blocked, skipped, or error — is logged to trade_log.
 */

import { ApexDecision } from "./apexDecisionEngine";
import {
  getAccount,
  getPositions,
  placeBracketOrder,
  isMarketOpen,
  AlpacaOrder,
} from "./alpacaService";
import { reviewTrade, ReviewResult } from "./claudeReviewService";
import { getSetting } from "./appConfig";
import { getDb } from "./database";

export interface TradeResult {
  symbol: string;
  action: "executed" | "blocked" | "skipped" | "error";
  reason: string;
  order?: AlpacaOrder;
  claudeReview?: ReviewResult;
  timestamp: string;
}

function logTrade(params: {
  symbol: string;
  action: string;
  result: "executed" | "blocked" | "skipped" | "error";
  reason: string;
  apexScore: number;
  conviction: number;
  qty: number;
  entryPrice: number;
  stopLoss: number;
  target: number;
  positionSizePct: number;
  orderId: string;
  claudeApproved: boolean;
  claudeReason: string;
  regime: string;
}): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO trade_log
           (symbol, action, result, reason, apex_score, conviction, qty,
            entry_price, stop_loss, target, position_size_pct,
            order_id, claude_approved, claude_reason, regime)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        params.symbol,
        params.action,
        params.result,
        params.reason,
        params.apexScore,
        params.conviction,
        params.qty,
        params.entryPrice,
        params.stopLoss,
        params.target,
        params.positionSizePct,
        params.orderId,
        params.claudeApproved ? 1 : 0,
        params.claudeReason,
        params.regime
      );
  } catch (err) {
    console.error("[TradeExecutor] Failed to log trade:", err);
  }
}

function blocked(decision: ApexDecision, reason: string, claudeReview?: ReviewResult): TradeResult {
  const timestamp = new Date().toISOString();
  logTrade({
    symbol: decision.symbol,
    action: decision.action,
    result: "blocked",
    reason,
    apexScore: decision.apexScore,
    conviction: decision.conviction,
    qty: 0,
    entryPrice: decision.execution.entryPrice,
    stopLoss: decision.execution.stopLoss,
    target: decision.execution.target,
    positionSizePct: decision.execution.positionSizePct,
    orderId: "",
    claudeApproved: claudeReview?.approved ?? false,
    claudeReason: claudeReview?.reason ?? "",
    regime: decision.regime,
  });
  return { symbol: decision.symbol, action: "blocked", reason, claudeReview, timestamp };
}

function skipped(decision: ApexDecision, reason: string): TradeResult {
  const timestamp = new Date().toISOString();
  logTrade({
    symbol: decision.symbol,
    action: decision.action,
    result: "skipped",
    reason,
    apexScore: decision.apexScore,
    conviction: decision.conviction,
    qty: 0,
    entryPrice: decision.execution.entryPrice,
    stopLoss: decision.execution.stopLoss,
    target: decision.execution.target,
    positionSizePct: decision.execution.positionSizePct,
    orderId: "",
    claudeApproved: false,
    claudeReason: "",
    regime: decision.regime,
  });
  return { symbol: decision.symbol, action: "skipped", reason, timestamp };
}

export async function executeDecision(decision: ApexDecision): Promise<TradeResult> {
  const timestamp = new Date().toISOString();

  // 1. Kill switch check — highest priority
  if (getSetting("trading_kill_switch") === "true") {
    return blocked(decision, "Kill switch active");
  }

  // 2. Master enable check
  if (getSetting("trading_enabled") !== "true") {
    return skipped(decision, "Trading disabled");
  }

  // 3. Only execute BUY or SELL
  if (decision.action !== "BUY" && decision.action !== "SELL") {
    return skipped(decision, `Action '${decision.action}' is not executable (only BUY/SELL)`);
  }

  // 4. Minimum APEX score
  const minApexScore = parseInt(getSetting("trading_min_apex_score") ?? "75", 10);
  if (decision.apexScore < minApexScore) {
    return blocked(
      decision,
      `APEX score ${decision.apexScore} below minimum ${minApexScore}`
    );
  }

  // 5. Minimum conviction
  const minConviction = parseInt(getSetting("trading_min_conviction") ?? "8", 10);
  if (decision.conviction < minConviction) {
    return blocked(
      decision,
      `Conviction ${decision.conviction} below minimum ${minConviction}`
    );
  }

  // 6. Market open check
  let marketOpen = false;
  try {
    marketOpen = await isMarketOpen();
  } catch (err) {
    return blocked(decision, `Could not verify market status: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!marketOpen) {
    return skipped(decision, "Market is closed");
  }

  // 7. Get account — check buying power
  let account;
  try {
    account = await getAccount();
  } catch (err) {
    return blocked(decision, `Could not fetch Alpaca account: ${err instanceof Error ? err.message : String(err)}`);
  }
  const buyingPower = parseFloat(account.buying_power);
  if (buyingPower <= 0) {
    return blocked(decision, `Insufficient buying power: $${buyingPower}`);
  }
  const portfolioValue = parseFloat(account.portfolio_value || account.equity);

  // 8. Daily loss limit check
  try {
    const lossCheck = await checkDailyLoss();
    if (lossCheck.exceeded) {
      return blocked(
        decision,
        `Daily loss limit exceeded: ${lossCheck.currentLossPct.toFixed(2)}% loss today`
      );
    }
  } catch (err) {
    console.warn("[TradeExecutor] Could not check daily loss limit:", err);
    // Non-fatal — proceed with caution but don't block
  }

  // 9. Max positions check
  const maxPositions = parseInt(getSetting("trading_max_positions") ?? "10", 10);
  let positions;
  try {
    positions = await getPositions();
  } catch (err) {
    return blocked(decision, `Could not fetch positions: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (positions.length >= maxPositions) {
    return blocked(decision, `Max positions reached: ${positions.length}/${maxPositions}`);
  }

  // 10. Check if position already exists for this symbol
  const existingPosition = positions.find(
    (p) => p.symbol.toUpperCase() === decision.symbol.toUpperCase()
  );
  if (existingPosition) {
    return skipped(decision, `Position already exists for ${decision.symbol} (qty: ${existingPosition.qty})`);
  }

  // 11. Calculate position size
  const maxPositionPct = parseFloat(getSetting("trading_max_position_pct") ?? "5");
  const positionSizePct = Math.min(decision.execution.positionSizePct, maxPositionPct);
  const entryPrice = decision.execution.entryPrice;
  const qty = Math.floor((portfolioValue * positionSizePct / 100) / entryPrice);

  if (qty <= 0) {
    return blocked(
      decision,
      `Calculated qty is 0 — position size ${positionSizePct}% of $${portfolioValue} at $${entryPrice}/share is too small`
    );
  }

  // 12. Claude review (if required)
  let claudeReview: ReviewResult | undefined;
  if (getSetting("trading_require_claude_review") !== "false") {
    try {
      claudeReview = await reviewTrade({
        symbol: decision.symbol,
        action: decision.action,
        apexScore: decision.apexScore,
        conviction: decision.conviction,
        rationale: decision.rationale,
        regime: decision.regime,
        entryPrice: decision.execution.entryPrice,
        stopLoss: decision.execution.stopLoss,
        target: decision.execution.target,
        positionSizePct,
        portfolioValue,
      });
    } catch (err) {
      claudeReview = {
        approved: false,
        reason: `Claude review threw an error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 13. Block if Claude didn't approve
    if (!claudeReview.approved) {
      return blocked(decision, claudeReview.reason, claudeReview);
    }
  }

  // 14. Place bracket order
  let order: AlpacaOrder;
  try {
    order = await placeBracketOrder({
      symbol: decision.symbol,
      qty,
      side: decision.action === "BUY" ? "buy" : "sell",
      limitPrice: decision.execution.entryPrice,
      stopLossPrice: decision.execution.stopLoss,
      takeProfitPrice: decision.execution.target,
    });
  } catch (err) {
    const errorMsg = `Order placement failed: ${err instanceof Error ? err.message : String(err)}`;
    logTrade({
      symbol: decision.symbol,
      action: decision.action,
      result: "error",
      reason: errorMsg,
      apexScore: decision.apexScore,
      conviction: decision.conviction,
      qty,
      entryPrice: decision.execution.entryPrice,
      stopLoss: decision.execution.stopLoss,
      target: decision.execution.target,
      positionSizePct,
      orderId: "",
      claudeApproved: claudeReview?.approved ?? false,
      claudeReason: claudeReview?.reason ?? "",
      regime: decision.regime,
    });
    return { symbol: decision.symbol, action: "error", reason: errorMsg, claudeReview, timestamp };
  }

  // 15. Log success
  logTrade({
    symbol: decision.symbol,
    action: decision.action,
    result: "executed",
    reason: `Order placed: ${order.id}`,
    apexScore: decision.apexScore,
    conviction: decision.conviction,
    qty,
    entryPrice: decision.execution.entryPrice,
    stopLoss: decision.execution.stopLoss,
    target: decision.execution.target,
    positionSizePct,
    orderId: order.id,
    claudeApproved: claudeReview?.approved ?? true,
    claudeReason: claudeReview?.reason ?? "Review not required",
    regime: decision.regime,
  });

  console.log(
    `[TradeExecutor] EXECUTED ${decision.action} ${qty} shares of ${decision.symbol} @ $${entryPrice} | Stop: $${decision.execution.stopLoss} | Target: $${decision.execution.target}`
  );

  try {
    const { alertTradeExecuted } = require("./telegramService");
    await alertTradeExecuted({
      symbol: decision.symbol,
      action: decision.action,
      qty,
      price: entryPrice,
      stopLoss: decision.execution.stopLoss,
      target: decision.execution.target,
      apexScore: decision.apexScore,
      reason: decision.rationale,
      paper: getSetting("trading_paper_mode") !== "false",
    });
  } catch { /* Telegram failure never blocks a trade */ }

  return {
    symbol: decision.symbol,
    action: "executed",
    reason: `Bracket order placed: ${order.id} — ${qty} shares @ $${entryPrice}`,
    order,
    claudeReview,
    timestamp,
  };
}

export async function runDailyReset(): Promise<void> {
  try {
    const account = await getAccount();
    const equity = parseFloat(account.equity);
    const today = new Date().toISOString().split("T")[0];

    getDb()
      .prepare(
        `INSERT OR IGNORE INTO daily_equity (date, starting_equity)
         VALUES (?, ?)`
      )
      .run(today, equity);

    console.log(`[TradeExecutor] Daily reset: starting equity $${equity} recorded for ${today}`);
  } catch (err) {
    console.error("[TradeExecutor] Daily reset failed:", err);
  }
}

export async function checkDailyLoss(): Promise<{ exceeded: boolean; currentLossPct: number }> {
  const limitPct = parseFloat(getSetting("trading_daily_loss_limit_pct") ?? "3");
  const today = new Date().toISOString().split("T")[0];

  const row = getDb()
    .prepare("SELECT starting_equity FROM daily_equity WHERE date = ?")
    .get(today) as { starting_equity: number } | undefined;

  if (!row) {
    // No starting equity recorded yet — can't check loss
    return { exceeded: false, currentLossPct: 0 };
  }

  let account;
  try {
    account = await getAccount();
  } catch {
    return { exceeded: false, currentLossPct: 0 };
  }

  const currentEquity = parseFloat(account.equity);
  const startingEquity = row.starting_equity;
  const lossPct = ((startingEquity - currentEquity) / startingEquity) * 100;

  return {
    exceeded: lossPct >= limitPct,
    currentLossPct: lossPct,
  };
}
