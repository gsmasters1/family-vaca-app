/**
 * Scheduler
 *
 * Manages cron jobs for APEX scans and daily resets.
 * All times are Eastern (America/New_York).
 */

import cron from "node-cron";
import { runFullScan } from "./apexDecisionEngine";
import { executeDecision } from "./tradeExecutor";
import { runDailyReset } from "./tradeExecutor";
import { getSetting } from "./appConfig";

const tasks: cron.ScheduledTask[] = [];

export function startScheduler(): void {
  // Market open check + daily reset at 9:30 AM ET
  const resetTask = cron.schedule(
    "30 9 * * 1-5",
    async () => {
      await runDailyReset();
      console.log("[Scheduler] Market open — daily reset complete");
    },
    { timezone: "America/New_York" }
  );
  tasks.push(resetTask);

  // Full APEX scan + auto-execute every 30 minutes during market hours (9:35am - 3:55pm ET)
  const scanTask = cron.schedule(
    "5,35 9-15 * * 1-5",
    async () => {
      if (getSetting("trading_kill_switch") === "true") return;

      console.log("[Scheduler] Running APEX scan...");
      try {
        const decisions = await runFullScan();

        // Alert ACT NOW decisions to Telegram regardless of trading enabled state
        try {
          const { alertApexDecision } = require("./telegramService");
          for (const d of decisions) {
            if (d.urgency === "ACT NOW") {
              await alertApexDecision(d).catch(() => {});
            }
          }
        } catch { /* non-fatal */ }

        if (getSetting("trading_enabled") !== "true") return;
        for (const decision of decisions) {
          if (decision.action === "BUY" || decision.action === "SELL") {
            const result = await executeDecision(decision);
            console.log(
              `[Scheduler] ${decision.symbol}: ${result.action} — ${result.reason}`
            );
          }
        }
      } catch (err) {
        console.error("[Scheduler] APEX scan failed:", err);
      }
    },
    { timezone: "America/New_York" }
  );
  tasks.push(scanTask);

  // Stop-loss monitor: every 5 minutes during market hours
  const stopLossTask = cron.schedule(
    "*/5 9-15 * * 1-5",
    async () => {
      if (getSetting("trading_kill_switch") === "true") return;
      if (getSetting("trading_enabled") !== "true") return;
      try {
        const { checkStopLosses } = require("./stopLossMonitor");
        await checkStopLosses();
      } catch (err) {
        console.error("[Scheduler] Stop-loss check failed:", err);
      }
    },
    { timezone: "America/New_York" }
  );
  tasks.push(stopLossTask);

  // Daily Telegram summary at 4:00 PM ET weekdays
  const dailySummaryTask = cron.schedule(
    "0 16 * * 1-5",
    async () => {
      try {
        const { alertDailySummary } = require("./telegramService");
        await alertDailySummary();
      } catch (err) {
        console.error("[Scheduler] Daily summary alert failed:", err);
      }
    },
    { timezone: "America/New_York" }
  );
  tasks.push(dailySummaryTask);

  // Intelligence feed refresh every 2 hours
  const intelTask = cron.schedule("0 */2 * * 1-5", async () => {
    try {
      const { refreshIntelligenceFeed } = require("./webScraperService");
      await refreshIntelligenceFeed().catch(console.error);
    } catch {
      // webScraperService may not exist in all deployments — silent fail
    }
  });
  tasks.push(intelTask);

  // Take-profit checks: every 5 min during market hours (alongside stop-loss monitor)
  const takeProfitTask = cron.schedule(
    "*/5 9-15 * * 1-5",
    async () => {
      if (getSetting("trading_kill_switch") === "true") return;
      if (getSetting("trading_enabled") !== "true") return;
      try {
        const { checkTakeProfitTriggers } = require("./profitManagementService");
        const actions = await checkTakeProfitTriggers();
        if (actions.length > 0) {
          console.log(`[Scheduler] ${actions.length} take-profit trigger(s) fired`);
        }
      } catch (err) {
        console.error("[Scheduler] Take-profit check failed:", err);
      }
    },
    { timezone: "America/New_York" }
  );
  tasks.push(takeProfitTask);

  // Sector hierarchy scan: pre-market 8am ET and post-market 4:30pm ET
  const hierarchyTask = cron.schedule(
    "0 8,16 * * 1-5",
    async () => {
      if (getSetting("hierarchy_enabled") !== "true") return;
      try {
        const { runFullHierarchy } = require("./sectorAgentOrchestrator");
        const result = await runFullHierarchy();
        console.log(`[Scheduler] Hierarchy scan complete — ${result.commanderDecisions.length} decisions in ${result.duration}ms`);
      } catch (err) {
        console.error("[Scheduler] Hierarchy scan failed:", err);
      }
    },
    { timezone: "America/New_York" }
  );
  tasks.push(hierarchyTask);

  // Bond market snapshot refresh: every 30 min during market hours
  const bondTask = cron.schedule(
    "*/30 9-16 * * 1-5",
    async () => {
      try {
        const { getBondSnapshot } = require("./fixedIncomeService");
        await getBondSnapshot();
      } catch { /* non-fatal */ }
    },
    { timezone: "America/New_York" }
  );
  tasks.push(bondTask);

  // COT report refresh: every Friday at 4:30 PM ET (released at 3:30 PM, allow processing time)
  const cotTask = cron.schedule(
    "30 16 * * 5",
    async () => {
      try {
        const { fetchCOTReports } = require("./cotService");
        await fetchCOTReports();
        console.log("[Scheduler] COT report refreshed");
      } catch (err) {
        console.error("[Scheduler] COT refresh failed:", err);
      }
    },
    { timezone: "America/New_York" }
  );
  tasks.push(cotTask);

  console.log(
    "[Scheduler] Started — APEX scans at :05 and :35 past each hour, 9am-4pm ET"
  );
}

export function stopScheduler(): void {
  tasks.forEach((task) => task.stop());
  tasks.length = 0;
  console.log("[Scheduler] All tasks stopped");
}
