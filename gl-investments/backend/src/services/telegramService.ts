/**
 * Telegram Alert Service
 *
 * Sends real-time trade alerts to your phone via Telegram bot.
 * Setup: create a bot via @BotFather → get token. Message the bot → get your chat_id.
 * Add both in Settings. Set telegram_alerts_enabled = true.
 *
 * Alerts sent for:
 *   - APEX BUY/SELL decisions (ACT NOW urgency)
 *   - Trade executions (automated)
 *   - Kill switch activation
 *   - Daily market summary (4 PM ET)
 *   - Stop-loss triggers on open positions
 */

import axios from "axios";
import { getSetting } from "./appConfig";

const TELEGRAM_API = "https://api.telegram.org/bot";

function getConfig(): { token: string; chatId: string } | null {
  const token = getSetting("telegram_bot_token");
  const chatId = getSetting("telegram_chat_id");
  if (!token || token === "none" || !chatId || chatId === "none") return null;
  return { token, chatId };
}

async function sendMessage(text: string, parseMode: "HTML" | "Markdown" = "HTML"): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  if (getSetting("telegram_alerts_enabled") !== "true") return false;

  try {
    await axios.post(
      `${TELEGRAM_API}${config.token}/sendMessage`,
      { chat_id: config.chatId, text, parse_mode: parseMode, disable_web_page_preview: true },
      { timeout: 10_000 }
    );
    return true;
  } catch {
    return false;
  }
}

export async function alertTradeExecuted(params: {
  symbol: string;
  action: "BUY" | "SELL";
  qty: number;
  price: number;
  stopLoss: number;
  target: number;
  apexScore: number;
  reason: string;
  paper: boolean;
}): Promise<void> {
  const { symbol, action, qty, price, stopLoss, target, apexScore, reason, paper } = params;
  const mode = paper ? "📄 PAPER" : "💰 LIVE";
  const emoji = action === "BUY" ? "🟢" : "🔴";
  const text = `${emoji} <b>${mode} ${action} — ${symbol}</b>

💵 Price: <b>$${price.toFixed(2)}</b>
📦 Qty: ${qty.toFixed(4)} shares
🛑 Stop: $${stopLoss.toFixed(2)}
🎯 Target: $${target.toFixed(2)}
⚡ APEX Score: ${apexScore}/100

📝 ${reason}`;
  await sendMessage(text);
}

export async function alertApexDecision(params: {
  symbol: string;
  action: string;
  urgency: string;
  conviction: number;
  apexScore: number;
  rationale: string;
  entryPrice: number;
  stopLoss: number;
  target: number;
}): Promise<void> {
  const { symbol, action, urgency, conviction, apexScore, rationale, entryPrice, stopLoss, target } = params;
  if (urgency !== "ACT NOW") return; // Only alert high-urgency decisions

  const emoji = action === "BUY" ? "🚀" : action === "SELL" ? "🔻" : "👁";
  const text = `${emoji} <b>APEX ${action} — ${symbol}</b> | ${urgency}

⚡ Score: ${apexScore}/100 | Conviction: ${conviction}/10
💵 Entry: $${entryPrice.toFixed(2)} | Stop: $${stopLoss.toFixed(2)} | Target: $${target.toFixed(2)}

💬 ${rationale}`;
  await sendMessage(text);
}

export async function alertStopLossTriggered(params: {
  symbol: string;
  currentPrice: number;
  stopLoss: number;
  paper: boolean;
}): Promise<void> {
  const { symbol, currentPrice, stopLoss, paper } = params;
  const mode = paper ? "PAPER" : "LIVE";
  await sendMessage(
    `⚠️ <b>STOP-LOSS TRIGGERED — ${symbol}</b> [${mode}]\n\nPrice $${currentPrice.toFixed(2)} ≤ Stop $${stopLoss.toFixed(2)}\nClosing position automatically.`
  );
}

export async function alertKillSwitch(reason: string): Promise<void> {
  await sendMessage(`🚨 <b>KILL SWITCH ACTIVATED</b>\n\nAll trading halted immediately.\n📝 Reason: ${reason}`);
}

export async function alertDailySummary(params: {
  portfolioValue: number;
  dayChange: number;
  dayChangePct: number;
  openPositions: number;
  regime: string;
  topDecision?: { symbol: string; action: string; score: number };
}): Promise<void> {
  const { portfolioValue, dayChange, dayChangePct, openPositions, regime, topDecision } = params;
  const changeEmoji = dayChange >= 0 ? "📈" : "📉";
  const changeStr = `${dayChange >= 0 ? "+" : ""}$${Math.abs(dayChange).toFixed(0)} (${dayChangePct >= 0 ? "+" : ""}${dayChangePct.toFixed(2)}%)`;

  let text = `📊 <b>G&L Daily Summary</b>

💼 Portfolio: <b>$${portfolioValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</b>
${changeEmoji} Day: ${changeStr}
🏪 Open positions: ${openPositions}
🌐 Market: ${regime}`;

  if (topDecision) {
    text += `\n\n⚡ Top APEX: <b>${topDecision.action} ${topDecision.symbol}</b> (${topDecision.score}/100)`;
  }
  await sendMessage(text);
}

export async function testAlert(): Promise<{ sent: boolean; configured: boolean }> {
  const config = getConfig();
  if (!config) return { sent: false, configured: false };
  const sent = await sendMessage("✅ <b>G&L Investments</b> — Telegram alerts are working!");
  return { sent, configured: true };
}
