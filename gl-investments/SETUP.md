# G&L Investments — Setup Guide

## Quick Start (5 minutes)

### 1. Prerequisites
- Docker Desktop (Mac/Windows) or Docker Engine + Docker Compose (Linux)
- 16GB RAM recommended (Ollama + llama3.1:8b needs ~8GB)

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Start everything
```bash
cd gl-investments
docker compose up -d
```

### 4. Pull the AI model (first run only — ~4.7GB)
```bash
docker exec gl-ollama ollama pull llama3.1:8b
```

### 5. Open the app
- Dashboard: http://localhost:3000
- API: http://localhost:3001/api/health

---

## API Keys You Need

| Key | Where to get | Required? |
|-----|-------------|-----------|
| ALPACA_API_KEY | alpaca.markets → Paper Trading | Yes (for auto-trade) |
| ANTHROPIC_API_KEY | console.anthropic.com | Yes (Claude trade review) |
| FINNHUB_API_KEY | finnhub.io/register | Optional (real-time quotes) |
| TELEGRAM_BOT_TOKEN | @BotFather on Telegram | Optional (mobile alerts) |
| FRED_API_KEY | fred.stlouisfed.org | Optional (macro data) |

## Before Enabling Live Trading

1. Run a backtest first: Settings → Backtester → Run 5-Year Test
2. Sharpe ratio must be ≥ 1.0 to unlock live trading
3. Run paper trading for at least 30 days
4. Set conservative position limits in Auto-Trade settings

## Useful Commands

```bash
# View logs
docker compose logs -f backend

# Restart if something crashes
docker compose restart backend

# Update to latest code
git pull && docker compose up -d --build

# Backup database
cp data/investments.db data/investments.db.backup

# Stop everything
docker compose down
```

## Architecture

```
[Browser] → [nginx:3000] → [/api/*] → [Backend:3001]
                                            ↓
                                    [SQLite ./data/]
                                    [Ollama:11434]
                                    [Alpaca API]
                                    [Yahoo Finance]
                                    [SEC EDGAR]
                                    [CFTC]
[Watchdog] ────────────────→ monitors backend health
                              sends Telegram if down
```
