import { Router } from "express";
import { chat, isAvailable } from "../services/ollamaService";
import { getQuote, getHistory } from "../services/marketData";

const router = Router();

router.post("/chat", async (req, res) => {
  const { messages, context } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    context?: string;
  };

  if (!messages?.length) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const available = await isAvailable();
  if (!available) {
    return res.status(503).json({
      error:
        "Ollama is not running. Start it with: ollama serve && ollama pull llama3.1:8b",
    });
  }

  try {
    const allMessages = context
      ? [
          { role: "user" as const, content: `Context: ${context}` },
          { role: "assistant" as const, content: "Understood, I have that context." },
          ...messages,
        ]
      : messages;

    const reply = await chat(allMessages);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "AI generation failed" });
  }
});

router.get("/analyze/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  const available = await isAvailable();
  if (!available) {
    return res.status(503).json({ error: "Ollama is not running" });
  }

  try {
    const [quote, history] = await Promise.all([
      getQuote(symbol),
      getHistory(symbol, "3mo"),
    ]);

    const recentPrices = history.slice(-10).map((h) => `${h.date}: $${h.close.toFixed(2)}`).join(", ");
    const context = `
Symbol: ${symbol}
Name: ${quote.name}
Asset Type: ${quote.assetType}
Current Price: $${quote.price.toFixed(2)}
Change: ${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)} (${quote.changePct.toFixed(2)}%)
Recent price history (last 10 data points): ${recentPrices}
    `.trim();

    const reply = await chat([
      {
        role: "user",
        content: `Analyze ${symbol} based on this data and provide a brief investment analysis:\n${context}`,
      },
    ]);

    res.json({ analysis: reply });
  } catch {
    res.status(500).json({ error: "Analysis failed" });
  }
});

export default router;
