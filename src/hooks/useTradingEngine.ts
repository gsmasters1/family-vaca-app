import { useState, useEffect, useRef, useCallback } from 'react';
import { createAlpacaClient } from '../services/alpaca';
import type { AlpacaClient, AlpacaAccount, AlpacaPosition, AlpacaOrder, AlpacaQuote, AlpacaBar, OrderRequest } from '../services/alpaca';
import { getCombinedSignal } from '../services/tradingStrategy';
import type { CombinedSignal } from '../services/tradingStrategy';
import { checkRisk, shouldExitPosition } from '../services/riskManager';
import type { RiskSettings } from '../services/riskManager';
import { DEFAULT_RISK_SETTINGS } from '../services/riskManager';
import {
  DEFAULT_BREAKER_SETTINGS,
  evaluateBreaker,
  loadBreakerState,
  saveBreakerState,
  resetBreaker,
  onCircuitTripped,
  isBuyBlocked,
  canResume,
} from '../services/circuitBreaker';
import type { CircuitBreakerSettings, CircuitBreakerState } from '../services/circuitBreaker';
import { evaluateMacroGate } from '../services/macroGate';
import type { MacroResult } from '../services/macroGate';
import { runQuantScanner } from '../services/scanner';
import type { ScanResult } from '../services/scanner';

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

export interface ScannerState {
  result: ScanResult | null;
  isRunning: boolean;
  progress: { done: number; total: number };
  error: string | null;
}

export interface TradingState {
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];
  watchlist: string[];
  watchlistData: Record<string, WatchlistEntry>;
  riskSettings: RiskSettings;
  breakerSettings: CircuitBreakerSettings;
  breakerState: CircuitBreakerState;
  macro: MacroResult | null;
  scanner: ScannerState;
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
  updateBreakerSettings(s: Partial<CircuitBreakerSettings>): void;
  resetCircuitBreaker(): void;
  refreshMacroGate(): Promise<void>;
  runScanner(forceRefresh?: boolean): Promise<void>;
  addScannerCandidateToWatchlist(symbol: string): void;
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
    breakerSettings: { ...DEFAULT_BREAKER_SETTINGS },
    breakerState: loadBreakerState(),
    macro: null,
    scanner: { result: null, isRunning: false, progress: { done: 0, total: 0 }, error: null },
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

      setState((prev) => {
        const evalResult = evaluateBreaker({
          account,
          settings: prev.breakerSettings,
          prevState: prev.breakerState,
        });
        const nextBreakerState = evalResult.state;
        saveBreakerState(nextBreakerState);

        if (evalResult.newlyTripped) {
          logAutoTrade(`CIRCUIT BREAKER TRIPPED: ${evalResult.tripReason}`);
          onCircuitTripped(() => client.cancelAllOrders()).catch(() => undefined);
        }

        return {
          ...prev,
          account,
          positions,
          orders,
          isMarketOpen,
          breakerState: nextBreakerState,
          loading: false,
          error: null,
          lastRefresh: new Date(),
        };
      });
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

  // Macro gate refresh — runs less frequently than signals
  const refreshMacroGate = useCallback(async () => {
    const client = getClient();
    if (!KEY_ID || !SECRET_KEY) return;
    try {
      const macro = await evaluateMacroGate(client);
      setState((prev) => ({ ...prev, macro }));
    } catch {
      // silent — keep previous macro state
    }
  }, [getClient]);

  const runScanner = useCallback(async (forceRefresh = false) => {
    const client = getClient();
    if (!KEY_ID || !SECRET_KEY) return;

    setState((prev) => ({
      ...prev,
      scanner: { ...prev.scanner, isRunning: true, error: null, progress: { done: 0, total: 95 } },
    }));

    try {
      const zone = state.macro?.zone ?? 'FULL_DEPLOY';
      const result = await runQuantScanner(client, zone, {
        forceRefresh,
        useCache: !forceRefresh,
        topN: 20,
        onProgress: (done, total) => {
          setState((prev) => ({
            ...prev,
            scanner: { ...prev.scanner, progress: { done, total } },
          }));
        },
      });

      logAutoTrade(`Scanner: ${result.scannedCount} symbols scanned, ${result.candidates.length} candidates (threshold ${result.threshold.toFixed(0)})`);

      setState((prev) => ({
        ...prev,
        scanner: { result, isRunning: false, progress: { done: result.scannedCount, total: result.scannedCount }, error: null },
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        scanner: { ...prev.scanner, isRunning: false, error: err instanceof Error ? err.message : 'Scanner failed' },
      }));
    }
  }, [getClient, state.macro?.zone]);

  const addScannerCandidateToWatchlist = (symbol: string) => {
    addToWatchlist(symbol);
    logAutoTrade(`Added scanner candidate ${symbol} to watchlist`);
  };

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
      const { account, positions, riskSettings, watchlistData, breakerState, breakerSettings, macro } = prev;
      if (!account) return prev;

      // CIRCUIT BREAKER — halt new buys when tripped
      if (isBuyBlocked(breakerState, breakerSettings)) {
        logAutoTrade(`Circuit breaker active — auto-trade halted (${breakerState.reason || 'tripped'})`);
        return prev;
      }

      // Check exit conditions for existing positions (sells always allowed unless block_all)
      for (const position of positions) {
        const exitCheck = shouldExitPosition(position, riskSettings);
        if (exitCheck.exit) {
          client.closePosition(position.symbol).then(() => {
            logAutoTrade(`CLOSED ${position.symbol}: ${exitCheck.reason}`);
            refreshData();
          }).catch((err: Error) => logAutoTrade(`Failed to close ${position.symbol}: ${err.message}`));
        }
      }

      // MACRO GATE — block new longs in defensive regime
      if (macro && !macro.allowNewLongs) {
        logAutoTrade(`Macro DEFENSIVE — new longs disabled (score: ${macro.score.toFixed(0)})`);
        return prev;
      }

      const sizingMultiplier = macro?.sizingMultiplier ?? 1.0;

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

        // Apply macro sizing multiplier
        const adjQty = Math.max(1, Math.floor(riskCheck.qty * sizingMultiplier));

        client.placeOrder({
          symbol,
          qty: adjQty,
          side: 'buy',
          type: 'market',
          time_in_force: client.isCrypto(symbol) ? 'gtc' : 'day',
        }).then((order) => {
          const sizingNote = sizingMultiplier < 1 ? ` (macro ${(sizingMultiplier * 100).toFixed(0)}% sizing)` : '';
          logAutoTrade(`BUY ${adjQty}x ${symbol} @ market${sizingNote} (conf: ${(entry.signal!.confidence * 100).toFixed(0)}%)`);
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
    refreshMacroGate();

    const accountInterval = setInterval(refreshData, 30_000);
    const quoteInterval = setInterval(refreshQuotes, 10_000);
    const autoTradeInterval = setInterval(runAutoTrade, 5 * 60_000);
    // Macro signals change slowly — refresh every 15 minutes
    const macroInterval = setInterval(refreshMacroGate, 15 * 60_000);

    return () => {
      clearInterval(accountInterval);
      clearInterval(quoteInterval);
      clearInterval(autoTradeInterval);
      clearInterval(macroInterval);
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

  const updateBreakerSettings = (s: Partial<CircuitBreakerSettings>) => {
    setState((prev) => ({ ...prev, breakerSettings: { ...prev.breakerSettings, ...s } }));
  };

  const resetCircuitBreaker = () => {
    setState((prev) => {
      const resume = canResume(prev.breakerState, prev.breakerSettings);
      if (!resume.ok) {
        const minsLeft = Math.ceil(resume.waitMs / 60_000);
        logAutoTrade(`Cannot reset breaker — cooldown ${minsLeft} min remaining`);
        return prev;
      }
      const next = resetBreaker(prev.breakerState);
      saveBreakerState(next);
      logAutoTrade('Circuit breaker manually RESET');
      return { ...prev, breakerState: next };
    });
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
    updateBreakerSettings,
    resetCircuitBreaker,
    refreshMacroGate,
    runScanner,
    addScannerCandidateToWatchlist,
    refreshData,
    refreshSignal,
    addToWatchlist,
    removeFromWatchlist,
  };
}
