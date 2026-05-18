export interface TechnicalIndicators {
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  rsi14: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  volumeRatio: number;
  high52w: number;
  low52w: number;
  priceVsSma20Pct: number;
  trend: "uptrend" | "downtrend" | "sideways";
}

interface HistoricalBar {
  date: string;
  close: number;
  volume?: number;
}

function sma(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  if (slice.length < period) return prices[prices.length - 1] ?? 0;
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let result = prices[0];
  for (let i = 1; i < prices.length; i++) {
    result = prices[i] * k + result * (1 - k);
  }
  return result;
}

function rsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));
  const avgGain = sma(gains.slice(-period), period);
  const avgLoss = sma(losses.slice(-period), period);
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function bollingerBands(
  prices: number[],
  period = 20
): { upper: number; middle: number; lower: number } {
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance =
    slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance);
  return { upper: middle + 2 * stdDev, middle, lower: middle - 2 * stdDev };
}

export function computeIndicators(bars: HistoricalBar[]): TechnicalIndicators {
  const prices = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume ?? 0);

  const ema12v = ema(prices, 12);
  const ema26v = ema(prices, 26);
  const macdLine = ema12v - ema26v;

  const macdHistory = prices.map((_, i) => {
    if (i < 26) return 0;
    return ema(prices.slice(0, i + 1), 12) - ema(prices.slice(0, i + 1), 26);
  });
  const macdSignalLine = ema(macdHistory.filter(Boolean), 9);

  const bb = bollingerBands(prices);
  const sma20v = sma(prices, 20);
  const sma50v = sma(prices, 50);
  const sma200v = sma(prices, 200);

  const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const avgVol20 = sma(volumes, 20);

  const high52w = Math.max(...prices.slice(-252));
  const low52w = Math.min(...prices.slice(-252));

  const currentPrice = prices[prices.length - 1];

  let trend: TechnicalIndicators["trend"] = "sideways";
  if (sma20v > sma50v && sma50v > sma200v) trend = "uptrend";
  else if (sma20v < sma50v && sma50v < sma200v) trend = "downtrend";

  return {
    sma20: sma20v,
    sma50: sma50v,
    sma200: sma200v,
    ema12: ema12v,
    ema26: ema26v,
    macd: macdLine,
    macdSignal: macdSignalLine,
    macdHistogram: macdLine - macdSignalLine,
    rsi14: rsi(prices),
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    volumeRatio: avgVol20 > 0 ? recentVol / avgVol20 : 1,
    high52w,
    low52w,
    priceVsSma20Pct: sma20v > 0 ? ((currentPrice - sma20v) / sma20v) * 100 : 0,
    trend,
  };
}

export function buildIndicatorSummary(
  symbol: string,
  price: number,
  indicators: TechnicalIndicators
): string {
  return `
Symbol: ${symbol}
Current Price: $${price.toFixed(2)}
Trend: ${indicators.trend.toUpperCase()}
RSI(14): ${indicators.rsi14.toFixed(1)} [${indicators.rsi14 > 70 ? "OVERBOUGHT" : indicators.rsi14 < 30 ? "OVERSOLD" : "neutral"}]
MACD: ${indicators.macd.toFixed(4)} | Signal: ${indicators.macdSignal.toFixed(4)} | Hist: ${indicators.macdHistogram.toFixed(4)} [${indicators.macdHistogram > 0 ? "bullish" : "bearish"}]
SMA20: $${indicators.sma20.toFixed(2)} | SMA50: $${indicators.sma50.toFixed(2)} | SMA200: $${indicators.sma200.toFixed(2)}
Bollinger: Upper $${indicators.bbUpper.toFixed(2)} | Mid $${indicators.bbMiddle.toFixed(2)} | Lower $${indicators.bbLower.toFixed(2)}
Price vs SMA20: ${indicators.priceVsSma20Pct.toFixed(2)}%
Volume vs 20-day avg: ${indicators.volumeRatio.toFixed(2)}x
52-week High: $${indicators.high52w.toFixed(2)} | Low: $${indicators.low52w.toFixed(2)}
  `.trim();
}
