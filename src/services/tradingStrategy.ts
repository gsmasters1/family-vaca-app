import { GoogleGenAI } from '@google/genai';
import type { AlpacaBar } from './alpaca';

export interface IndicatorResult {
  ema9: number;
  ema21: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  prevEma9: number;
  prevEma21: number;
  prevMacdHistogram: number;
}

export interface SignalResult {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasons: string[];
}

export interface AISignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  summary: string;
}

export interface CombinedSignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasons: string[];
  technicalSignal: SignalResult;
  aiSignal?: AISignal;
}

export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return prices.map(() => 0);
  const k = 2 / (period + 1);
  const emas: number[] = new Array(prices.length).fill(0);

  // Seed with SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  emas[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    emas[i] = prices[i] * k + emas[i - 1] * (1 - k);
  }

  return emas;
}

export function calculateRSI(prices: number[], period = 14): number[] {
  if (prices.length < period + 1) return prices.map(() => 50);

  const rsis: number[] = new Array(prices.length).fill(50);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }

  // Initial averages (SMA of first `period` values)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const toRSI = (ag: number, al: number) => (al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  rsis[period] = toRSI(avgGain, avgLoss);

  for (let i = period + 1; i < prices.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    rsis[i] = toRSI(avgGain, avgLoss);
  }

  return rsis;
}

export function calculateMACD(
  prices: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = calculateEMA(prices, fast);
  const emaSlow = calculateEMA(prices, slow);
  const macdLine = prices.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = calculateEMA(macdLine, signal);
  const histogram = macdLine.map((m, i) => m - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

export function analyzeIndicators(bars: AlpacaBar[]): IndicatorResult | null {
  if (bars.length < 30) return null;

  const closes = bars.map((b) => b.c);
  const ema9s = calculateEMA(closes, 9);
  const ema21s = calculateEMA(closes, 21);
  const rsis = calculateRSI(closes, 14);
  const { macd, signal, histogram } = calculateMACD(closes);

  const last = closes.length - 1;
  return {
    ema9: ema9s[last],
    ema21: ema21s[last],
    rsi14: rsis[last],
    macd: macd[last],
    macdSignal: signal[last],
    macdHistogram: histogram[last],
    prevEma9: ema9s[last - 1],
    prevEma21: ema21s[last - 1],
    prevMacdHistogram: histogram[last - 1],
  };
}

export function generateTechnicalSignal(ind: IndicatorResult): SignalResult {
  const reasons: string[] = [];
  let bullScore = 0;
  let bearScore = 0;

  // EMA crossover
  const emaCrossedUp = ind.prevEma9 <= ind.prevEma21 && ind.ema9 > ind.ema21;
  const emaCrossedDown = ind.prevEma9 >= ind.prevEma21 && ind.ema9 < ind.ema21;
  const emaAbove = ind.ema9 > ind.ema21;

  if (emaCrossedUp) { bullScore += 2; reasons.push('EMA 9 crossed above EMA 21'); }
  if (emaCrossedDown) { bearScore += 2; reasons.push('EMA 9 crossed below EMA 21'); }
  if (emaAbove && !emaCrossedUp) { bullScore += 0.5; }
  if (!emaAbove && !emaCrossedDown) { bearScore += 0.5; }

  // RSI
  if (ind.rsi14 < 35) { bullScore += 1.5; reasons.push(`RSI oversold (${ind.rsi14.toFixed(1)})`); }
  if (ind.rsi14 > 70) { bearScore += 1.5; reasons.push(`RSI overbought (${ind.rsi14.toFixed(1)})`); }
  if (ind.rsi14 > 75) { bearScore += 1; }

  // MACD histogram turning positive/negative
  const macdTurnedUp = ind.prevMacdHistogram < 0 && ind.macdHistogram > 0;
  const macdTurnedDown = ind.prevMacdHistogram > 0 && ind.macdHistogram < 0;

  if (macdTurnedUp) { bullScore += 1.5; reasons.push('MACD histogram turned positive'); }
  if (macdTurnedDown) { bearScore += 1.5; reasons.push('MACD histogram turned negative'); }
  if (ind.macdHistogram > 0) { bullScore += 0.5; }
  if (ind.macdHistogram < 0) { bearScore += 0.5; }

  const total = bullScore + bearScore;
  const threshold = 2;

  if (bullScore >= threshold && bullScore > bearScore) {
    return { signal: 'BUY', confidence: Math.min(bullScore / 6, 1), reasons };
  }
  if (bearScore >= threshold && bearScore > bullScore) {
    return { signal: 'SELL', confidence: Math.min(bearScore / 6, 1), reasons };
  }
  return {
    signal: 'HOLD',
    confidence: 0.5,
    reasons: reasons.length > 0 ? reasons : ['No strong directional signal'],
  };
}

export async function generateAISignal(symbol: string, bars: AlpacaBar[]): Promise<AISignal> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { signal: 'HOLD', confidence: 0, summary: 'No Gemini API key configured' };

  try {
    const recent = bars.slice(-10);
    const priceData = recent
      .map((b) => `${b.t.slice(0, 10)}: O=${b.o.toFixed(2)} H=${b.h.toFixed(2)} L=${b.l.toFixed(2)} C=${b.c.toFixed(2)} V=${b.v}`)
      .join('\n');

    const firstClose = recent[0].c;
    const lastClose = recent[recent.length - 1].c;
    const pctChange = ((lastClose - firstClose) / firstClose) * 100;

    const prompt = `Analyze the following recent price data for ${symbol} and provide a trading signal.

Recent OHLCV data (last 10 bars):
${priceData}

10-bar price change: ${pctChange.toFixed(2)}%

Based on this price action, provide a JSON response with:
- signal: "BUY", "SELL", or "HOLD"
- confidence: 0.0 to 1.0
- summary: one sentence explaining the signal

Respond with ONLY valid JSON like: {"signal":"BUY","confidence":0.7,"summary":"Price consolidating above support with increasing volume."}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    const text = (response.text || '').replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(text) as AISignal;
    return {
      signal: ['BUY', 'SELL', 'HOLD'].includes(parsed.signal) ? parsed.signal : 'HOLD',
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
      summary: parsed.summary || 'AI analysis unavailable',
    };
  } catch {
    return { signal: 'HOLD', confidence: 0, summary: 'AI analysis failed' };
  }
}

export async function getCombinedSignal(symbol: string, bars: AlpacaBar[]): Promise<CombinedSignal> {
  const indicators = analyzeIndicators(bars);

  if (!indicators) {
    return {
      signal: 'HOLD',
      confidence: 0,
      reasons: ['Insufficient price history for analysis'],
      technicalSignal: { signal: 'HOLD', confidence: 0, reasons: ['Not enough bars'] },
    };
  }

  const techSignal = generateTechnicalSignal(indicators);
  const aiSignal = await generateAISignal(symbol, bars);

  // Weight: 70% technical, 30% AI
  const signalScore = (sig: 'BUY' | 'SELL' | 'HOLD', conf: number) => {
    if (sig === 'BUY') return conf;
    if (sig === 'SELL') return -conf;
    return 0;
  };

  const combined =
    signalScore(techSignal.signal, techSignal.confidence) * 0.7 +
    signalScore(aiSignal.signal, aiSignal.confidence) * 0.3;

  const finalSignal: 'BUY' | 'SELL' | 'HOLD' =
    combined > 0.2 ? 'BUY' : combined < -0.2 ? 'SELL' : 'HOLD';
  const finalConfidence = Math.abs(combined);

  return {
    signal: finalSignal,
    confidence: finalConfidence,
    reasons: [...techSignal.reasons, ...(aiSignal.summary ? [`AI: ${aiSignal.summary}`] : [])],
    technicalSignal: techSignal,
    aiSignal,
  };
}
