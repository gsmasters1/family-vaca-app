import {
  scoreMomentum,
  scoreTechnical,
  scoreValue,
  scoreMacro,
  scoreCongressional,
  computeApexScore,
} from "./apexStrategy";
import type { MarketRegime } from "./apexStrategy";
import {
  classifyTicker,
  getSectorBenchmarks,
  getSectorETF,
  getUnknownBenchmarks,
} from "./sectorService";
import type { GICSSector, SectorBenchmarks } from "./sectorService";
import { computeIndicators } from "./technicalAnalysis";

export interface SectorAdjustedScore {
  symbol: string;
  sector: GICSSector | "UNKNOWN";
  baseScore: number;
  sectorAdjustedScore: number;
  adjustments: string[];
  benchmarks: SectorBenchmarks;
  components: {
    momentum: number;
    technical: number;
    congressional: number;
    macro: number;
    value: number;
  };
}

function computeSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function scoreWithSectorContext(
  symbol: string,
  quote: { price: number; changePct?: number },
  history: number[],
  sectorETFHistory: number[],
  regime: string,
  congressSignal?: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL",
  insiderSignal?: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL"
): SectorAdjustedScore {
  const sector = classifyTicker(symbol);
  const benchmarks =
    sector === "UNKNOWN" ? getUnknownBenchmarks() : getSectorBenchmarks(sector);
  const adjustments: string[] = [];

  const historyBars = history.map((close, i) => ({ date: String(i), close }));

  let baseScore = 0;
  let components = { momentum: 0, technical: 0, congressional: 0, macro: 0, value: 0 };

  if (history.length >= 20) {
    const indicators = computeIndicators(historyBars);
    const mom = scoreMomentum(indicators, quote.price);
    const tech = scoreTechnical(indicators, quote.price);
    const cong = scoreCongressional(symbol, insiderSignal ?? "NEUTRAL");
    const macroResult = scoreMacro(regime as MarketRegime, 50, 0);
    const val = scoreValue(quote.price, indicators);

    components = {
      momentum: mom.score,
      technical: tech.score,
      congressional: cong.score,
      macro: macroResult.score,
      value: val.score,
    };
    baseScore = mom.score + tech.score + cong.score + macroResult.score + val.score;
  }

  let adjusted = baseScore;

  // Value adjustment using sector PE benchmarks as a proxy via 52w range position
  // Since we don't have live PE ratios, we use the Bollinger/52w position from indicators
  // as a relative cheapness proxy against typical sector ranges.
  // A more direct PE check is skipped since it requires fundamental data not available here.
  const peEstimated = quote.price > 0 ? quote.price / Math.max(quote.price * 0.04, 1) : 0;
  // We use a synthetic PE proxy: priceVsSMA as cheap/expensive signal within sector context
  if (history.length >= 20) {
    const indicators = computeIndicators(historyBars);
    const pctFromLow52 = indicators.low52w > 0
      ? ((quote.price - indicators.low52w) / indicators.low52w) * 100
      : 50;
    const pctFromHigh52 = indicators.high52w > 0
      ? ((indicators.high52w - quote.price) / indicators.high52w) * 100
      : 50;

    // Cheap-for-sector: near 52w low relative to sector typical range
    if (pctFromLow52 < (benchmarks.typicalPELow / benchmarks.typicalPEHigh) * 30) {
      adjusted += 5;
      adjustments.push(
        `Cheap for sector (${sector}): near 52w low, within typical low-PE range`
      );
    } else if (pctFromHigh52 < 5 && pctFromLow52 > 80) {
      // Extended far above 52w low — expensive-for-sector signal
      adjusted -= 8;
      adjustments.push(
        `Expensive for sector (${sector}): extended 2x+ above typical range`
      );
    }
  }

  // Regime-sector interaction
  const normalizedRegime = regime.toUpperCase() as MarketRegime;
  if (normalizedRegime === "BEAR" && benchmarks.isCyclical) {
    adjusted -= 8;
    adjustments.push(
      `Bear regime + cyclical sector (${sector}): -8 penalty`
    );
  }
  if (normalizedRegime === "BEAR" && benchmarks.isDefensive) {
    adjusted += 5;
    adjustments.push(
      `Bear regime + defensive sector (${sector}): +5 bonus`
    );
  }
  if (normalizedRegime === "BULL" && benchmarks.isCyclical) {
    adjusted += 3;
    adjustments.push(
      `Bull regime + cyclical sector (${sector}): +3 bonus`
    );
  }
  if (normalizedRegime === "CAUTION" && benchmarks.isDefensive) {
    adjusted += 4;
    adjustments.push(
      `Caution regime + defensive sector (${sector}): +4 safety premium`
    );
  }

  // Sector ETF momentum: is the ETF's own trend leading or lagging?
  if (sectorETFHistory.length >= 20) {
    const etfPrices = sectorETFHistory;
    const etfSMA20 = computeSMA(etfPrices, 20);
    const etfCurrentPrice = etfPrices[etfPrices.length - 1];
    if (etfCurrentPrice > etfSMA20) {
      adjusted += 3;
      adjustments.push(
        `Sector ETF (${getSectorETF(sector as GICSSector)}) above SMA20: +3 momentum tailwind`
      );
    } else {
      adjusted -= 2;
      adjustments.push(
        `Sector ETF (${getSectorETF(sector as GICSSector)}) below SMA20: -2 sector headwind`
      );
    }
  }

  return {
    symbol,
    sector,
    baseScore,
    sectorAdjustedScore: Math.max(0, Math.min(100, adjusted)),
    adjustments,
    benchmarks,
    components,
  };
}
