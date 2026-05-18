import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap?: number;
  assetType: "stock" | "crypto" | "etf" | "derivative";
}

export interface PortfolioPosition {
  id: number;
  symbol: string;
  name: string;
  assetType: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  value: number;
  gainLoss: number;
  gainLossPct: number;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  assetType: string;
  notes: string;
  addedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const marketApi = {
  getQuote: (symbol: string) => api.get<Quote>(`/market/quote/${symbol}`),
  getQuotes: (symbols: string[]) =>
    api.get<Quote[]>(`/market/quotes?symbols=${symbols.join(",")}`),
  getHistory: (symbol: string, period = "1mo") =>
    api.get(`/market/history/${symbol}?period=${period}`),
  getTopMovers: () => api.get<Quote[]>("/market/movers"),
};

export const portfolioApi = {
  getPositions: () => api.get<PortfolioPosition[]>("/portfolio/positions"),
  addPosition: (data: {
    symbol: string;
    shares: number;
    avgCost: number;
    assetType: string;
  }) => api.post("/portfolio/positions", data),
  removePosition: (id: number) => api.delete(`/portfolio/positions/${id}`),
  getSummary: () => api.get("/portfolio/summary"),
};

export const watchlistApi = {
  getItems: () => api.get<WatchlistItem[]>("/watchlist"),
  addItem: (symbol: string, assetType: string, notes = "") =>
    api.post("/watchlist", { symbol, assetType, notes }),
  removeItem: (id: number) => api.delete(`/watchlist/${id}`),
};

export const aiApi = {
  chat: (messages: ChatMessage[], context?: string) =>
    api.post<{ reply: string }>("/ai/chat", { messages, context }),
  analyzeSymbol: (symbol: string) =>
    api.get<{ analysis: string }>(`/ai/analyze/${symbol}`),
};

export const congressApi = {
  getTrades: (limit = 50, filter?: string) =>
    api.get(`/congress/trades?limit=${limit}${filter ? `&filter=${filter}` : ""}`),
  getTradesByTicker: (ticker: string) => api.get(`/congress/trades/${ticker}`),
  scoreATrade: (tradeId: string) => api.get(`/congress/score/${tradeId}`),
  getLeaderboard: () => api.get("/congress/leaderboard"),
  refresh: () => api.post("/congress/refresh"),
};

export const commoditiesApi = {
  getAll: () => api.get("/commodities/all"),
  getCategory: (category: string) => api.get(`/commodities/${category}`),
};

export const signalsApi = {
  getTop: (limit = 10) => api.get(`/signals/top?limit=${limit}`),
  refresh: () => api.get("/signals/refresh"),
};

export const ipoApi = {
  getFilings: () => api.get("/ipo/filings"),
  refresh: () => api.get("/ipo/filings/refresh"),
  score: (id: string) => api.post(`/ipo/score/${id}`),
  getLockupExpiring: (within = 30) => api.get(`/ipo/lockup-expiring?within=${within}`),
};

export const predictionsApi = {
  get: (symbol: string) => api.get(`/predictions/${symbol}`),
  clearCache: (symbol: string) => api.delete(`/predictions/${symbol}/cache`),
  batchWatchlist: () => api.get("/predictions/batch/watchlist"),
  batchPortfolio: () => api.get("/predictions/batch/portfolio"),
};

export const settingsApi = {
  getAll: () => api.get("/settings"),
  update: (key: string, value: string) => api.put(`/settings/${key}`, { value }),
  getModules: () => api.get("/settings/modules"),
};

export const intelligenceApi = {
  getFeed: (minScore = 40, category?: string, limit = 100) =>
    api.get(`/intelligence/feed?minScore=${minScore}${category ? `&category=${category}` : ""}&limit=${limit}`),
  refresh: () => api.post("/intelligence/refresh"),
  getFearGreed: () => api.get("/intelligence/fear-greed"),
  getMacro: () => api.get("/intelligence/macro"),
  getByTicker: (symbol: string) => api.get(`/intelligence/tickers/${symbol}`),
};

export const riskApi = {
  getPortfolio: (profile?: string) =>
    api.get(`/risk/portfolio${profile ? `?profile=${profile}` : ""}`),
  getProfile: () => api.get("/risk/profile"),
  setProfile: (profile: string) => api.put("/risk/profile", { profile }),
  scoreSignal: (symbol: string, assetType: string, confidence: number) =>
    api.get(`/risk/signal/${symbol}?assetType=${assetType}&confidence=${confidence}`),
};

export const apexApi = {
  score: (symbol: string) => api.get(`/apex/score/${symbol}`),
  watchlist: () => api.get("/apex/watchlist"),
  portfolio: () => api.get("/apex/portfolio"),
  regime: () => api.get("/apex/regime"),
  top: () => api.get("/apex/top"),
};

export const tradingApi = {
  getStatus: () => api.get("/trading/status"),
  kill: () => api.post("/trading/kill"),
  resume: () => api.post("/trading/resume"),
  setEnabled: (enabled: boolean) => api.put("/trading/enabled", { enabled }),
  setMode: (paper: boolean) => api.put("/trading/mode", { paper }),
  updateSetting: (key: string, value: string) => api.put("/trading/settings", { key, value }),
  getLog: (limit?: number) => api.get(`/trading/log${limit ? `?limit=${limit}` : ""}`),
  execute: (symbol: string) => api.post(`/trading/execute/${symbol}`),
  closeAll: () => api.post("/trading/close-all"),
};

// CFTC Commitment of Traders — commercial hedger vs managed money positioning
export const cotApi = {
  getAll: () => api.get("/cot"),
  getTicker: (ticker: string) => api.get(`/cot/${ticker}`),
  refresh: () => api.post("/cot/refresh"),
};

// SEC Form 4 insider trades — C-suite and board open-market transactions
export const insiderApi = {
  getLatest: () => api.get("/insider/latest"),
  getTicker: (ticker: string) => api.get(`/insider/${ticker}`),
};
