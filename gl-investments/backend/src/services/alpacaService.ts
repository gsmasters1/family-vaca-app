/**
 * Alpaca REST API wrapper
 *
 * Uses env vars:
 *   ALPACA_API_KEY     — Alpaca API key ID
 *   ALPACA_API_SECRET  — Alpaca API secret key
 *   ALPACA_PAPER       — 'true' (default) or 'false' for live trading
 */

const ALPACA_KEY = process.env.ALPACA_API_KEY ?? "";
const ALPACA_SECRET = process.env.ALPACA_API_SECRET ?? "";
const isPaper = process.env.ALPACA_PAPER !== "false";

const BASE_URL = isPaper
  ? "https://paper-api.alpaca.markets"
  : "https://api.alpaca.markets";

const HEADERS = {
  "APCA-API-KEY-ID": ALPACA_KEY,
  "APCA-API-SECRET-KEY": ALPACA_SECRET,
  "Content-Type": "application/json",
};

export interface AlpacaAccount {
  buying_power: string;
  portfolio_value: string;
  equity: string;
  cash: string;
  daytrade_count: number;
  status: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  side: string;
  type: string;
  status: string;
  filled_avg_price: string | null;
  submitted_at: string;
  limit_price: string | null;
  stop_price: string | null;
}

export interface BracketOrderParams {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}

async function alpacaFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: { ...HEADERS, ...(options.headers ?? {}) },
  });
}

export async function isConnected(): Promise<boolean> {
  try {
    const res = await alpacaFetch("/v2/account");
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function getAccount(): Promise<AlpacaAccount> {
  const res = await alpacaFetch("/v2/account");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca getAccount failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<AlpacaAccount>;
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  const res = await alpacaFetch("/v2/positions");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca getPositions failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<AlpacaPosition[]>;
}

export async function getPosition(symbol: string): Promise<AlpacaPosition | null> {
  const res = await alpacaFetch(`/v2/positions/${encodeURIComponent(symbol)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca getPosition(${symbol}) failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<AlpacaPosition>;
}

export async function getOpenOrders(): Promise<AlpacaOrder[]> {
  const res = await alpacaFetch("/v2/orders?status=open");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca getOpenOrders failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<AlpacaOrder[]>;
}

export async function placeBracketOrder(params: BracketOrderParams): Promise<AlpacaOrder> {
  const body = {
    symbol: params.symbol,
    qty: String(params.qty),
    side: params.side,
    type: "limit",
    time_in_force: "day",
    limit_price: params.limitPrice.toFixed(2),
    order_class: "bracket",
    stop_loss: { stop_price: params.stopLossPrice.toFixed(2) },
    take_profit: { limit_price: params.takeProfitPrice.toFixed(2) },
  };

  const res = await alpacaFetch("/v2/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca placeBracketOrder failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<AlpacaOrder>;
}

export async function placeMarketOrder(
  symbol: string,
  qty: number,
  side: "buy" | "sell"
): Promise<AlpacaOrder> {
  const body = {
    symbol,
    qty: String(qty),
    side,
    type: "market",
    time_in_force: "day",
  };

  const res = await alpacaFetch("/v2/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca placeMarketOrder failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<AlpacaOrder>;
}

export async function cancelOrder(orderId: string): Promise<void> {
  const res = await alpacaFetch(`/v2/orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Alpaca cancelOrder(${orderId}) failed (${res.status}): ${text}`);
  }
}

export async function cancelAllOrders(): Promise<void> {
  const res = await alpacaFetch("/v2/orders", { method: "DELETE" });
  if (!res.ok && res.status !== 207) {
    const text = await res.text();
    throw new Error(`Alpaca cancelAllOrders failed (${res.status}): ${text}`);
  }
}

export async function closePosition(symbol: string): Promise<void> {
  const res = await alpacaFetch(
    `/v2/positions/${encodeURIComponent(symbol)}`,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Alpaca closePosition(${symbol}) failed (${res.status}): ${text}`);
  }
}

export async function closeAllPositions(): Promise<void> {
  const res = await alpacaFetch("/v2/positions", { method: "DELETE" });
  if (!res.ok && res.status !== 207) {
    const text = await res.text();
    throw new Error(`Alpaca closeAllPositions failed (${res.status}): ${text}`);
  }
}

export async function isMarketOpen(): Promise<boolean> {
  const clock = await getMarketClock();
  return clock.is_open;
}

export async function getMarketClock(): Promise<{
  is_open: boolean;
  next_open: string;
  next_close: string;
}> {
  const res = await alpacaFetch("/v2/clock");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca getMarketClock failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    is_open: boolean;
    next_open: string;
    next_close: string;
  };
  return {
    is_open: data.is_open,
    next_open: data.next_open,
    next_close: data.next_close,
  };
}
