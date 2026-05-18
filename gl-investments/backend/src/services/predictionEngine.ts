import axios from "axios";
import { getDb } from "./database";
import { getQuote, getHistory } from "./marketData";
import { computeIndicators, buildIndicatorSummary } from "./technicalAnalysis";
import { getOllamaConfig } from "./appConfig";

const CACHE_TTL_HOURS = 4;

export interface Prediction {
  symbol: string;
  currentPrice: number;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  targetPrice1Week: number;
  targetPrice1Month: number;
  stopLoss: number;
  summary: string;
  signals: string[];
  indicators: {
    rsi: number;
    macd: number;
    trend: string;
    volumeRatio: number;
    priceVsSma20: number;
  };
  generatedAt: string;
}

export async function getPrediction(symbol: string): Promise<Prediction> {
  const db = getDb();

  const cached = db
    .prepare(
      `SELECT data FROM prediction_cache WHERE symbol = ?
       AND datetime(cached_at, '+${CACHE_TTL_HOURS} hours') > datetime('now')`
    )
    .get(symbol) as { data: string } | undefined;

  if (cached) return JSON.parse(cached.data) as Prediction;

  const [quote, history] = await Promise.all([
    getQuote(symbol),
    getHistory(symbol, "1y"),
  ]);

  const indicators = computeIndicators(history);
  const summary = buildIndicatorSummary(symbol, quote.price, indicators);
  const { baseUrl, model } = getOllamaConfig();

  const prompt = `You are a quantitative analyst. Analyze these technical indicators and provide a price prediction.

${summary}

Respond with ONLY valid JSON, no other text:
{
  "direction": "bullish|bearish|neutral",
  "confidence": <integer 1-100>,
  "targetPrice1Week": <number>,
  "targetPrice1Month": <number>,
  "stopLoss": <number>,
  "summary": "<2 concise sentences>",
  "signals": ["<signal1>", "<signal2>", "<signal3>"]
}`;

  let aiResult: Omit<Prediction, "symbol" | "currentPrice" | "indicators" | "generatedAt">;

  try {
    const response = await axios.post(
      `${baseUrl}/api/chat`,
      {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      },
      { timeout: 90_000 }
    );

    const content: string = response.data.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    aiResult = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: derive from indicators
    const rsi = indicators.rsi14;
    const isBullish = indicators.trend === "uptrend" && rsi < 65 && indicators.macdHistogram > 0;
    const isBearish = indicators.trend === "downtrend" && rsi > 40 && indicators.macdHistogram < 0;
    aiResult = {
      direction: isBullish ? "bullish" : isBearish ? "bearish" : "neutral",
      confidence: 50,
      targetPrice1Week: quote.price * (isBullish ? 1.02 : isBearish ? 0.98 : 1.0),
      targetPrice1Month: quote.price * (isBullish ? 1.06 : isBearish ? 0.94 : 1.0),
      stopLoss: quote.price * 0.95,
      summary: "Technical analysis inconclusive. AI engine unavailable.",
      signals: [
        `RSI: ${rsi.toFixed(1)}`,
        `Trend: ${indicators.trend}`,
        `Volume ratio: ${indicators.volumeRatio.toFixed(2)}x`,
      ],
    };
  }

  const prediction: Prediction = {
    symbol,
    currentPrice: quote.price,
    direction: aiResult.direction,
    confidence: aiResult.confidence,
    targetPrice1Week: aiResult.targetPrice1Week,
    targetPrice1Month: aiResult.targetPrice1Month,
    stopLoss: aiResult.stopLoss,
    summary: aiResult.summary,
    signals: aiResult.signals,
    indicators: {
      rsi: indicators.rsi14,
      macd: indicators.macdHistogram,
      trend: indicators.trend,
      volumeRatio: indicators.volumeRatio,
      priceVsSma20: indicators.priceVsSma20Pct,
    },
    generatedAt: new Date().toISOString(),
  };

  db.prepare(
    "INSERT OR REPLACE INTO prediction_cache (symbol, data, cached_at) VALUES (?, ?, datetime('now'))"
  ).run(symbol, JSON.stringify(prediction));

  return prediction;
}

export async function getBatchPredictions(symbols: string[]): Promise<Prediction[]> {
  return (
    await Promise.all(symbols.map((s) => getPrediction(s).catch(() => null)))
  ).filter(Boolean) as Prediction[];
}
