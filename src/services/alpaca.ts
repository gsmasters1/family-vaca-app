export interface AlpacaAccount {
  id: string;
  buying_power: number;
  portfolio_value: number;
  cash: number;
  equity: number;
  last_equity: number;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  account_blocked: boolean;
  status: string;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  qty: number;
  qty_available: number;
  avg_entry_price: number;
  current_price: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  market_value: number;
  side: 'long' | 'short';
  asset_class: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: number;
  filled_qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  status: string;
  filled_avg_price: number | null;
  limit_price: number | null;
  stop_price: number | null;
  time_in_force: string;
  created_at: string;
  submitted_at: string;
  filled_at: string | null;
}

export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface AlpacaQuote {
  symbol: string;
  ap: number;
  bp: number;
  as: number;
  bs: number;
  t?: string;
}

export interface OrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'gtc' | 'day' | 'ioc' | 'opg';
  limit_price?: number;
  stop_price?: number;
}

export interface AlpacaClock {
  is_open: boolean;
  next_open: string;
  next_close: string;
}

const CRYPTO_SYMBOLS = new Set(['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'DOGE/USD', 'LTC/USD', 'BCH/USD']);

function isCryptoSymbol(symbol: string): boolean {
  return CRYPTO_SYMBOLS.has(symbol) || symbol.includes('/');
}

function alpacaSymbol(symbol: string): string {
  // Alpaca crypto uses BTC/USD format in orders but BTCUSD in some data endpoints
  return symbol;
}

async function alpacaFetch<T>(
  baseUrl: string,
  path: string,
  keyId: string,
  secretKey: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'APCA-API-KEY-ID': keyId,
      'APCA-API-SECRET-KEY': secretKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Alpaca API error ${res.status} on ${path}: ${body}`);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export interface AlpacaClient {
  getAccount(): Promise<AlpacaAccount>;
  getPositions(): Promise<AlpacaPosition[]>;
  getOrders(status?: 'open' | 'closed' | 'all', limit?: number): Promise<AlpacaOrder[]>;
  placeOrder(req: OrderRequest): Promise<AlpacaOrder>;
  cancelOrder(orderId: string): Promise<void>;
  cancelAllOrders(): Promise<void>;
  closePosition(symbol: string): Promise<AlpacaOrder>;
  getBars(symbol: string, timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day', limit: number): Promise<AlpacaBar[]>;
  getLatestQuote(symbol: string): Promise<AlpacaQuote>;
  getMultiQuotes(symbols: string[]): Promise<Record<string, AlpacaQuote>>;
  isMarketOpen(): Promise<boolean>;
  isCrypto(symbol: string): boolean;
}

export function createAlpacaClient(keyId: string, secretKey: string, paper = true): AlpacaClient {
  const tradeBase = paper
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';
  const dataBase = 'https://data.alpaca.markets';

  const trade = <T>(path: string, opts?: RequestInit) =>
    alpacaFetch<T>(tradeBase, path, keyId, secretKey, opts);
  const data = <T>(path: string, opts?: RequestInit) =>
    alpacaFetch<T>(dataBase, path, keyId, secretKey, opts);

  async function getAccount(): Promise<AlpacaAccount> {
    const raw = await trade<Record<string, unknown>>('/v2/account');
    return {
      id: raw.id as string,
      buying_power: parseFloat(raw.buying_power as string),
      portfolio_value: parseFloat(raw.portfolio_value as string),
      cash: parseFloat(raw.cash as string),
      equity: parseFloat(raw.equity as string),
      last_equity: parseFloat(raw.last_equity as string),
      daytrade_count: raw.daytrade_count as number,
      pattern_day_trader: raw.pattern_day_trader as boolean,
      trading_blocked: raw.trading_blocked as boolean,
      account_blocked: raw.account_blocked as boolean,
      status: raw.status as string,
    };
  }

  async function getPositions(): Promise<AlpacaPosition[]> {
    const raw = await trade<Record<string, unknown>[]>('/v2/positions');
    return raw.map((p) => ({
      asset_id: p.asset_id as string,
      symbol: p.symbol as string,
      qty: parseFloat(p.qty as string),
      qty_available: parseFloat(p.qty_available as string || p.qty as string),
      avg_entry_price: parseFloat(p.avg_entry_price as string),
      current_price: parseFloat(p.current_price as string),
      unrealized_pl: parseFloat(p.unrealized_pl as string),
      unrealized_plpc: parseFloat(p.unrealized_plpc as string) * 100,
      market_value: parseFloat(p.market_value as string),
      side: p.side as 'long' | 'short',
      asset_class: p.asset_class as string,
    }));
  }

  async function getOrders(status: 'open' | 'closed' | 'all' = 'all', limit = 50): Promise<AlpacaOrder[]> {
    const raw = await trade<Record<string, unknown>[]>(
      `/v2/orders?status=${status}&limit=${limit}&direction=desc`
    );
    return raw.map((o) => ({
      id: o.id as string,
      symbol: o.symbol as string,
      qty: parseFloat(o.qty as string),
      filled_qty: parseFloat(o.filled_qty as string || '0'),
      side: o.side as 'buy' | 'sell',
      type: o.order_type as 'market' | 'limit' | 'stop' | 'stop_limit',
      status: o.status as string,
      filled_avg_price: o.filled_avg_price ? parseFloat(o.filled_avg_price as string) : null,
      limit_price: o.limit_price ? parseFloat(o.limit_price as string) : null,
      stop_price: o.stop_price ? parseFloat(o.stop_price as string) : null,
      time_in_force: o.time_in_force as string,
      created_at: o.created_at as string,
      submitted_at: o.submitted_at as string,
      filled_at: o.filled_at as string | null,
    }));
  }

  async function placeOrder(req: OrderRequest): Promise<AlpacaOrder> {
    const body: Record<string, unknown> = {
      symbol: alpacaSymbol(req.symbol),
      qty: req.qty.toString(),
      side: req.side,
      type: req.type,
      time_in_force: req.time_in_force,
    };
    if (req.limit_price !== undefined) body.limit_price = req.limit_price.toFixed(2);
    if (req.stop_price !== undefined) body.stop_price = req.stop_price.toFixed(2);

    const raw = await trade<Record<string, unknown>>('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      id: raw.id as string,
      symbol: raw.symbol as string,
      qty: parseFloat(raw.qty as string),
      filled_qty: parseFloat(raw.filled_qty as string || '0'),
      side: raw.side as 'buy' | 'sell',
      type: raw.order_type as 'market' | 'limit' | 'stop' | 'stop_limit',
      status: raw.status as string,
      filled_avg_price: raw.filled_avg_price ? parseFloat(raw.filled_avg_price as string) : null,
      limit_price: raw.limit_price ? parseFloat(raw.limit_price as string) : null,
      stop_price: raw.stop_price ? parseFloat(raw.stop_price as string) : null,
      time_in_force: raw.time_in_force as string,
      created_at: raw.created_at as string,
      submitted_at: raw.submitted_at as string,
      filled_at: raw.filled_at as string | null,
    };
  }

  async function cancelOrder(orderId: string): Promise<void> {
    await trade<undefined>(`/v2/orders/${orderId}`, { method: 'DELETE' });
  }

  async function cancelAllOrders(): Promise<void> {
    await trade<undefined>('/v2/orders', { method: 'DELETE' });
  }

  async function closePosition(symbol: string): Promise<AlpacaOrder> {
    const encoded = encodeURIComponent(alpacaSymbol(symbol));
    const raw = await trade<Record<string, unknown>>(`/v2/positions/${encoded}`, { method: 'DELETE' });
    return {
      id: raw.id as string,
      symbol: raw.symbol as string,
      qty: parseFloat(raw.qty as string),
      filled_qty: 0,
      side: raw.side as 'buy' | 'sell',
      type: 'market',
      status: raw.status as string,
      filled_avg_price: null,
      limit_price: null,
      stop_price: null,
      time_in_force: 'day',
      created_at: raw.created_at as string,
      submitted_at: raw.submitted_at as string,
      filled_at: null,
    };
  }

  async function getBars(
    symbol: string,
    timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day',
    limit: number
  ): Promise<AlpacaBar[]> {
    if (isCryptoSymbol(symbol)) {
      const coinSymbol = symbol.replace('/', '');
      const raw = await data<{ bars: Record<string, unknown>[] }>(
        `/v1beta3/crypto/us/bars?symbols=${coinSymbol}&timeframe=${timeframe}&limit=${limit}`
      );
      const barsMap = raw.bars as unknown as Record<string, Record<string, unknown>[]>;
      const barList = barsMap[coinSymbol] || [];
      return barList.map((b) => ({
        t: b.t as string,
        o: b.o as number,
        h: b.h as number,
        l: b.l as number,
        c: b.c as number,
        v: b.v as number,
      }));
    } else {
      const raw = await data<{ bars: Record<string, unknown>[] }>(
        `/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${timeframe}&limit=${limit}&adjustment=raw`
      );
      return (raw.bars || []).map((b) => ({
        t: b.t as string,
        o: b.o as number,
        h: b.h as number,
        l: b.l as number,
        c: b.c as number,
        v: b.v as number,
      }));
    }
  }

  async function getLatestQuote(symbol: string): Promise<AlpacaQuote> {
    if (isCryptoSymbol(symbol)) {
      const coinSymbol = symbol.replace('/', '');
      const raw = await data<{ quotes: Record<string, Record<string, unknown>> }>(
        `/v1beta3/crypto/us/latest/quotes?symbols=${coinSymbol}`
      );
      const q = (raw.quotes[coinSymbol] || {}) as Record<string, unknown>;
      return {
        symbol,
        ap: q.ap as number || 0,
        bp: q.bp as number || 0,
        as: q.as as number || 0,
        bs: q.bs as number || 0,
        t: q.t as string,
      };
    } else {
      const raw = await data<{ quote: Record<string, unknown> }>(
        `/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`
      );
      const q = raw.quote || {};
      return {
        symbol,
        ap: q.ap as number || 0,
        bp: q.bp as number || 0,
        as: q.as as number || 0,
        bs: q.bs as number || 0,
        t: q.t as string,
      };
    }
  }

  async function getMultiQuotes(symbols: string[]): Promise<Record<string, AlpacaQuote>> {
    const stockSymbols = symbols.filter((s) => !isCryptoSymbol(s));
    const cryptoSymbols = symbols.filter((s) => isCryptoSymbol(s));
    const result: Record<string, AlpacaQuote> = {};

    if (stockSymbols.length > 0) {
      try {
        const raw = await data<{ quotes: Record<string, Record<string, unknown>> }>(
          `/v2/stocks/quotes/latest?symbols=${stockSymbols.join(',')}`
        );
        for (const sym of stockSymbols) {
          const q = raw.quotes?.[sym] || {};
          result[sym] = {
            symbol: sym,
            ap: q.ap as number || 0,
            bp: q.bp as number || 0,
            as: q.as as number || 0,
            bs: q.bs as number || 0,
            t: q.t as string,
          };
        }
      } catch {
        // partial failure — skip stocks silently
      }
    }

    for (const sym of cryptoSymbols) {
      try {
        result[sym] = await getLatestQuote(sym);
      } catch {
        // skip failed crypto quote
      }
    }

    return result;
  }

  async function isMarketOpen(): Promise<boolean> {
    try {
      const clock = await trade<AlpacaClock>('/v2/clock');
      return clock.is_open;
    } catch {
      return false;
    }
  }

  return {
    getAccount,
    getPositions,
    getOrders,
    placeOrder,
    cancelOrder,
    cancelAllOrders,
    closePosition,
    getBars,
    getLatestQuote,
    getMultiQuotes,
    isMarketOpen,
    isCrypto: isCryptoSymbol,
  };
}
