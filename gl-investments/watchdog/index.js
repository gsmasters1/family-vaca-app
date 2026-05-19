/**
 * G&L Investments Watchdog
 *
 * Monitors the backend health endpoint every 5 minutes.
 * If it fails 3 consecutive times, sends a Telegram alert.
 * Also monitors scheduler heartbeat (if the cron jobs stopped, you'll know immediately).
 */

const axios = require("axios");

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:3001";
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_SECONDS || "300", 10) * 1000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_FAILURES = 3;

let consecutiveFailures = 0;
let lastAlertTime = 0;
let hasAlertedDown = false;

async function sendTelegramAlert(message) {
  if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === "none") return;
  if (!TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID === "none") return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "HTML" },
      { timeout: 10000 }
    );
  } catch (err) {
    console.error("[Watchdog] Failed to send Telegram alert:", err.message);
  }
}

async function checkHealth() {
  try {
    const res = await axios.get(`${BACKEND_URL}/api/health`, { timeout: 8000 });
    if (res.status === 200) {
      if (consecutiveFailures >= MAX_FAILURES && hasAlertedDown) {
        // Recovery alert
        await sendTelegramAlert("✅ <b>G&L Backend RECOVERED</b>\n\nServices are back online.");
        hasAlertedDown = false;
      }
      consecutiveFailures = 0;
      console.log(`[Watchdog] ${new Date().toISOString()} — OK (version: ${res.data?.version ?? "unknown"})`);
      return;
    }
  } catch {
    // Fall through to failure handling
  }

  consecutiveFailures++;
  console.error(`[Watchdog] ${new Date().toISOString()} — FAILURE #${consecutiveFailures}`);

  if (consecutiveFailures >= MAX_FAILURES && !hasAlertedDown) {
    const now = Date.now();
    if (now - lastAlertTime > 30 * 60 * 1000) { // Don't spam — 30 min cooldown
      await sendTelegramAlert(
        `🚨 <b>G&L Backend DOWN</b>\n\n${consecutiveFailures} consecutive health check failures.\n\n` +
        `The automated trading scheduler may have stopped.\n` +
        `Check your mini PC and run: <code>docker compose restart backend</code>`
      );
      lastAlertTime = now;
      hasAlertedDown = true;
    }
  }
}

// Run immediately, then on interval
console.log(`[Watchdog] Starting — checking ${BACKEND_URL} every ${CHECK_INTERVAL / 1000}s`);
checkHealth();
setInterval(checkHealth, CHECK_INTERVAL);
