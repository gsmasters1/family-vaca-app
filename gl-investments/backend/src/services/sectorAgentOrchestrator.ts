import yahooFinance from "yahoo-finance2";
import {
  ALL_SECTORS,
  classifyTicker,
  getSectorETF,
  getTickersForSector,
} from "./sectorService";
import type { GICSSector } from "./sectorService";
import { scoreWithSectorContext } from "./sectorScoringEngine";
import type { SectorAdjustedScore } from "./sectorScoringEngine";
import { detectMarketRegime } from "./marketRegimeService";
import { getDb } from "./database";

export interface SectorPick {
  symbol: string;
  sector: GICSSector | "UNKNOWN";
  sectorAdjustedScore: number;
  baseScore: number;
  adjustments: string[];
  price: number;
  changePct: number;
}

export interface SectorReport {
  sector: GICSSector;
  etfSymbol: string;
  etfMomentum: "LEADING" | "NEUTRAL" | "LAGGING";
  etfVsSMA20pct: number;
  topPicks: SectorPick[];
  scoredAt: string;
}

export interface SectorRotation {
  sector: GICSSector;
  etfSymbol: string;
  etfPrice: number;
  etfChangePct: number;
  etfVsSMA20pct: number;
  momentum: "LEADING" | "NEUTRAL" | "LAGGING";
  topPick: string;
  avgSectorScore: number;
}

export interface ManagerOutput {
  topCandidates: SectorPick[];
  sectorRotation: SectorRotation[];
  timestamp: string;
}

export interface CommanderDecision {
  symbol: string;
  action: "BUY" | "WATCH" | "AVOID";
  sectorAdjustedScore: number;
  sector: GICSSector | "UNKNOWN";
  rank: number;
}

export interface HierarchyResult {
  sectorReports: SectorReport[];
  managerOutput: ManagerOutput;
  commanderDecisions: CommanderDecision[];
  regime: string;
  duration: number;
}

async function fetchPriceHistory(symbol: string): Promise<number[]> {
  try {
    const now = new Date();
    const period1 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const results = await yahooFinance.historical(symbol, {
      period1: period1.toISOString().split("T")[0],
      interval: "1d",
    });
    return results.map((r: { close: number }) => r.close).filter((c: number) => typeof c === "number");
  } catch {
    return [];
  }
}

async function fetchQuote(
  symbol: string
): Promise<{ price: number; changePct: number }> {
  try {
    const result = await yahooFinance.quote(symbol);
    return {
      price: result.regularMarketPrice ?? 0,
      changePct: result.regularMarketChangePercent ?? 0,
    };
  } catch {
    return { price: 0, changePct: 0 };
  }
}

function computeSMA20(prices: number[]): number {
  if (prices.length < 20) return prices[prices.length - 1] ?? 0;
  const slice = prices.slice(-20);
  return slice.reduce((a, b) => a + b, 0) / 20;
}

async function runSectorAgent(
  sector: GICSSector,
  universe: string[],
  regime: string
): Promise<SectorReport> {
  const etfSymbol = getSectorETF(sector);
  const sectorTickers = getTickersForSector(universe, sector);

  const [etfHistory, etfQuote] = await Promise.all([
    fetchPriceHistory(etfSymbol),
    fetchQuote(etfSymbol),
  ]);

  const etfSMA20 = computeSMA20(etfHistory);
  const etfCurrentPrice = etfHistory.length > 0
    ? etfHistory[etfHistory.length - 1]
    : etfQuote.price;

  const etfVsSMA20pct =
    etfSMA20 > 0 ? ((etfCurrentPrice - etfSMA20) / etfSMA20) * 100 : 0;

  const etfMomentum: "LEADING" | "NEUTRAL" | "LAGGING" =
    etfVsSMA20pct > 2 ? "LEADING" : etfVsSMA20pct < -2 ? "LAGGING" : "NEUTRAL";

  const scored: SectorPick[] = [];

  await Promise.allSettled(
    sectorTickers.map(async (ticker) => {
      try {
        const [history, quote] = await Promise.all([
          fetchPriceHistory(ticker),
          fetchQuote(ticker),
        ]);

        if (history.length < 20 || quote.price === 0) return;

        const result = scoreWithSectorContext(
          ticker,
          quote,
          history,
          etfHistory,
          regime
        );

        scored.push({
          symbol: ticker,
          sector: result.sector,
          sectorAdjustedScore: result.sectorAdjustedScore,
          baseScore: result.baseScore,
          adjustments: result.adjustments,
          price: quote.price,
          changePct: quote.changePct,
        });
      } catch {
        // Skip failed tickers — never crash a sector agent for one bad ticker
      }
    })
  );

  scored.sort((a, b) => b.sectorAdjustedScore - a.sectorAdjustedScore);
  const topPicks = scored.slice(0, 10);

  return {
    sector,
    etfSymbol,
    etfMomentum,
    etfVsSMA20pct,
    topPicks,
    scoredAt: new Date().toISOString(),
  };
}

export async function runSectorAgents(
  universe: string[]
): Promise<SectorReport[]> {
  const regime = await detectMarketRegime();

  const results = await Promise.allSettled(
    ALL_SECTORS.map((sector) =>
      runSectorAgent(sector, universe, regime.regime)
    )
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<SectorReport> => r.status === "fulfilled"
    )
    .map((r) => r.value);
}

export async function runManagerLayer(
  sectorReports: SectorReport[]
): Promise<ManagerOutput> {
  // Collect all top picks and build sector rotation table
  const allCandidates: SectorPick[] = [];
  const sectorRotation: SectorRotation[] = [];

  for (const report of sectorReports) {
    allCandidates.push(...report.topPicks);

    const avgScore =
      report.topPicks.length > 0
        ? report.topPicks.reduce((sum, p) => sum + p.sectorAdjustedScore, 0) /
          report.topPicks.length
        : 0;

    const etfQuote = await fetchQuote(report.etfSymbol).catch(() => ({
      price: 0,
      changePct: 0,
    }));

    sectorRotation.push({
      sector: report.sector,
      etfSymbol: report.etfSymbol,
      etfPrice: etfQuote.price,
      etfChangePct: etfQuote.changePct,
      etfVsSMA20pct: report.etfVsSMA20pct,
      momentum: report.etfMomentum,
      topPick: report.topPicks[0]?.symbol ?? "",
      avgSectorScore: Math.round(avgScore * 10) / 10,
    });
  }

  // Deduplicate by symbol — keep highest score per symbol
  const deduped = new Map<string, SectorPick>();
  for (const pick of allCandidates) {
    const existing = deduped.get(pick.symbol);
    if (!existing || pick.sectorAdjustedScore > existing.sectorAdjustedScore) {
      deduped.set(pick.symbol, pick);
    }
  }

  // Rank overall and enforce max 3 per sector
  const sorted = [...deduped.values()].sort(
    (a, b) => b.sectorAdjustedScore - a.sectorAdjustedScore
  );

  const sectorCount = new Map<string, number>();
  const topCandidates: SectorPick[] = [];

  for (const pick of sorted) {
    if (topCandidates.length >= 33) break;
    const count = sectorCount.get(String(pick.sector)) ?? 0;
    if (count >= 3) continue;
    topCandidates.push(pick);
    sectorCount.set(String(pick.sector), count + 1);
  }

  return {
    topCandidates,
    sectorRotation,
    timestamp: new Date().toISOString(),
  };
}

export async function runCommander(
  managerOutput: ManagerOutput,
  existingPositions: string[]
): Promise<CommanderDecision[]> {
  const existing = new Set(existingPositions.map((s) => s.toUpperCase()));

  const decisions: CommanderDecision[] = [];
  let rank = 1;

  for (const candidate of managerOutput.topCandidates) {
    const isHeld = existing.has(candidate.symbol.toUpperCase());

    let action: "BUY" | "WATCH" | "AVOID";
    if (isHeld) {
      action = "WATCH";
    } else if (candidate.sectorAdjustedScore >= 60) {
      action = "BUY";
    } else if (candidate.sectorAdjustedScore >= 40) {
      action = "WATCH";
    } else {
      action = "AVOID";
    }

    decisions.push({
      symbol: candidate.symbol,
      action,
      sectorAdjustedScore: candidate.sectorAdjustedScore,
      sector: candidate.sector,
      rank: rank++,
    });
  }

  return decisions;
}

export async function runFullHierarchy(
  universe?: string[]
): Promise<HierarchyResult> {
  const startTime = Date.now();

  let finalUniverse = universe ?? [];

  if (!universe || universe.length === 0) {
    const db = getDb();
    try {
      const watchlist = db
        .prepare("SELECT symbol FROM watchlist")
        .all() as Array<{ symbol: string }>;
      const portfolio = db
        .prepare("SELECT DISTINCT symbol FROM portfolio_positions")
        .all() as Array<{ symbol: string }>;
      finalUniverse = [
        ...new Set([
          ...watchlist.map((r) => r.symbol),
          ...portfolio.map((r) => r.symbol),
        ]),
      ];
    } catch {
      finalUniverse = [];
    }
  }

  // Always include the 11 sector ETFs in the universe
  const etfs = ALL_SECTORS.map(getSectorETF);
  finalUniverse = [...new Set([...finalUniverse, ...etfs])];

  const regimeSnap = await detectMarketRegime();

  const sectorReports = await runSectorAgents(finalUniverse);
  const managerOutput = await runManagerLayer(sectorReports);

  let existingPositions: string[] = [];
  try {
    const db = getDb();
    existingPositions = (
      db
        .prepare("SELECT DISTINCT symbol FROM portfolio_positions")
        .all() as Array<{ symbol: string }>
    ).map((r) => r.symbol);
  } catch {
    existingPositions = [];
  }

  const commanderDecisions = await runCommander(managerOutput, existingPositions);

  return {
    sectorReports,
    managerOutput,
    commanderDecisions,
    regime: regimeSnap.regime,
    duration: Date.now() - startTime,
  };
}
