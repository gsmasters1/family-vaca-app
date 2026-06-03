import { Router } from "express";
import {
  refreshIntelligenceFeed,
  getCachedFeed,
  getFearAndGreed,
  fetchMacroSnapshot,
} from "../services/webScraperService";
import { getSetting } from "../services/appConfig";

const router = Router();

router.get("/feed", (req, res) => {
  const minScore = parseInt(String(req.query.minScore ?? "0"), 10);
  const category = req.query.category ? String(req.query.category) : undefined;
  const limit = parseInt(String(req.query.limit ?? "100"), 10);
  res.json(getCachedFeed(minScore, category, limit));
});

router.post("/refresh", async (_req, res) => {
  const items = await refreshIntelligenceFeed();
  res.json({ count: items.length, items: items.slice(0, 20) });
});

router.get("/fear-greed", async (_req, res) => {
  res.json(await getFearAndGreed());
});

router.get("/macro", async (_req, res) => {
  const apiKey = getSetting("fred_api_key") ?? "none";
  res.json(await fetchMacroSnapshot(apiKey));
});

router.get("/tickers/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const feed = getCachedFeed(0, undefined, 200);
  const related = feed.filter((item) =>
    item.tickers.includes(symbol) ||
    item.title.includes(symbol)
  ).slice(0, 20);
  res.json(related);
});

export default router;
