import type { AlpacaClient, AlpacaBar } from './alpaca';
import type { DeploymentZone } from './macroGate';

// S&P 100 universe — 95 liquid large-caps
export const UNIVERSE: string[] = [
  'AAPL', 'ABBV', 'ABT', 'ACN', 'ADBE', 'AIG', 'AMD', 'AMGN', 'AMZN', 'AXP',
  'BA',   'BAC', 'BK',  'BLK', 'BMY',  'C',   'CAT', 'CL',   'CMCSA','COF',
  'COP',  'COST','CRM', 'CSCO','CVS',  'CVX', 'DE',  'DHR',  'DIS',  'DOW',
  'DUK',  'EMR', 'EXC', 'F',   'FDX',  'GD',  'GE',  'GILD', 'GM',   'GOOG',
  'GS',   'HD',  'HON', 'IBM', 'INTC', 'JNJ', 'JPM', 'KHC',  'KO',   'LIN',
  'LLY',  'LMT', 'LOW', 'MA',  'MCD',  'MDT', 'MET', 'META', 'MMM',  'MO',
  'MRK',  'MS',  'MSFT','NEE', 'NFLX', 'NKE', 'NVDA','ORCL', 'PEP',  'PFE',
  'PG',   'PM',  'PYPL','QCOM','RTX',  'SBUX','SLB', 'SO',   'SPG',  'T',
  'TGT',  'TMO', 'TMUS','TSLA','TXN',  'UNH', 'UNP', 'UPS',  'USB',  'V',
  'VZ',   'WFC', 'WMT', 'XOM',
];

export interface FactorScores {
  momentumCrossover: number;   // 0-100 percentile: 10/50 EMA gap + 3-month return
  volumeSurge: number;         // 0-100 percentile: 5d avg vol / 20d avg vol
  relativeStrength: number;    // 0-100 percentile: 20d stock return minus SPY return
  weekHighProximity: number;   // 0-100 percentile: price / 52-week high (George & Hwang 2004)
  priceAcceleration: number;   // 0-100 percentile: recent 5d vs trailing momentum rate
}

export interface ScannerCandidate {
  symbol: string;
  rank: number;
  compositeScore: number;
  factors: FactorScores;
  price: number;
  dayChangePct: number;
}

export interface ScanResult {
  candidates: ScannerCandidate[];
  allRanked: ScannerCandidate[];   // full sorted universe (not just top N)
  scannedCount: number;
  duration: number;
  asOf: Date;
  macroZone: DeploymentZone;
  threshold: number;
}

// ─── Raw factor computations ────────────────────────────────────────────────

function ema(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(prices.length).fill(0);
  let sum = 0;
  for (let i = 0; i < Math.min(period, prices.length); i++) sum += prices[i];
  out[period - 1] = sum / period;
  for (let i = period; i < prices.length; i++) {
    out[i] = prices[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function avgLast(arr: number[], n: number): number {
  const slice = arr.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// Factor 1: 10/50 EMA gap + 3-month (63-day) return
function rawMomentumCrossover(bars: AlpacaBar[]): number {
  if (bars.length < 55) return 0;
  const closes = bars.map((b) => b.c);
  const e10 = ema(closes, 10);
  const e50 = ema(closes, 50);
  const last = closes.length - 1;

  const emaCross = (e10[last] - e50[last]) / e50[last];           // positive = bullish
  const ret63 = last >= 63 ? (closes[last] - closes[last - 63]) / closes[last - 63] : 0;

  return emaCross * 0.5 + ret63 * 0.5;
}

// Factor 2: 5-day avg volume / 20-day avg volume ratio
function rawVolumeSurge(bars: AlpacaBar[]): number {
  if (bars.length < 22) return 1;
  const vols = bars.map((b) => b.v);
  const vol5 = avgLast(vols, 5);
  const vol20 = avgLast(vols.slice(0, -5), 20);
  return vol20 > 0 ? vol5 / vol20 : 1;
}

// Factor 3: 20-day stock return minus SPY return (spread)
function rawRelativeStrength(bars: AlpacaBar[], spyReturn20d: number): number {
  if (bars.length < 22) return 0;
  const closes = bars.map((b) => b.c);
  const last = closes.length - 1;
  const stockReturn = (closes[last] - closes[last - 20]) / closes[last - 20];
  return stockReturn - spyReturn20d;
}

// Factor 4: current price / 52-week high (George & Hwang 2004)
function raw52WeekHighProximity(bars: AlpacaBar[]): number {
  const window = bars.slice(-252);
  if (window.length < 5) return 0.5;
  const high52 = Math.max(...window.map((b) => b.h));
  const lastClose = window[window.length - 1].c;
  return lastClose / high52;
}

// Factor 5: price acceleration — recent 5d return vs the trailing daily rate
function rawPriceAcceleration(bars: AlpacaBar[]): number {
  if (bars.length < 25) return 0;
  const closes = bars.map((b) => b.c);
  const last = closes.length - 1;

  const ret5 = (closes[last] - closes[last - 5]) / closes[last - 5];
  const ret20 = (closes[last] - closes[last - 20]) / closes[last - 20];
  // 5d return vs proportional slice of 20d return
  const expectedRate = ret20 / 4;
  return ret5 - expectedRate;
}

// ─── Percentile ranking ──────────────────────────────────────────────────────

function percentileRanks(rawValues: number[]): number[] {
  const n = rawValues.length;
  if (n <= 1) return new Array(n).fill(50);
  const sorted = [...rawValues].sort((a, b) => a - b);
  return rawValues.map((v) => {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return (lo / (n - 1)) * 100;
  });
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_KEY = () => `scanner.v2.${new Date().toISOString().slice(0, 10)}`;
const CACHE_TTL = 2 * 60 * 60_000; // 2 hours

function loadCache(): ScanResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY());
    if (!raw) return null;
    const { result, ts } = JSON.parse(raw) as { result: ScanResult; ts: number };
    if (Date.now() - ts > CACHE_TTL) return null;
    return result;
  } catch { return null; }
}

function saveCache(result: ScanResult): void {
  try {
    localStorage.setItem(CACHE_KEY(), JSON.stringify({ result, ts: Date.now() }));
    // Prune old keys
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('scanner.v2.') && k !== CACHE_KEY()) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

// ─── Main scanner ────────────────────────────────────────────────────────────

export interface ScannerOptions {
  useCache?: boolean;
  forceRefresh?: boolean;
  topN?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function runQuantScanner(
  client: AlpacaClient,
  macroZone: DeploymentZone,
  opts: ScannerOptions = {}
): Promise<ScanResult> {
  const { useCache = true, forceRefresh = false, topN = 20, onProgress } = opts;

  // Return cached result if fresh
  if (useCache && !forceRefresh) {
    const cached = loadCache();
    if (cached) {
      onProgress?.(cached.scannedCount, cached.scannedCount);
      return { ...cached, macroZone };
    }
  }

  const t0 = Date.now();
  const universe = [...UNIVERSE];

  onProgress?.(0, universe.length);

  // Fetch SPY bars first (used for RS calculation)
  let spyReturn20d = 0;
  try {
    const spyBars = await client.getBars('SPY', '1Day', 25);
    if (spyBars.length >= 21) {
      const spy = spyBars.map((b) => b.c);
      spyReturn20d = (spy[spy.length - 1] - spy[spy.length - 21]) / spy[spy.length - 21];
    }
  } catch { /* use 0 */ }

  // Batch-fetch all universe bars (20 per batch, 250ms between batches)
  const allBars = await client.getMultiBars(universe, '1Day', 260);
  const validSymbols = universe.filter((s) => (allBars[s]?.length ?? 0) >= 55);

  onProgress?.(validSymbols.length, universe.length);

  // Compute raw factor values for all valid symbols
  const rawMC: number[] = [];
  const rawVS: number[] = [];
  const rawRS: number[] = [];
  const rawWH: number[] = [];
  const rawPA: number[] = [];

  for (const sym of validSymbols) {
    const bars = allBars[sym];
    rawMC.push(rawMomentumCrossover(bars));
    rawVS.push(rawVolumeSurge(bars));
    rawRS.push(rawRelativeStrength(bars, spyReturn20d));
    rawWH.push(raw52WeekHighProximity(bars));
    rawPA.push(rawPriceAcceleration(bars));
  }

  // Convert each factor to percentile ranks (0-100) across the universe
  const pMC = percentileRanks(rawMC);
  const pVS = percentileRanks(rawVS);
  const pRS = percentileRanks(rawRS);
  const pWH = percentileRanks(rawWH);
  const pPA = percentileRanks(rawPA);

  // Build candidate objects with equal-weight composite
  const allCandidates: ScannerCandidate[] = validSymbols.map((sym, i) => {
    const bars = allBars[sym];
    const closes = bars.map((b) => b.c);
    const last = closes.length - 1;
    const price = closes[last];
    const dayChangePct = last >= 1
      ? ((closes[last] - closes[last - 1]) / closes[last - 1]) * 100
      : 0;

    const factors: FactorScores = {
      momentumCrossover: pMC[i],
      volumeSurge: pVS[i],
      relativeStrength: pRS[i],
      weekHighProximity: pWH[i],
      priceAcceleration: pPA[i],
    };
    const compositeScore =
      (factors.momentumCrossover + factors.volumeSurge + factors.relativeStrength +
       factors.weekHighProximity + factors.priceAcceleration) / 5;

    return { symbol: sym, rank: 0, compositeScore, factors, price, dayChangePct };
  });

  // Sort descending by composite score and assign ranks
  allCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
  allCandidates.forEach((c, i) => { c.rank = i + 1; });

  // Apply macro-gated threshold
  const threshold =
    macroZone === 'DEFENSIVE' ? Infinity :
    macroZone === 'REDUCED' ? 75 : 60;

  const candidates = macroZone === 'DEFENSIVE'
    ? []
    : allCandidates.filter((c) => c.compositeScore >= threshold).slice(0, topN);

  const result: ScanResult = {
    candidates,
    allRanked: allCandidates,
    scannedCount: validSymbols.length,
    duration: Date.now() - t0,
    asOf: new Date(),
    macroZone,
    threshold,
  };

  saveCache(result);
  return result;
}
