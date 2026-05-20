import type { AlpacaClient, AlpacaBar } from './alpaca';
import { calculateEMA } from './tradingStrategy';

export type DeploymentZone = 'FULL_DEPLOY' | 'REDUCED' | 'DEFENSIVE';

export interface MacroSignals {
  trend: number;          // 0-100: SPY > 200-day SMA + slope
  volatility: number;     // 0-100: low vol = high score
  breadth: number;        // 0-100: % of sector ETFs above 50-day SMA
}

export interface MacroResult {
  zone: DeploymentZone;
  score: number;           // 0-100 composite
  sizingMultiplier: number; // 1.0 / 0.6 / 0.25
  signals: MacroSignals;
  allowNewLongs: boolean;
  summary: string;
  asOf: Date;
}

const SECTOR_ETFS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC'];
const VIX_PROXY = 'VIXY';   // VIX short-term futures ETF (Alpaca tradeable)
const BENCHMARK = 'SPY';

function sma(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] || 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function scoreTrend(bars: AlpacaBar[]): number {
  if (bars.length < 200) return 50;
  const closes = bars.map((b) => b.c);
  const last = closes[closes.length - 1];
  const sma200 = sma(closes, 200);
  const sma50 = sma(closes, 50);

  // Distance above/below 200-day, capped at +/- 15%
  const pctVs200 = ((last - sma200) / sma200) * 100;
  const trendScore = Math.max(0, Math.min(100, 50 + pctVs200 * 3.33));

  // Bonus if 50-day is also above 200-day (golden cross territory)
  const bonus = sma50 > sma200 ? 10 : -10;
  return Math.max(0, Math.min(100, trendScore + bonus));
}

function scoreVolatility(vixBars: AlpacaBar[]): number {
  if (vixBars.length < 60) return 50;
  const closes = vixBars.map((b) => b.c);
  const last = closes[closes.length - 1];
  const avg60 = sma(closes, 60);

  // VIXY higher than 60-day avg = elevated vol = lower score
  const ratio = last / avg60;
  if (ratio < 0.85) return 90;
  if (ratio < 0.95) return 75;
  if (ratio < 1.05) return 60;
  if (ratio < 1.15) return 40;
  if (ratio < 1.30) return 20;
  return 5;
}

async function scoreBreadth(client: AlpacaClient): Promise<number> {
  let above = 0;
  let total = 0;

  for (const etf of SECTOR_ETFS) {
    try {
      const bars = await client.getBars(etf, '1Day', 60);
      if (bars.length < 50) continue;
      total += 1;
      const closes = bars.map((b) => b.c);
      const last = closes[closes.length - 1];
      const sma50 = sma(closes, 50);
      if (last > sma50) above += 1;
    } catch {
      // skip on individual ETF failure
    }
  }

  if (total === 0) return 50;
  return (above / total) * 100;
}

function compositeScore(signals: MacroSignals): number {
  // Weighted: trend 40%, vol 35%, breadth 25%
  return signals.trend * 0.4 + signals.volatility * 0.35 + signals.breadth * 0.25;
}

function zoneFromScore(score: number): { zone: DeploymentZone; sizing: number } {
  if (score >= 65) return { zone: 'FULL_DEPLOY', sizing: 1.0 };
  if (score >= 40) return { zone: 'REDUCED', sizing: 0.6 };
  return { zone: 'DEFENSIVE', sizing: 0.25 };
}

export async function evaluateMacroGate(client: AlpacaClient): Promise<MacroResult> {
  let spyBars: AlpacaBar[] = [];
  let vixBars: AlpacaBar[] = [];

  try {
    spyBars = await client.getBars(BENCHMARK, '1Day', 250);
  } catch {
    // continue with default trend score
  }
  try {
    vixBars = await client.getBars(VIX_PROXY, '1Day', 80);
  } catch {
    // continue with default vol score
  }

  const trend = scoreTrend(spyBars);
  const volatility = scoreVolatility(vixBars);
  const breadth = await scoreBreadth(client);

  const signals: MacroSignals = { trend, volatility, breadth };
  const score = compositeScore(signals);
  const { zone, sizing } = zoneFromScore(score);

  let summary = '';
  if (zone === 'FULL_DEPLOY') summary = `Macro favorable — trend up, vol contained, breadth healthy. Full sizing.`;
  else if (zone === 'REDUCED') summary = `Mixed macro — sizing reduced to ${(sizing * 100).toFixed(0)}%. Selective entries only.`;
  else summary = `Defensive macro — no new longs. Protect capital, only manage existing positions.`;

  return {
    zone,
    score,
    sizingMultiplier: sizing,
    signals,
    allowNewLongs: zone !== 'DEFENSIVE',
    summary,
    asOf: new Date(),
  };
}
