import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp, TrendingDown, Minus, DollarSign, Activity,
  AlertTriangle, ChevronDown, ChevronUp, RefreshCw,
  Plus, X, Zap, Settings, Clock, Shield,
} from 'lucide-react';
import { useTradingEngine } from '../hooks/useTradingEngine';
import type { OrderRequest } from '../services/alpaca';
import { cn } from '../lib/utils';

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number) {
  return '$' + fmt(Math.abs(n));
}

function SignalBadge({ signal, confidence }: { signal: 'BUY' | 'SELL' | 'HOLD' | null; confidence?: number }) {
  if (!signal) return <span className="text-slate-600 text-xs">—</span>;
  const colors = {
    BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
    HOLD: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };
  const icons = {
    BUY: <TrendingUp className="w-3 h-3" />,
    SELL: <TrendingDown className="w-3 h-3" />,
    HOLD: <Minus className="w-3 h-3" />,
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border', colors[signal])}>
      {icons[signal]} {signal}
      {confidence !== undefined && (
        <span className="opacity-70 ml-0.5">{(confidence * 100).toFixed(0)}%</span>
      )}
    </span>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">{label}</p>
      <p className={cn('text-2xl font-bold leading-none', color || 'text-white')}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function Collapsible({ title, icon, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="flex items-center gap-2 font-bold text-sm">
          <span className="text-slate-400">{icon}</span>
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TradingDashboard() {
  const engine = useTradingEngine();
  const { state } = engine;
  const [orderSymbol, setOrderSymbol] = useState('');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [orderQty, setOrderQty] = useState('');
  const [orderLimit, setOrderLimit] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [watchlistInput, setWatchlistInput] = useState('');

  const dailyPL = state.account
    ? state.account.equity - state.account.last_equity
    : 0;
  const dailyPLPct = state.account?.last_equity
    ? (dailyPL / state.account.last_equity) * 100
    : 0;

  async function submitOrder() {
    setOrderError('');
    const qty = parseInt(orderQty);
    if (!orderSymbol.trim() || isNaN(qty) || qty < 1) {
      setOrderError('Enter a valid symbol and quantity.');
      return;
    }
    if (orderType === 'limit' && (!orderLimit || isNaN(parseFloat(orderLimit)))) {
      setOrderError('Enter a valid limit price.');
      return;
    }

    const req: OrderRequest = {
      symbol: orderSymbol.trim().toUpperCase(),
      qty,
      side: orderSide,
      type: orderType,
      time_in_force: 'day',
      ...(orderType === 'limit' ? { limit_price: parseFloat(orderLimit) } : {}),
    };

    setOrderLoading(true);
    try {
      await engine.placeManualOrder(req);
      setOrderSymbol('');
      setOrderQty('');
      setOrderLimit('');
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setOrderLoading(false);
    }
  }

  if (state.loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
        <div className="w-10 h-10 rounded-full border-2 border-slate-800 border-t-emerald-500 animate-spin" />
        <p className="text-sm">Connecting to Alpaca...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4 pb-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <h2 className="text-xl font-bold">Trading</h2>
            <span className={cn(
              'text-[10px] font-black uppercase px-2 py-0.5 rounded-full border',
              state.paperMode
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
            )}>
              {state.paperMode ? 'Paper' : 'Live'}
            </span>
            <span className={cn(
              'flex items-center gap-1 text-[10px] font-bold uppercase',
              state.isMarketOpen ? 'text-emerald-400' : 'text-slate-500'
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', state.isMarketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')} />
              {state.isMarketOpen ? 'Open' : 'Closed'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {state.lastRefresh && (
              <span className="text-[10px] text-slate-600">
                {state.lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={engine.refreshData}
              className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {state.error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}

        {/* Paper / Live mode toggle */}
        <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div>
            <p className="text-xs font-bold">Trading Mode</p>
            <p className="text-[10px] text-slate-500">{state.paperMode ? 'Simulated orders — no real money' : 'REAL MONEY — use with caution'}</p>
          </div>
          <button
            onClick={engine.togglePaperMode}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors',
              state.paperMode
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
                : 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30'
            )}
          >
            {state.paperMode ? 'Switch to Live' : 'Switch to Paper'}
          </button>
        </div>

        {/* Account stats */}
        {state.account && (
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Portfolio Value"
              value={fmtCurrency(state.account.portfolio_value)}
            />
            <Stat
              label="Daily P&L"
              value={(dailyPL >= 0 ? '+' : '') + fmtCurrency(dailyPL)}
              sub={`${dailyPLPct >= 0 ? '+' : ''}${fmt(dailyPLPct)}%`}
              color={dailyPL >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <Stat label="Cash" value={fmtCurrency(state.account.cash)} />
            <Stat label="Buying Power" value={fmtCurrency(state.account.buying_power)} />
          </div>
        )}

        {/* Auto-Trading Toggle */}
        <div className={cn(
          'rounded-2xl border p-4 transition-colors',
          state.autoTrading
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-slate-900 border-slate-800'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className={cn('w-5 h-5', state.autoTrading ? 'text-emerald-400' : 'text-slate-500')} />
              <div>
                <p className="font-bold text-sm">Auto-Trading</p>
                <p className="text-[10px] text-slate-500">EMA crossover + RSI + AI signals</p>
              </div>
            </div>
            <button
              onClick={engine.toggleAutoTrading}
              className={cn(
                'relative w-12 h-6 rounded-full transition-colors',
                state.autoTrading ? 'bg-emerald-500' : 'bg-slate-700'
              )}
            >
              <span className={cn(
                'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all',
                state.autoTrading ? 'left-7' : 'left-1'
              )} />
            </button>
          </div>

          {state.autoTrading && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 pt-3 border-t border-emerald-500/20 space-y-1"
            >
              <p className="text-xs text-emerald-300 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Automated orders will be placed when signals fire
              </p>
              <p className="text-[10px] text-slate-500">
                Max {state.riskSettings.maxPositionPct}% per position · Stop {state.riskSettings.stopLossPct}% · Target {state.riskSettings.takeProfitPct}% · Runs every 5 min
              </p>
            </motion.div>
          )}
        </div>

        {/* Auto-trade log */}
        {state.autoTradeLog.length > 0 && (
          <Collapsible title="Auto-Trade Log" icon={<Clock className="w-4 h-4" />}>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {state.autoTradeLog.map((entry, i) => (
                <p key={i} className="text-[10px] text-slate-400 font-mono">{entry}</p>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Watchlist */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 pb-3 flex items-center justify-between">
            <h3 className="font-bold text-sm">Watchlist</h3>
            <div className="flex gap-1">
              <input
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    engine.addToWatchlist(watchlistInput);
                    setWatchlistInput('');
                  }
                }}
                placeholder="Add symbol..."
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
              <button
                onClick={() => { engine.addToWatchlist(watchlistInput); setWatchlistInput(''); }}
                className="w-7 h-7 bg-emerald-500 text-white rounded-lg flex items-center justify-center"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-t border-slate-800 text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Symbol</th>
                  <th className="px-4 py-2 text-right">Ask</th>
                  <th className="px-4 py-2 text-right">Bid</th>
                  <th className="px-4 py-2 text-center">Signal</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {state.watchlist.map((sym) => {
                  const entry = state.watchlistData[sym];
                  const quote = entry?.quote;
                  return (
                    <tr key={sym} className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-bold">{sym}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-300">
                        {quote?.ap ? fmtCurrency(quote.ap) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-300">
                        {quote?.bp ? fmtCurrency(quote.bp) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => engine.refreshSignal(sym)}
                          className="hover:opacity-70 transition-opacity"
                        >
                          <SignalBadge
                            signal={entry?.signal?.signal || null}
                            confidence={entry?.signal?.confidence}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => engine.removeFromWatchlist(sym)}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Open Positions */}
        <div>
          <h3 className="font-bold text-sm mb-2 text-slate-400 uppercase tracking-widest">
            Open Positions ({state.positions.length})
          </h3>
          {state.positions.length === 0 ? (
            <div className="p-6 text-center text-slate-600 text-sm bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
              No open positions
            </div>
          ) : (
            <div className="space-y-2">
              {state.positions.map((pos) => (
                <div key={pos.symbol} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{pos.symbol}</span>
                      <span className="text-[10px] text-slate-500">{pos.qty} shares</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-slate-500">
                      <span>Avg {fmtCurrency(pos.avg_entry_price)}</span>
                      <span>Now {fmtCurrency(pos.current_price)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className={cn('font-bold text-sm', pos.unrealized_pl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {pos.unrealized_pl >= 0 ? '+' : ''}{fmtCurrency(pos.unrealized_pl)}
                      </p>
                      <p className={cn('text-[10px]', pos.unrealized_plpc >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {pos.unrealized_plpc >= 0 ? '+' : ''}{fmt(pos.unrealized_plpc)}%
                      </p>
                    </div>
                    <button
                      onClick={() => engine.closePosition(pos.symbol)}
                      className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-bold hover:bg-red-500/20 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual Order Entry */}
        <Collapsible title="Place Order" icon={<Activity className="w-4 h-4" />} defaultOpen>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={orderSymbol}
                onChange={(e) => setOrderSymbol(e.target.value.toUpperCase())}
                placeholder="Symbol (e.g. AAPL)"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono"
              />
              <div className="flex rounded-xl overflow-hidden border border-slate-700">
                <button
                  onClick={() => setOrderSide('buy')}
                  className={cn('px-4 py-2.5 text-sm font-bold transition-colors', orderSide === 'buy' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400')}
                >
                  Buy
                </button>
                <button
                  onClick={() => setOrderSide('sell')}
                  className={cn('px-4 py-2.5 text-sm font-bold transition-colors', orderSide === 'sell' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400')}
                >
                  Sell
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                placeholder="Qty"
                type="number"
                min="1"
                className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <div className="flex rounded-xl overflow-hidden border border-slate-700">
                <button
                  onClick={() => setOrderType('market')}
                  className={cn('px-3 py-2.5 text-xs font-bold transition-colors', orderType === 'market' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400')}
                >
                  Market
                </button>
                <button
                  onClick={() => setOrderType('limit')}
                  className={cn('px-3 py-2.5 text-xs font-bold transition-colors', orderType === 'limit' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400')}
                >
                  Limit
                </button>
              </div>
              {orderType === 'limit' && (
                <input
                  value={orderLimit}
                  onChange={(e) => setOrderLimit(e.target.value)}
                  placeholder="$0.00"
                  type="number"
                  step="0.01"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              )}
            </div>

            {orderError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {orderError}
              </p>
            )}

            <button
              onClick={submitOrder}
              disabled={orderLoading}
              className={cn(
                'w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95',
                orderSide === 'buy'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20',
                orderLoading && 'opacity-60 cursor-not-allowed'
              )}
            >
              {orderLoading ? 'Placing...' : `Place ${orderType.charAt(0).toUpperCase() + orderType.slice(1)} ${orderSide.charAt(0).toUpperCase() + orderSide.slice(1)}`}
            </button>
          </div>
        </Collapsible>

        {/* Recent Orders */}
        <Collapsible title={`Recent Orders (${state.orders.length})`} icon={<Clock className="w-4 h-4" />}>
          {state.orders.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-2">No orders yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {state.orders.slice(0, 20).map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-2 text-xs border-b border-slate-800 pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('font-bold', order.side === 'buy' ? 'text-emerald-400' : 'text-red-400')}>
                        {order.side.toUpperCase()}
                      </span>
                      <span className="font-mono font-bold">{order.symbol}</span>
                      <span className="text-slate-500">{order.qty}x</span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(order.submitted_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn(
                      'font-bold capitalize',
                      order.status === 'filled' ? 'text-emerald-400' :
                      order.status === 'canceled' ? 'text-slate-500' :
                      'text-yellow-400'
                    )}>
                      {order.status}
                    </p>
                    {order.filled_avg_price && (
                      <p className="text-[10px] text-slate-500">{fmtCurrency(order.filled_avg_price)}</p>
                    )}
                  </div>
                  {order.status === 'new' || order.status === 'accepted' || order.status === 'pending_new' ? (
                    <button
                      onClick={() => engine.cancelOrder(order.id)}
                      className="shrink-0 text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : <div className="w-3.5" />}
                </div>
              ))}
            </div>
          )}
        </Collapsible>

        {/* Risk Settings */}
        <Collapsible title="Risk Controls" icon={<Shield className="w-4 h-4" />}>
          <div className="space-y-4">
            {(
              [
                { key: 'maxPositionPct', label: 'Max Position Size', unit: '%', min: 1, max: 50 },
                { key: 'stopLossPct', label: 'Stop Loss', unit: '%', min: 0.5, max: 20 },
                { key: 'takeProfitPct', label: 'Take Profit', unit: '%', min: 1, max: 100 },
                { key: 'maxDailyLossPct', label: 'Max Daily Loss', unit: '%', min: 1, max: 25 },
              ] as const
            ).map(({ key, label, unit, min, max }) => (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-bold text-white">{state.riskSettings[key]}{unit}</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.5}
                  value={state.riskSettings[key]}
                  onChange={(e) => engine.updateRiskSettings({ [key]: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>
            ))}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Max Open Positions</span>
                <span className="font-bold text-white">{state.riskSettings.maxOpenPositions}</span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={state.riskSettings.maxOpenPositions}
                onChange={(e) => engine.updateRiskSettings({ maxOpenPositions: parseInt(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>
          </div>
        </Collapsible>

        {/* Settings */}
        <Collapsible title="Settings" icon={<Settings className="w-4 h-4" />}>
          <div className="space-y-3 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span>Alpaca Key ID</span>
              <span className="font-mono text-slate-500">{process.env.ALPACA_KEY_ID ? '••••' + process.env.ALPACA_KEY_ID.slice(-4) : 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Secret Key</span>
              <span className="font-mono text-slate-500">{process.env.ALPACA_SECRET_KEY ? '••••••••' : 'Not set'}</span>
            </div>
            <p className="text-[10px] text-slate-600 pt-1">
              Set ALPACA_KEY_ID and ALPACA_SECRET_KEY in your .env.local file. Get free API keys at alpaca.markets.
            </p>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
