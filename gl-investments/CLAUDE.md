# G&L Investments — AI Platform Architecture

Self-hosted investing intelligence platform running on a home mini PC (16GB RAM).
The goal: institutional-grade signals without paying institutional prices. Cut through noise.
Make decisions. Automate execution. Learn from every trade.

## Project Location

```
/home/user/family-vaca-app/gl-investments/
├── backend/          Express + TypeScript API (port 3001)
├── frontend/         React + Vite + TailwindCSS (port 3000)
├── watchdog/         Health monitor (Telegram alert on crash)
├── docker-compose.yml
├── .env.example
└── SETUP.md
```

**Git branch**: `claude/create-new-folder-7fPp1`
**Repo**: `gsmasters1/family-vaca-app`

## Stack

- **Backend**: Node.js + Express + TypeScript + better-sqlite3 (WAL mode)
- **Frontend**: React 18 + Vite + TailwindCSS (dark theme, brand-400/500/600 accent)
- **AI (local)**: Ollama + llama3.1:8b for rationale generation (no API cost)
- **AI (cloud)**: Anthropic Claude API for trade review gate before execution
- **Trading**: Alpaca Markets API (paper + live)
- **Data**: Yahoo Finance (yahooFinance2), SEC EDGAR, CFTC, Finnhub (optional)
- **Alerts**: Telegram Bot API (direct axios calls, no package)

## The APEX Engine — Core Intelligence

APEX scores any symbol 0–100 across 5 components. This is the brain.

```
Component        Weight   Source                     Framework
─────────────────────────────────────────────────────────────────
Momentum          25pts   Price vs SMA50/200, RSI    Minervini / O'Neil
Technical         20pts   MACD, Bollinger, Volume    Livermore / Turtle
Congressional     20pts   Congress trades + insider  STOCK Act edge
                          + hedge fund 13F consensus
Macro             20pts   Regime + Fear/Greed        Druckenmiller / Dalio
                          + energy trend + bond score
Value             15pts   Graham safety anchor       Graham
─────────────────────────────────────────────────────────────────
TOTAL            100pts
```

Score → Rating: PRIME (80+) | STRONG (60+) | DEVELOPING (40+) | WEAK | AVOID
Score → Action: BUY ACT NOW (80+) | BUY THIS WEEK (68+) | WATCH (40+) | AVOID

## 3-Layer Sector Hierarchy

```
LAYER 1 — 11 Sector Agents (run in parallel)
  Each covers one GICS sector with sector-specific scoring:
  Energy (XLE)     Materials (XLB)    Industrials (XLI)
  Consumer Disc (XLY)  Consumer Staples (XLP)  Healthcare (XLV)
  Financials (XLF)  Info Tech (XLK)   Comm Services (XLC)
  Utilities (XLU)  Real Estate (XLRE)
  
  Each agent: scores its tickers with sector-adjusted APEX, returns top 10

LAYER 2 — Manager (aggregation)
  Takes up to 10 per sector → deduplicates → top 33 total (3-per-sector cap)
  Adds SectorRotation data for the dashboard

LAYER 3 — APEX Commander (final decisions)
  Takes 33 candidates → filters existing positions → BUY/WATCH/AVOID
  Respects position limits, portfolio risk settings
```

Enable hierarchy: `hierarchy_enabled = true` in app_settings (default: false, uses single APEX scan).
Hierarchy runs: pre-market 8am ET + post-market 4:30pm ET.

## Sector-Specific Scoring Rules

Valuation benchmarks differ by sector — never compare PE across sectors:
- **Energy**: cheap at PE 10-15, use EV/EBITDA; macro driver = WTI oil price
- **Financials**: cheap at PE 10-14, P/Book primary; macro = yield curve
- **Tech/AI**: cheap at PE 25-35, PEG ratio; macro = cloud capex, AI spend
- **Healthcare**: cheap at PE 18-24, pipeline value; macro = FDA calendar
- **Utilities**: cheap at PE 15-18, P/FFO primary; macro = interest rates
- **Real Estate**: always use P/FFO not PE; macro = 10yr Treasury
- Cyclical sectors (Energy, Materials, Industrials, Consumer Disc, Financials): penalized -8pts in BEAR regime
- Defensive sectors (Utilities, Staples, Healthcare): boosted +5pts in BEAR, +4pts in CAUTION

## Data Sources (all free or low-cost)

| Source | What it provides | Cost |
|--------|-----------------|------|
| Yahoo Finance | Prices, fundamentals, options chains, short data | Free |
| CFTC EDGAR | Commitment of Traders (commercial vs managed money) | Free (gov) |
| SEC EDGAR | Form 4 insider trades, 13F hedge fund holdings | Free (gov) |
| Finnhub | Real-time quotes (bypasses Yahoo 15-20min delay) | Free tier |
| Alpaca | Trade execution (paper + live) | Free paper |
| FRED | Yield curve, macro data | Free (API key) |
| Telegram | Trade/alert notifications | Free |

## Key Services (backend/src/services/)

| File | Purpose |
|------|---------|
| `apexStrategy.ts` | Core scoring engine — all 5 components |
| `apexDecisionEngine.ts` | Makes BUY/SELL/HOLD decisions, caches to DB |
| `sectorService.ts` | GICS classification for 200+ tickers |
| `sectorScoringEngine.ts` | Sector-aware APEX scoring (relative valuation + regime) |
| `sectorAgentOrchestrator.ts` | 3-layer hierarchy runner |
| `marketData.ts` | Quotes (Finnhub → Yahoo fallback) |
| `technicalAnalysis.ts` | SMA, RSI, MACD, Bollinger, ATR |
| `marketRegimeService.ts` | SPY SMA50/200 → BULL/CAUTION/BEAR/CRISIS |
| `commoditiesService.ts` | Energy, metals, global markets + WTI trend for APEX |
| `fixedIncomeService.ts` | TLT/IEF/SHY/HYG/LQD/TIP/BND + bond macro score (-10 to +10) |
| `cotService.ts` | CFTC COT — commercial hedger vs managed money |
| `insiderTradesService.ts` | SEC Form 4 parsing — C-suite buys/sells |
| `hedgeFundService.ts` | 13F tracker — Berkshire, Bridgewater, Renaissance, Citadel, etc. |
| `shortInterestService.ts` | Short float, days-to-cover, squeeze score 0-100 |
| `optionsFlowService.ts` | Unusual call/put volume vs OI, implied volatility |
| `earningsService.ts` | Upcoming earnings within 5/30 days |
| `backtesterService.ts` | Anti-look-ahead APEX backtest, Sharpe ratio gate |
| `tradeExecutor.ts` | 12-step guardrail execution (kill switch → Claude review → Alpaca) |
| `stopLossMonitor.ts` | Active stop-loss checker (every 5 min market hours) |
| `profitManagementService.ts` | Take-profit tiers, trailing stop, reserve allocation |
| `learningService.ts` | Trade outcome recording, signal weight auto-adjustment |
| `telegramService.ts` | Alerts: executions, ACT NOW decisions, stop triggers, daily summary |
| `scheduler.ts` | All cron jobs (APEX scan, stop-loss, take-profit, hierarchy, bond, COT) |
| `alpacaService.ts` | Alpaca REST API (account, positions, bracket orders) |
| `claudeReviewService.ts` | Claude API review gate before every trade execution |
| `appConfig.ts` | `getSetting(key)` reads from app_settings table |
| `migrations.ts` | Versioned schema migrations — **never modify existing entries** |

## Database Schema (SQLite — versioned migrations)

Current schema version: **13**

Key tables:
- `portfolio_positions` — holdings with shares + avg_cost
- `watchlist` — symbols to monitor
- `apex_decisions` — cached APEX decisions (24h TTL)
- `trade_log` — every execution, block, skip, error logged
- `daily_equity` — daily portfolio value snapshot
- `congress_trades` + `signal_scores` — STOCK Act trade data
- `insider_trades` + `sec_cik_cache` — Form 4 data
- `hedge_fund_holdings` — 13F parsed positions
- `intelligence_feed` — web scraper news with trust scores
- `short_interest` + `options_flow_cache` — scanner caches
- `fixed_income_cache` — bond ETF snapshot (30min TTL)
- `backtest_runs` — historical backtest results
- `trade_outcomes` — closed trade results for learning
- `signal_weights` — auto-adjusted APEX component weights
- `profit_reserve` — realized gains → reserve allocation log
- `app_settings` — all runtime config (use `getSetting()`)
- `sector_overrides` — manual sector classification for tickers
- `cot_cache` + `price_cache` + `prediction_cache` — various caches

**Migration rule**: To add schema, append a new version to the `migrations` array.
NEVER modify existing migration entries. The runner uses MAX(version) to find pending ones.

## App Settings (key ones)

| Key | Default | Purpose |
|-----|---------|---------|
| `trading_enabled` | false | Master trading switch |
| `trading_paper_mode` | true | Paper vs live money |
| `trading_kill_switch` | false | Emergency stop |
| `trading_require_claude_review` | true | Claude API approves each trade |
| `trading_min_apex_score` | 75 | Minimum score to auto-execute |
| `trading_min_conviction` | 8 | Minimum conviction (1-10) |
| `trading_max_position_pct` | 5 | Max % portfolio per position |
| `trading_daily_loss_limit_pct` | 3 | Daily loss halt % |
| `hierarchy_enabled` | false | Use 3-layer sector scan |
| `profit_take_tiers` | JSON array | Take-profit rules |
| `profit_reserve_pct` | 30 | % of gains to reserve |
| `telegram_alerts_enabled` | false | Send Telegram alerts |
| `ollama_model` | llama3.1:8b | Local AI model |
| `finnhub_api_key` | none | Real-time quotes |
| `fred_api_key` | none | Macro data |
| `risk_profile` | moderate | conservative/moderate/aggressive |

## Scheduler Cron Jobs (America/New_York)

| Time | Job |
|------|-----|
| 9:30am weekdays | Daily reset — record starting equity |
| 9:35am + 9:05pm, :05 and :35 past each hour | APEX full scan + auto-execute |
| Every 5 min, 9am-4pm weekdays | Stop-loss monitor + take-profit checker |
| 8am + 4:30pm weekdays | Sector hierarchy scan (if enabled) |
| Every 30 min, 9am-4pm weekdays | Bond snapshot refresh |
| Every 2 hours weekdays | Intelligence feed refresh |
| 4pm weekdays | Daily Telegram summary |
| Friday 4:30pm | COT report refresh |

## Trade Execution Guardrails (12 steps)

1. Kill switch check (highest priority)
2. Master enable check (`trading_enabled`)
3. Action must be BUY or SELL
4. APEX score ≥ `trading_min_apex_score`
5. Conviction ≥ `trading_min_conviction`
6. Market must be open (Alpaca check)
7. Account buying power > 0
8. Daily loss limit not exceeded
9. Position count < `trading_max_positions`
10. No existing position in same symbol
11. Calculate qty (% of portfolio / price, floor to whole shares)
12. Claude API review (if `trading_require_claude_review = true`)
→ Place bracket order (entry + stop-loss + take-profit)

## Profit Management

Take-profit tiers (default): sell 25% at +20%, 25% at +40%, exit at +60%
Reserve: X% of all realized gains moved to profit_reserve (never used for new trades)
Trailing stop: stop follows price up, never down, triggers sell if falls X% from peak
Double down: allowed only if price falls threshold% AND conviction ≥ 9 AND ACT NOW

## APEX Learning

After each trade closes, outcome recorded: entry signals + exit result.
Every week, recompute signal weights from 90-day window:
- High-score signal + winning trade = increase that component's weight
- Low-prediction signal = decrease weight
- Weights normalized to sum to 100
Requires 20+ closed trades before weights diverge from defaults.

## Frontend Routes

| Path | Page | Purpose |
|------|------|---------|
| `/` | CommandCenter | APEX Commander — ACT NOW decisions |
| `/dashboard` | Dashboard | Portfolio overview |
| `/apex` | ApexDashboard | Full APEX scoring for watchlist |
| `/elite` | EliteData | COT + insider trades |
| `/sectors` | SectorRotation | 11 GICS sectors ranked |
| `/bonds` | BondMonitor | Fixed income signals |
| `/hedge-funds` | HedgeFundTracker | 13F smart money |
| `/signals` | SignalDashboard | Congress trade signals |
| `/intelligence` | Intelligence | Web scraper news feed |
| `/risk` | RiskManager | Portfolio risk |
| `/congress` | CongressTrades | STOCK Act data |
| `/predictions` | Predictions | AI price predictions |
| `/ipo` | IPOTracker | S-1 filings + scoring |
| `/commodities` | Commodities | Energy + global markets |
| `/markets` | Markets | Quote lookup |
| `/portfolio` | Portfolio | Holdings management |
| `/watchlist` | Watchlist | Symbol list |
| `/ai-advisor` | AIAdvisor | Chat with Ollama |
| `/settings` | Settings | App configuration |
| `/trading` | TradingControl | Auto-trade controls |
| `/backtester` | Backtester | Strategy validation |
| `/squeeze` | ShortSqueeze | Short interest scanner |
| `/profit` | ProfitManager | Take-profit rules + reserve |
| `/learning` | LearningDashboard | Signal accuracy + weight drift |

## API Endpoints (all prefixed /api)

```
/market/*        Quotes, history, movers
/portfolio/*     Positions CRUD
/watchlist/*     Watchlist CRUD
/ai/*            Ollama chat + analysis
/apex/*          APEX scoring + decisions
/congress/*      STOCK Act trades
/signals/*       Signal scores
/commodities/*   Hard assets + energy + global
/intelligence/*  Web scraper feed + fear/greed + macro
/risk/*          Portfolio risk scoring
/predictions/*   AI price predictions
/ipo/*           S-1 filings
/settings/*      Runtime configuration
/trading/*       Execution controls + trade log
/cot/*           CFTC COT data
/insider/*       SEC Form 4 insider trades
/backtest/*      Strategy backtesting
/earnings/*      Earnings calendar
/equity/*        Portfolio performance vs SPY
/shortsqueeze/*  Short interest scanner
/optionsflow/*   Options chain analysis
/alerts/*        Telegram test
/sectors/*       Sector rotation + hierarchy + hedge funds + learning + profit rules
/bonds/*         Fixed income snapshot + macro score
```

## Phase 2 (not yet built)

- **True Claude API sector agents**: Each sector gets a real Claude API call reading news + data, writing its own investment thesis. Current sector agents use deterministic scoring.
- **Economic calendar**: FOMC dates, CPI releases, jobs reports — auto-flag pre-event risk
- **Earnings pre-trade filter**: Block new entries within 5 days of earnings (reduces binary risk)
- **Emerging markets expansion**: Deeper EM data (India, Vietnam, Indonesia indices)
- **Options strategy engine**: Not just flow detection — generate actual options plays (covered calls, protective puts, spreads)
- **Portfolio rebalancing**: Drift detection, auto-suggest rebalances toward target allocation

## Deployment (Docker)

```bash
cp .env.example .env
# Fill in API keys (Alpaca required for live trading; Telegram + Finnhub optional)
docker compose up -d
# App: http://localhost:3000
# API: http://localhost:3001
# Ollama: http://localhost:11434
```

See SETUP.md for full API key table and live trading safety checklist.
