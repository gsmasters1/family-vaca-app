/**
 * Claude Review Service
 *
 * Final risk review layer for the automated trading system.
 * Uses Claude claude-sonnet-4-6 with prompt caching on the system message.
 * Requires ANTHROPIC_API_KEY env var.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ReviewResult {
  approved: boolean;
  reason: string;
}

const SYSTEM_PROMPT = `You are the final risk review layer for G&L Investments' automated trading system.
APEX (the primary AI) has already analyzed this trade using Minervini, O'Neil, Graham, Livermore, Turtle, Druckenmiller, and Dalio frameworks.
Your job is to be the last line of defense — the skeptic that catches what APEX missed.

Review each trade for:
1. Is this a reasonable risk/reward setup? (R/R must be at least 2:1)
2. Does the position size respect the portfolio risk limit? (never more than 8% in one position)
3. Are there any obvious red flags APEX may have missed?
4. Does this align with the current market regime?

Respond with ONLY valid JSON:
{ "approved": true|false, "reason": "<one sentence>" }

Never approve a trade that risks more than 2% of portfolio on a single stop-out.
Never approve in BEAR or CRISIS regime.
Be decisive. One sentence. No hedging.`;

export async function reviewTrade(params: {
  symbol: string;
  action: string;
  apexScore: number;
  conviction: number;
  rationale: string;
  regime: string;
  entryPrice: number;
  stopLoss: number;
  target: number;
  positionSizePct: number;
  portfolioValue: number;
}): Promise<ReviewResult> {
  const {
    symbol,
    action,
    apexScore,
    conviction,
    rationale,
    regime,
    entryPrice,
    stopLoss,
    target,
    positionSizePct,
    portfolioValue,
  } = params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      approved: false,
      reason: "Claude review unavailable — trade blocked until API key configured",
    };
  }

  const stopPct = (((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);
  const targetPct = (((target - entryPrice) / entryPrice) * 100).toFixed(2);
  const rr =
    (entryPrice - stopLoss) !== 0
      ? ((target - entryPrice) / (entryPrice - stopLoss)).toFixed(1)
      : "0";
  const dollarRisk = ((portfolioValue * positionSizePct) / 100 * ((entryPrice - stopLoss) / entryPrice)).toFixed(0);

  const prompt = `Trade Review Request:
Symbol: ${symbol}
Action: ${action}
APEX Score: ${apexScore}/100
Conviction: ${conviction}/10
Regime: ${regime}
Rationale: ${rationale}

Execution:
Entry: $${entryPrice}
Stop Loss: $${stopLoss} (${stopPct}% risk)
Target: $${target} (${targetPct}% gain)
Position Size: ${positionSizePct}% of portfolio ($${dollarRisk} at risk if stopped out)
Risk/Reward: ${rr}:1

Portfolio Value: $${portfolioValue}`;

  try {
    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 150,
      betas: ["prompt-caching-2024-07-31"],
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return {
        approved: false,
        reason: "Claude review returned no text — trade blocked as precaution",
      };
    }

    // Parse the JSON response
    const raw = textBlock.text.trim();
    // Extract JSON even if wrapped in markdown code blocks
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        approved: false,
        reason: "Claude review response was not valid JSON — trade blocked as precaution",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { approved: boolean; reason: string };
    return {
      approved: Boolean(parsed.approved),
      reason: String(parsed.reason ?? "No reason provided"),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ClaudeReview] Error:", message);
    return {
      approved: false,
      reason: "Claude review unavailable — trade blocked until API key configured",
    };
  }
}
