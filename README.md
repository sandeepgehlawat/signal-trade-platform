# Signal Trade Platform

Company-side infrastructure for Signal Trade - the website, feed server, and API.

## Components

| Component | Port | Description |
|-----------|------|-------------|
| Web Frontend | 3000 | Next.js dashboard, feeds, pricing pages |
| API Server | 3460 | Signal processing, trades, subscriptions |
| Feed Server | 3462 | SSE real-time feed with tier-based delay |

## Quick Start

```bash
# Install dependencies
bun install
cd web && npm install && cd ..

# Start all services
bun run start

# Or start individually:
bun run serve    # API server on :3460
bun run feed     # Feed server on :3462
npm run dev --prefix web  # Frontend on :3000
```

## Pricing Tiers

| Tier | Price | Delay | Connections |
|------|-------|-------|-------------|
| Free | $0 | 5 min | 1 |
| Pro | $5/week | Real-time | 5 |

## API Endpoints

### Core
- `POST /process` - Process URL/text into signal
- `GET /signals` - List recent signals
- `GET /trades` - List trades

### Subscriptions
- `POST /keys` - Generate API key
- `GET /keys/:user_id` - List user's keys
- `POST /subscribe` - Create subscription
- `GET /subscribe/:user_id` - Check subscription

### Feed (SSE)
- `GET /feed/subscribe` - Connect to real-time feed
  - Header: `Authorization: Bearer <api_key>`

## Environment Variables

```bash
# .env
PORT=3460
FEED_PORT=3462
PAPER_MODE=true
```

## Related

- [Signal Trade Skill](https://github.com/sandeepgehlawat/signal-trade) - Claude Code skill for users
