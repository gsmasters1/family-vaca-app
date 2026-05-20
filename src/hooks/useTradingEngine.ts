import { useState, useEffect, useRef, useCallback } from 'react';
import { createAlpacaClient } from '../services/alpaca';
import type { AlpacaClient, AlpacaAccount, AlpacaPosition, AlpacaOrder, AlpacaQuote, AlpacaBar, OrderRequest } from '../services/alpaca';
import { getCombinedSignal } from '../services/tradingStrategy';
import type { CombinedSignal } from '../services/tradingStrategy';
import { checkRisk, shouldExitPosition } from '../services/riskManager';
import type { RiskSettings } from '../services/riskManager';
import { DEFAULT_RISK_SETTINGS } from '../services/riskManager';

export const DEFAULT_WATCHLIST = [
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA',
  'BTC/USD', 'ETH/USD', 'SOL/USD',
];

export interface WatchlistEntry {
  quote: AlpacaQuote | null;
  signal: CombinedSignal | null;
  bars: AlpacaBar[];
  signalAge: Date | null;
}

export interface TradingState {
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];
  watchlist: string[];
  watchlistData: Record<string, WatchlistEntry>;
  riskSettings: RiskSettings;
  autoTrading: boolean;
  paperMode: boolean;
  isMarketOpen: boolean;
  loading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  autoTradeLog: string[];
}

export interface TradingEngine {
  state: TradingState;
  toggleAutoTrading(): void;
  togglePaperMode(): void;
  placeManualOrder(req: OrderRequest): Promise<AlpacaOrder>;
  cancelOrder(id: string): Promise<void>;
  closePosition(symbol: string): Promise<void>;
  updateRiskSettings(s: Partial<RiskSettings>): void;
  refreshData(): Promise<void>;
  refreshSignal(symbol: string): Promise<void>;
  addToWatchlist(symbol: string): void;
  removeFromWatchlist(symbol: string): void;
}

const KEY_ID = process.env.ALPACA_KEY_ID || '';
const SECRET_KEY = process.env.ALPACA_SECRET_KEY || '';

export function useTradingEngine(): TradingEngine {
  const [state, setState] = useState<TradingState>({
    account: null,
    positions: [],
    orders: [],
    watchlist: [...DEFAULT_WATCHLIST],
    watchlistData: {},
    riskSettings: { ...DEFAULT_RISK_SETTINGS },
    autoTrading: false,
    paperMode: true,
    isMarketOpen: false,
    loading: true,
    error: null,
    lastRefresh: null,
    autoTradeLog: [],
  });

  const clientRef = useRef<AlpacaClient | null>(null);
  const autoTradeRef = useRef(false);
  const watchlistRef = useRef<string[]>([...DEFAULT_WATCHLIST]);

  // Keep refs in sync for use in intervals
  useEffect(() => { autoTradeRef.current = state.autoTrading; }, [state.autoTrading]);
  useEffect(() => { watchlistRef.current = state.watchlist; }, [state.watchlist]);

  const getClient = useCallback((): AlpacaClient => {
    if (!clientRef.current) {
      clientRef.current = createAlpacaClient(KEY_ID, SECRET_KEY, state.paperMode);
    }
    return clientRef.current;
  }, [state.paperMode]);

  // Recreate client when paper mode toggles
  useEffect(() => {
    clientRef.current = createAlpacaClient(KEY_ID, SECRET_KEY, state.paperMode);
  }, [state.paperMode]);

  const logAutoTrade = (msg: string) => {
    setState((prev) => ({
      ...prev,
      autoTradeLog: [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev.autoTradeLog].slice(0, 50),
    }));
  };

  const refreshData = useCallback(async () => {
    const client = getClient();
    if (!KEY_ID || !SECRET_KEY) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Alpaca API credentials not configured. Set ALPACA_KEY_ID and ALPACA_SECRET_KEY in .env.local',
      }));
      return;
    }

    try {
      const [account, positions, orders, isMarketOpen] = await Promise.all([
        client.getAccount(),
        client.getPositions(),
        client.getOrders('all', 50),
        client.isMarketOpen(),
      ]);

      setState((prev) => ({
        ...prev,
        account,
        positions,
        orders,
        isMarketOpen,
        loading: false,
        error: null,
        lastRefresh: new Date(),
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch account data',
        lastRefresh: new Date(),
      }));
    }
  }, [getClient]);

  const refreshQuotes = useCallback(async () => {
    const client = getClient();
    const symbols = watchlistRef.current;
    if (!KEY_ID || !SECRET_KEY || symbols.length === 0) return;

    try {
      const quotes = await client.getMultiQuotes(symbols);
      setState((prev) => {
        const updated = { ...prev.watchlistData };
        for (const sym of symbols) {
          updated[sym] = {
            quote: quotes[sym] || prev.watchlistData[sym]?.quote || null,
            signal: prev.watchlistData[sym]?.signal || null,
            bars: prev.watchlistData[sym]?.bars || [],
            signalAge: prev.watchlistData[sym]?.signalAge || null,
          };
        }
        return { ...prev, watchlistData: updated };
      });
    } catch {
      // quote refresh failure is silent
    }
  }, [getClient]);

  const refreshSignal = useCallback(async (symbol: string) => {
    const client = getClient();
    if (!KEY_ID || !SECRET_KEY) return;

    try {
      const bars = await client.getBars(symbol, '1Day', 60);
      const signal = await getCombinedSignal(symbol, bars);
      setState((prev) => ({
        ...prev,
        watchlistData: {
          ...prev.watchlistData,
          [symbol]: {
            ...(prev.watchlistData[symbol] || { quote: null }),
            bars,
            signal,
            signalAge: new Date(),
          },
        },
      }));
    } catch {
      // signal refresh failure is silent
    }
  }, [getClient]);

  // Auto-trading loop
  const runAutoTrade = useCallback(async () => {
    if (!autoTradeRef.current) return;

    const client = getClient();
    const isOpen = await client.isMarketOpen();
    if (!isOpen) {
      logAutoTrade('Market closed — skipping auto-trade cycle');
      return;
    }

    logAutoTrade('Running auto-trade cycle...');

    setState((prev) => {
      const { account, positions, riskSettings, watchlistData } = prev;
      if (!account) return prev;

      // Check exit conditions for existing positions
      for (const position of positions) {
        const exitCheck = shouldExitPosition(position, riskSettings);
        if (exitCheck.exit) {
          client.closePosition(position.symbol).then(() => {
            logAutoTrade(`CLOSED ${position.symbol}: ${exitCheck.reason}`);
            refreshData();
          }).catch((err: Error) => logAutoTrade(`Failed to close ${position.symbol}: ${err.message}`));
        }
      }

      // Check entry signals for watchlist
      for (const symbol of watchlistRef.current) {
        const entry = watchlistData[symbol];
        if (!entry?.signal || entry.signal.signal !== 'BUY') continue;
        if (entry.signal.confidence < 0.6) continue;

        const price = entry.quote?.ap || entry.quote?.bp || 0;
        if (price <= 0) continue;

        const riskCheck = checkRisk(account, positions, symbol, 'buy', price, riskSettings);
        if (!riskCheck.approved) {
          logAutoTrade(`SKIP ${symbol} buy: ${riskCheck.reason}`);
          continue;
        }

        client.placeOrder({
          symbol,
          qty: riskCheck.qty,
          side: 'buy',
          type: 'market',
          time_in_force: client.isCrypto(symbol) ? 'gtc' : 'day',
        }).then((order) => {
          logAutoTrade(`BUY ${riskCheck.qty}x ${symbol} @ market (confidence: ${(entry.signal!.confidence * 100).toFixed(0)}%)`);
          refreshData();
          return order;
        }).catch((err: Error) => logAutoTrade(`Failed to buy ${symbol}: ${err.message}`));
      }

      return prev;
    });

    // Refresh signals for all watchlist symbols
    for (const symbol of watchlistRef.current) {
      await refreshSignal(symbol);
    }
  }, [getClient, refreshData, refreshSignal]);

  // Mount: initial load + polling intervals
  useEffect(() => {
    refreshData();
    refreshQuotes();

    const accountInterval = setInterval(refreshData, 30_000);
    const quoteInterval = setInterval(refreshQuotes, 10_000);
    const autoTradeInterval = setInterval(runAutoTrade, 5 * 60_000);

    return () => {
      clearInterval(accountInterval);
      clearInterval(quoteInterval);
      clearInterval(autoTradeInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial signal load for all symbols (deferred so quotes load first)
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const sym of DEFAULT_WATCHLIST) {
        refreshSignal(sym);
      }
    }, 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAutoTrading = () => {
    setState((prev) => {
      const next = !prev.autoTrading;
      if (next) logAutoTrade('Auto-trading ENABLED');
      else logAutoTrade('Auto-trading DISABLED');
      return { ...prev, autoTrading: next };
    });
  };

  const togglePaperMode = () => {
    setState((prev) => ({ ...prev, paperMode: !prev.paperMode, account: null, positions: [], orders: [] }));
  };

  const placeManualOrder = async (req: OrderRequest): Promise<AlpacaOrder> => {
    const order = await getClient().placeOrder(req);
    await refreshData();
    return order;
  };

  const cancelOrder = async (id: string): Promise<void> => {
    await getClient().cancelOrder(id);
    await refreshData();
  };

  const closePosition = async (symbol: string): Promise<void> => {
    await getClient().closePosition(symbol);
    await refreshData();
  };

  const updateRiskSettings = (s: Partial<RiskSettings>) => {
    setState((prev) => ({ ...prev, riskSettings: { ...prev.riskSettings, ...s } }));
  };

  const addToWatchlist = (symbol: string) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setState((prev) => {
      if (prev.watchlist.includes(sym)) return prev;
      const watchlist = [...prev.watchlist, sym];
      watchlistRef.current = watchlist;
      return { ...prev, watchlist };
    });
    refreshSignal(sym);
  };

  const removeFromWatchlist = (symbol: string) => {
    setState((prev) => {
      const watchlist = prev.watchlist.filter((s) => s !== symbol);
      watchlistRef.current = watchlist;
      const watchlistData = { ...prev.watchlistData };
      delete watchlistData[symbol];
      return { ...prev, watchlist, watchlistData };
    });
  };

  return {
    state,
    toggleAutoTrading,
    togglePaperMode,
    placeManualOrder,
    cancelOrder,
    closePosition,
    updateRiskSettings,
    refreshData,
    refreshSignal,
    addToWatchlist,
    removeFromWatchlist,
  };
}
