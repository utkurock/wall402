# wall402

**x402 paywall gateway on X Layer.**

Turn any API into an agent-payable endpoint. AI agents pay per call with zero-gas USDG settlement. Any token accepted via Uniswap auto-swap.

> Live at **[wall402.fun](https://wall402.fun)** · Built for the OKX Build X Hackathon 2026 — X Layer Arena.

---

## What it does

wall402 is the **Stripe for AI agents** — a reusable paywall layer that any developer can plug in front of an API in minutes. Consumers (AI agents or humans) discover the resource, pay via the x402 protocol over X Layer, and get instant access. Creators register endpoints, set prices, and collect USDG into their Agentic Wallet.

### Products

| Product | Price | Description |
|---|---|---|
| AI Trading Signal | 0.01 USDG | Live OHLC data + RSI/MA indicators + AI analysis (Gemini) |
| Token Security Scan | 0.02 USDG | Honeypot detection, tax rates, mint authority, risk scoring |
| Market Overview | 0.015 USDG | Multi-asset snapshot (OKB/BTC/ETH) with technical indicators |
| Wallet Intelligence | 0.025 USDG | Trust score, PnL, security scan, hold times, AI behavioral summary |
| Wallet Explorer | Free | On-chain balance lookup for any EVM address, ENS supported |

---

## Architecture

```
┌──────────────┐     ┌────────────────┐     ┌─────────────────┐
│  AI Agent    │     │  wall402 MCP   │     │  wall402        │
│  (Claude,    │────>│  Server        │────>│  Gateway        │
│   Cursor...) │ MCP │  (7 tools)     │ HTTP│  (Next.js)      │
└──────────────┘     └────────────────┘     └────────┬────────┘
                                                     │
         ┌───────────────────────┬───────────────────┤
         ▼                       ▼                   ▼
┌────────────────┐    ┌────────────────┐   ┌────────────────┐
│ x402 Payment   │    │ Uniswap V3/V4 │   │ OKX Security   │
│ (TEE signing)  │    │ (auto-swap)    │   │ (token scan)   │
└────────┬───────┘    └────────┬───────┘   └────────────────┘
         └────────────────────┘
                    ▼
          ┌──────────────────┐
          │   X Layer (196)  │
          │ zero-gas USDG    │
          └──────────────────┘
```

---

## Onchain OS / Uniswap skill usage

| Skill | How we use it |
|---|---|
| `okx-x402-payment` | Full x402 protocol: 402 challenge → EIP-3009 sign → verify → settle |
| `okx-agentic-wallet` | TEE-backed wallet as project's onchain identity (`0x254c...d55`) |
| `okx-security` | Token security scanning (honeypot, tax, mint authority detection) |
| `onchainos swap` (Uniswap V3/V4) | Auto-swap OKB/WETH/USDT → USDG via DEX aggregator on X Layer |
| `onchainos market` | Real-time OHLC, price feeds, portfolio PnL for trading signals |

### MCP Server — 7 tools

```
npm install -g @wall402/mcp-server
```

| Tool | Description |
|---|---|
| `list_endpoints` | Discover paywalled APIs |
| `call_paid_endpoint` | Full x402 payment handshake (with auto-swap fallback) |
| `get_wallet_status` | Wallet info + X Layer balances |
| `swap_tokens` | Swap any token pair via Uniswap on X Layer |
| `get_swap_quote` | Read-only swap price estimate |
| `check_token_security` | Honeypot & risk scan before payment |
| `analyze_wallet` | Comprehensive wallet intelligence report |

---

## Deployment

| Item | Value |
|---|---|
| Network | X Layer Mainnet (chain 196) |
| Agentic Wallet | `0x254c3699cc099b71df58a719984c4c8cb1034d55` |
| Settlement Token | USDG (`0x4ae46a509f6b1d9056937ba4500cb143933d2dc8`) |
| Website | [wall402.fun](https://wall402.fun) |
| Explorer | [View on OKX Explorer](https://www.okx.com/web3/explorer/xlayer/address/0x254c3699cc099b71df58a719984c4c8cb1034d55) |

---

## How it works

1. **Agent calls API** → Gateway returns HTTP 402 with x402 v2 challenge
2. **Agent signs** → EIP-3009 TransferWithAuthorization via TEE Agentic Wallet
3. **Gateway verifies** → Recovers signer, checks nonce, validates amount
4. **Settlement** → USDG transferred on X Layer (zero gas)
5. **Response** → Upstream data streamed back to the agent

### Freemium model

- **Wallet Explorer** (`/wallet`) — free balance lookup for any EVM address
- **Paid products** (`/explore/*`) — AI signals, security scans, wallet intelligence behind x402 paywall
- **Activity feed** (`/activity`) — transparent settlement history, filterable by wallet

---

## Getting started

```bash
git clone https://github.com/utkurock/wall402.git
cd wall402
pnpm install

# Copy env template and fill in your keys
cp .env.example apps/gateway/.env.local

# Start the gateway
pnpm dev:gateway   # http://localhost:3402

# Build MCP server
pnpm mcp:build
pnpm mcp           # stdio MCP server
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Optional | Enables AI trading analysis (Gemini) |
| `ONCHAINOS_CLI` | Yes | Path to onchainos binary |
| `WALL402_MOCK_SETTLEMENT` | Yes | `true` for dev, `false` for live |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Persistent audit log |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Supabase anon key |

---

## Tech stack

- **Gateway**: Next.js 15, TypeScript, viem
- **MCP Server**: @modelcontextprotocol/sdk, stdio transport
- **Blockchain**: X Layer (EVM), EIP-3009, EIP-712
- **AI**: Google Gemini (trading analysis)
- **DEX**: Uniswap V3/V4 via onchainos swap aggregator
- **Security**: OKX Security API (token scanning)
- **Data**: Supabase (PostgreSQL), TradingView widgets
- **Wallet**: Onchain OS Agentic Wallet (TEE)

---

## Team

- **Utku** — solo builder · [@Utkurocks](https://x.com/Utkurocks)

---

## Links

- Website: [wall402.fun](https://wall402.fun)
- GitHub: [github.com/utkurock/wall402](https://github.com/utkurock/wall402)
- Twitter: [x.com/Utkurocks](https://x.com/Utkurocks)
- Hackathon: [OKX Build X Hackathon 2026](https://web3.okx.com/tr/xlayer/build-x-hackathon)
