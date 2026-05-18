import { getQuote } from "./marketData";
import { getDb } from "./database";

export type RiskLevel = "LOW" | "MID" | "HIGH";
export type RiskProfile = "conservative" | "moderate" | "aggressive";

export interface RiskTierConfig {
  low: { min: number; max: number };
  mid: { min: number; max: number };
  high: { min: number; max: number };
}

// Target allocation % by profile (Low / Mid / High risk)
export const PROFILE_TARGETS: Record<RiskProfile, RiskTierConfig> = {
  conservative: { low: { min: 60, max: 75 }, mid: { min: 20, max: 30 }, high: { min: 0, max: 10 } },
  moderate:     { low: { min: 35, max: 50 }, mid: { min: 35, max: 45 }, high: { min: 10, max: 25 } },
  aggressive:   { low: { min: 10, max: 25 }, mid: { min: 25, max: 40 }, high: { min: 35, max: 60 } },
};

// Expected annual return range % by risk level
export const RETURN_TARGETS: Record<RiskLevel, { low: number; high: number }> = {
  LOW:  { low: 4,  high: 12 },
  MID:  { low: 12, high: 25 },
  HIGH: { low: 20, high: 60 },
};

// Max tolerable drawdown % by risk level
export const MAX_DRAWDOWN: Record<RiskLevel, number> = {
  LOW:  10,
  MID:  25,
  HIGH: 50,
};

// ─── Asset classification ─────────────────────────────────────────────────
// Known LOW risk symbols
const LOW_RISK_SYMBOLS = new Set([
  "BND", "AGG", "VCIT", "VCSH", "TLT", "IEF", "SHY", "GOVT",
  "GLD", "IAU", "SGOL",          // gold ETFs
  "SPY", "VOO", "IVV", "VTI",    // broad market index ETFs
  "QQQ",                          // tech index (moderate but treated as mid-low)
  "DVY", "VIG", "SCHD",          // dividend ETFs
  "^TNX", "^IRX", "^FVX",        // treasury yields
]);

const HIGH_RISK_SYMBOLS = new Set([
  "BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "ADA-USD", "XRP-USD",
  "LTHM", "LTHM", "ARVL", "LCID", "RIVN",   // speculative EV/lithium
  "SPCE", "RKLB", "ASTS",                      // speculative space
  "SOXL", "TQQQ", "UPRO", "UVXY",             // leveraged ETFs
]);

const HIGH_RISK_PATTERNS = ["-USD", "3X", "2X", "BULL", "BEAR", "ULTRA"];
const MID_RISK_ASSET_TYPES = new Set(["crypto"]);

export function classifyRisk(
  symbol: string,
  assetType: string,
  beta?: number
): RiskLevel {
  const sym = symbol.toUpperCase();
  if (LOW_RISK_SYMBOLS.has(sym)) return "LOW";
  if (HIGH_RISK_SYMBOLS.has(sym)) return "HIGH";
  if (HIGH_RISK_PATTERNS.some((p) => sym.includes(p))) return "HIGH";
  if (assetType === "crypto") return "HIGH";
  if (assetType === "bond" || assetType === "etf") {
    return beta !== undefined && beta > 1.3 ? "MID" : "LOW";
  }
  if (beta !== undefined) {
    if (beta < 0.6) return "LOW";
    if (beta > 1.5) return "HIGH";
  }
  return "MID"; // default for individual stocks
}

// ─── Portfolio risk analysis ──────────────────────────────────────────────
export interface PositionRisk {
  id: number;
  symbol: string;
  assetType: string;
  value: number;
  riskLevel: RiskLevel;
  allocation: number;      // % of total portfolio
  returnTarget: { low: number; high: number };
  maxDrawdown: number;
  action?: string;
}

export interface PortfolioRiskReport {
  totalValue: number;
  distribution: Record<RiskLevel, { value: number; pct: number }>;
  positions: PositionRisk[];
  profile: RiskProfile;
  profileTargets: RiskTierConfig;
  isCompliant: boolean;
  recommendations: string[];
  overallRiskScore: number; // 1 (safest) – 10 (most aggressive)
}

export async function analyzePortfolioRisk(
  profile: RiskProfile = "moderate"
): Promise<PortfolioRiskReport> {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, symbol, asset_type, shares, avg_cost FROM portfolio_positions")
    .all() as Array<{
    id: number; symbol: string; asset_type: string; shares: number; avg_cost: number;
  }>;

  const positions: PositionRisk[] = [];
  let totalValue = 0;

  for (const row of rows) {
    const quote = await getQuote(row.symbol).catch(() => null);
    const price = quote?.price ?? row.avg_cost;
    const value = price * row.shares;
    totalValue += value;
    const riskLevel = classifyRisk(row.symbol, row.asset_type);
    positions.push({
      id: row.id,
      symbol: row.symbol,
      assetType: row.asset_type,
      value,
      riskLevel,
      allocation: 0,
      returnTarget: RETURN_TARGETS[riskLevel],
      maxDrawdown: MAX_DRAWDOWN[riskLevel],
    });
  }

  // Calculate allocations
  for (const p of positions) {
    p.allocation = totalValue > 0 ? (p.value / totalValue) * 100 : 0;
  }

  // Distribution
  const dist: Record<RiskLevel, { value: number; pct: number }> = {
    LOW:  { value: 0, pct: 0 },
    MID:  { value: 0, pct: 0 },
    HIGH: { value: 0, pct: 0 },
  };
  for (const p of positions) {
    dist[p.riskLevel].value += p.value;
  }
  for (const tier of Object.keys(dist) as RiskLevel[]) {
    dist[tier].pct = totalValue > 0 ? (dist[tier].value / totalValue) * 100 : 0;
  }

  const targets = PROFILE_TARGETS[profile];
  const recs: string[] = [];
  let compliant = true;

  // Check compliance + generate recommendations
  for (const [tier, range] of Object.entries(targets) as [string, { min: number; max: number }][]) {
    const key = tier.toUpperCase() as RiskLevel;
    const pct = dist[key].pct;
    if (pct < range.min) {
      compliant = false;
      recs.push(
        `Increase ${key} risk allocation to ${range.min}–${range.max}%. Currently ${pct.toFixed(1)}%.`
      );
    } else if (pct > range.max) {
      compliant = false;
      recs.push(
        `Reduce ${key} risk allocation to ${range.min}–${range.max}%. Currently ${pct.toFixed(1)}%.`
      );
    }
  }

  if (recs.length === 0) recs.push("Portfolio allocation is within target ranges for your risk profile.");

  // Add position-level recommendations
  for (const p of positions) {
    if (profile === "conservative" && p.riskLevel === "HIGH" && p.allocation > 3) {
      p.action = `Consider trimming — ${p.allocation.toFixed(1)}% in HIGH risk exceeds conservative profile`;
    } else if (profile === "aggressive" && p.riskLevel === "LOW" && p.allocation > 30) {
      p.action = `Underweighted growth — ${p.allocation.toFixed(1)}% in LOW risk may limit upside`;
    }
  }

  // Overall risk score (1–10)
  const overallRiskScore = Math.round(
    1 + (dist.LOW.pct * 1 + dist.MID.pct * 4.5 + dist.HIGH.pct * 9) / 100 * 0.9
  );

  return {
    totalValue,
    distribution: dist,
    positions,
    profile,
    profileTargets: targets,
    isCompliant: compliant,
    recommendations: recs,
    overallRiskScore,
  };
}

// ─── Risk score for a single signal (congress trade, prediction, etc.) ───
export interface SignalRisk {
  riskLevel: RiskLevel;
  score: number;      // 1–10
  rationale: string;
  suggestedPositionSizePct: number; // % of portfolio to allocate
}

export function scoreSignalRisk(
  symbol: string,
  assetType: string,
  confidence: number,    // 0–100
  profile: RiskProfile
): SignalRisk {
  const riskLevel = classifyRisk(symbol, assetType);
  const riskWeight = riskLevel === "LOW" ? 2 : riskLevel === "MID" ? 5 : 8;
  const score = Math.round((confidence / 100) * (10 - riskWeight) + riskWeight);

  // Position sizing: smaller for high risk, larger for low risk
  const baseSize =
    profile === "conservative" ? 3 :
    profile === "moderate" ? 5 : 8;
  const riskMultiplier =
    riskLevel === "LOW" ? 1.5 :
    riskLevel === "MID" ? 1.0 : 0.5;
  const suggestedPositionSizePct = Math.round(baseSize * riskMultiplier * (confidence / 100));

  const rationale =
    `${riskLevel} risk asset (${assetType}). ` +
    `At ${confidence}% AI confidence, suggested position: ${suggestedPositionSizePct}% of portfolio. ` +
    `Expected return range: ${RETURN_TARGETS[riskLevel].low}–${RETURN_TARGETS[riskLevel].high}% annually.`;

  return { riskLevel, score, rationale, suggestedPositionSizePct };
}
