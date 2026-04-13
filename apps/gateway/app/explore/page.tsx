"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductResult } from "../components/product-results";

// ─── Types ──────────────────────────────────────────────

type Endpoint = {
  id: string;
  label: string;
  priceAmount: string;
  priceToken: string;
  network: string;
  creatorWallet: string;
  upstreamUrl: string;
};

type AcceptEntry = {
  scheme: string;
  network: string;
  amount: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string };
};

type Challenge = {
  x402Version: number;
  resource: { url: string; description: string; mimeType: string };
  accepts: AcceptEntry[];
  alternativeTokens?: { symbol: string; address: string }[];
};

// ─── Helpers ────────────────────────────────────────────

const short = (s: string, n = 6) =>
  s.length <= 2 * n + 2 ? s : `${s.slice(0, n + 2)}...${s.slice(-n)}`;

const fmtPrice = (amount: string, token: string) => {
  if (["USDG", "USDT", "USDC"].includes(token)) {
    const v = Number(amount) / 1e6;
    return `${v.toFixed(v >= 1 ? 2 : 4)} ${token}`;
  }
  return `${amount} ${token}`;
};

/** Generate a 32-byte hex nonce. Client-side safe (no node:crypto in browser). */
function browserNonce(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return (
    "0x" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

// ─── Product info ────────────────────────────────────────

type ProductInfo = {
  kind: string;
  description: string;
  includes: string[];
  sampleData: Record<string, unknown>;
  sampleOutput: string;
  sampleNote: string;
  input?: {
    placeholder: string;
    type: "select" | "text";
    options?: string[];
  };
};

const PRODUCT_INFO: Record<string, ProductInfo> = {
  "AI Trading Signal": {
    kind: "signal",
    description: "Real-time trading analysis powered by live market data from X Layer DEX and AI. Get entry/exit prices, RSI, MA indicators, and AI-generated market commentary.",
    includes: ["Long/Short signal", "Entry & target price", "Stop loss", "RSI(14)", "MACD", "MA(20)", "Volume trend", "AI analysis"],
    input: { placeholder: "Select asset", type: "select", options: ["OKB", "BTC", "ETH"] },
    sampleData: { asset: "OKB", signal: "LONG", price: 84.34, entry: 84.10, target: 88.30, stop: 82.50, indicators: { rsi14: 52.3, ma20: 83.80, volumeTrend: "increasing" }, aiAnalysis: "RSI neutral with price holding above MA20. Volume expanding on the bounce suggests buyers stepping in..." },
    sampleOutput: `{
  "asset": "OKB",
  "signal": "LONG",
  "price": 84.34,
  "entry": 84.10,
  "target": 88.30,
  "stop": 82.50,
  "indicators": {
    "rsi14": 52.3,
    "ma20": 83.80,
    "volumeTrend": "increasing"
  },
  "aiAnalysis": "RSI neutral with price holding above MA20..."
}`,
    sampleNote: "Live data from X Layer DEX via onchainos",
  },
  "Token Security Scan": {
    kind: "security",
    description: "Comprehensive token risk analysis. Scans for honeypots, high tax rates, mint authority risks, fake liquidity, and other red flags before you interact with any token.",
    includes: ["Honeypot detection", "Tax rate check", "Mint authority", "Liquidity analysis", "Risk scoring", "Multi-token batch"],
    input: { placeholder: "Token address (0x...)", type: "text" },
    sampleData: { tokensScanned: 3, scan: [{ tokenAddress: "0x4ae46a509f6b1d905", isHoneypot: false, isRiskToken: false, buyTaxes: "0", sellTaxes: "0" }, { tokenAddress: "0x779ded0c9e102222", isHoneypot: false, isRiskToken: false, buyTaxes: "0", sellTaxes: "0" }, { tokenAddress: "0xe538905cf8410324", isHoneypot: false, isRiskToken: false, buyTaxes: "0", sellTaxes: "0" }] },
    sampleOutput: `{
  "tokensScanned": 3,
  "results": [
    {
      "token": "0x4ae46a...2dc8",
      "symbol": "USDG",
      "isHoneypot": false,
      "isRiskToken": false,
      "buyTaxes": "0%",
      "sellTaxes": "0%"
    }
  ],
  "verdict": "all clean"
}`,
    sampleNote: "Powered by OKX Security API",
  },
  "Market Overview": {
    kind: "market",
    description: "Multi-asset market snapshot for OKB, BTC, and ETH on X Layer. Includes price, RSI, moving averages, volume trends, and 24h change — all from real DEX data.",
    includes: ["OKB price & RSI", "BTC price & RSI", "ETH price & RSI", "Volume trends", "24h change %", "Bias indicator"],
    sampleData: { assets: { OKB: { price: 84.72, rsi14: 58.2, change24h: "+1.4", bias: "neutral" }, BTC: { price: 85067, rsi14: 44.5, change24h: "-0.8", bias: "neutral" }, ETH: { price: 2213, rsi14: 38.1, change24h: "-2.1", bias: "oversold" } } },
    sampleOutput: `{
  "assets": {
    "OKB": {
      "price": 84.72,
      "rsi14": 58.2,
      "ma20": 83.50,
      "change24h": "+1.4%",
      "bias": "neutral"
    },
    "BTC": { "price": 85067, ... },
    "ETH": { "price": 2213, ... }
  }
}`,
    sampleNote: "Real-time OHLC from X Layer DEX",
  },
  "Wallet Intelligence": {
    kind: "wallet",
    description: "Deep wallet analysis with trust scoring. Combines on-chain trading history, portfolio PnL, token security scan, and AI behavioral analysis into one comprehensive report.",
    includes: ["Trust score (0-100)", "PnL breakdown", "Win rate", "Token security", "Hold time analysis", "AI summary"],
    input: { placeholder: "Wallet address (0x...)", type: "text" },
    sampleData: { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", trustScore: 75, verdict: "trusted", stats: { winRate: "68%", totalTransactions: 142, realizedPnlUsd: 12450 }, tokenSecurity: { totalScanned: 8, clean: 7, riskyTokens: 1 }, aiSummary: "Consistent DCA behavior with strong risk management..." },
    sampleOutput: `{
  "address": "0xd8dA...6045",
  "trustScore": 75,
  "verdict": "trusted",
  "stats": {
    "winRate": "68%",
    "realizedPnl": "$12,450",
    "totalTrades": 142
  },
  "aiSummary": "Consistent DCA behavior with..."
}`,
    sampleNote: "Portfolio API + Security scan + AI",
  },
  "Smart Money Alerts": {
    kind: "alpha",
    description: "Track whale wallets and smart money flows in real-time. See what the biggest players are buying and selling, trending tokens by volume, and AI-powered market sentiment.",
    includes: ["Whale trades", "Smart money signals", "Trending tokens", "Buy/sell pressure", "Volume analysis", "AI sentiment"],
    input: { placeholder: "Select chain", type: "select", options: ["ethereum", "base", "arbitrum", "bsc", "polygon"] },
    sampleData: { signals: { total: 13, totalVolumeUsd: 245000, buyPressure: 8, sellPressure: 5, top: [{ token: "PEPE", amountUsd: 45000, soldRatio: 12, holders: 8500 }, { token: "RAVE", amountUsd: 24500, soldRatio: 91, holders: 3400 }] }, trending: [{ symbol: "RAVE", price: 6.26, volume: 1377000, holders: 3400 }, { symbol: "GORK", price: 0.042, volume: 890000, holders: 8200 }], aiSummary: "Bullish sentiment detected..." },
    sampleOutput: `{}`,
    sampleNote: "OKX Signal + Token API",
  },
  default: {
    kind: "product",
    description: "Paywalled API endpoint on wall402.",
    includes: ["API response"],
    sampleData: {},
    sampleOutput: `{ "data": "..." }`,
    sampleNote: "x402 payment required",
  },
};

const PRODUCT_SLUGS: Record<string, string> = {
  "AI Trading Signal": "/explore/ai-signal",
  "Token Security Scan": "/explore/security-scan",
  "Market Overview": "/explore/market-overview",
  "Wallet Intelligence": "/explore/wallet-intel",
  "Smart Money Alerts": "/explore/smart-money",
};

// ─── Page ───────────────────────────────────────────────

export default function ExplorePage() {
  const [account, setAccount] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  // Listen for account from global nav
  useEffect(() => {
    const w = window as unknown as { __wall402Account?: string | null };
    if (w.__wall402Account) setAccount(w.__wall402Account);
    const handler = (e: Event) => {
      setAccount((e as CustomEvent).detail as string | null);
    };
    window.addEventListener("wall402-account", handler);
    return () => window.removeEventListener("wall402-account", handler);
  }, []);
  const [result, setResult] = useState<{
    endpointId: string;
    endpointLabel: string;
    paid: boolean;
    settlement?: Record<string, unknown>;
    body?: unknown;
    error?: string;
  } | null>(null);

  // ── Load endpoints ──────────────────────────────────
  const refreshEndpoints = useCallback(async () => {
    const res = await fetch("/api/endpoints");
    const { endpoints: eps } = await res.json();
    setEndpoints(eps ?? []);
  }, []);
  useEffect(() => {
    refreshEndpoints();
  }, [refreshEndpoints]);


  // ── Buy flow: 402 → sign → replay ──────────────────
  const buyEndpoint = async (ep: Endpoint) => {
    if (!account) return;
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;

    setBuying(ep.id);
    setResult(null);

    // Build query string from user inputs
    const userInput = inputs[ep.id] ?? "";
    const qs = userInput ? `?q=${encodeURIComponent(userInput)}` : "";

    try {
      // Step 1 — trigger 402
      const challengeRes = await fetch(`/api/paywall/${ep.id}${qs}`);
      if (challengeRes.status !== 402) {
        setResult({
          endpointId: ep.id,
          endpointLabel: ep.label,
          paid: false,
          error: `Expected 402, got ${challengeRes.status}`,
        });
        return;
      }

      const headerValue = challengeRes.headers.get("payment-required");
      if (!headerValue) throw new Error("Missing PAYMENT-REQUIRED header");
      const challenge: Challenge = JSON.parse(atob(headerValue));
      const accepted = challenge.accepts.find(
        (a) => a.scheme === "exact",
      );
      if (!accepted) throw new Error("No exact scheme in accepts");

      // Step 2 — sign EIP-712 in wallet
      const now = Math.floor(Date.now() / 1000);
      const nonce = browserNonce();
      const validBefore = String(now + (accepted.maxTimeoutSeconds || 300));

      const domain = {
        name: accepted.extra?.name ?? "Global Dollar",
        version: accepted.extra?.version ?? "1",
        chainId: parseInt(accepted.network.split(":")[1]),
        verifyingContract: accepted.asset,
      };

      const message = {
        from: account,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: "0",
        validBefore,
        nonce,
      };

      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        domain,
        message,
      };

      const signature = (await eth.request({
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify(typedData)],
      })) as string;

      // Step 3 — assemble + replay
      const paymentPayload = {
        x402Version: 2,
        resource: challenge.resource,
        accepted,
        payload: {
          signature,
          authorization: {
            from: account,
            to: accepted.payTo,
            value: accepted.amount,
            validAfter: "0",
            validBefore,
            nonce,
          },
        },
      };
      const replayHeader = btoa(JSON.stringify(paymentPayload));

      const replay = await fetch(`/api/paywall/${ep.id}${qs}`, {
        headers: { "PAYMENT-SIGNATURE": replayHeader },
      });

      const paymentResponse = replay.headers.get("payment-response");
      const bodyText = await replay.text();
      let body: unknown = bodyText;
      try {
        body = JSON.parse(bodyText);
      } catch {
        /* keep as string */
      }

      setResult({
        endpointId: ep.id,
        endpointLabel: ep.label,
        paid: replay.ok,
        settlement: paymentResponse
          ? JSON.parse(paymentResponse)
          : undefined,
        body,
        error: replay.ok ? undefined : ((typeof body === "object" && body !== null && "reason" in (body as Record<string,unknown>)) ? String((body as Record<string,unknown>).reason) : `Payment failed (${replay.status})`),
      });
    } catch (err) {
      setResult({
        endpointId: ep.id,
        endpointLabel: ep.label,
        paid: false,
        error: (err as Error).message,
      });
    } finally {
      setBuying(null);
    }
  };

  // ── Render ──────────────────────────────────────────
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8 }}>~/explore</div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Explore & Buy
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
          {account
            ? "Browse products and sign an x402 authorization to purchase."
            : "Connect your wallet in the header to start purchasing."}
        </p>
      </div>

      {/* Product cards */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
        {endpoints.map((ep) => {
          const info = PRODUCT_INFO[ep.label] ?? PRODUCT_INFO.default;
          return (
            <div
              key={ep.id}
              className="panel card-hover fade-in"
              style={{ padding: 0, overflow: "hidden" }}
            >
              <div className="product-card-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: 280 }}>
                {/* Left: info */}
                <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <a href={PRODUCT_SLUGS[ep.label] ?? "/explore"} style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)", textDecoration: "none" }}>
                      {ep.label}
                    </a>
                    <span className="tag">{info.kind}</span>
                  </div>
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                    {info.description}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                    {info.includes.map((item) => (
                      <span key={item} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--fg-dim)" }}>
                        {item}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                    <a href={PRODUCT_SLUGS[ep.label] ?? "/explore"} className="btn btn-primary" style={{ padding: "10px 24px", textDecoration: "none" }}>
                      View details →
                    </a>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {fmtPrice(ep.priceAmount, ep.priceToken)} per call
                    </span>
                  </div>
                </div>

                {/* Right: locked visual preview */}
                <div style={{
                  background: "var(--panel-2)",
                  borderLeft: "1px solid var(--border)",
                  padding: "20px 24px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>
                    Preview
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <ProductResult kind={info.kind} data={info.sampleData} locked />
                  </div>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, var(--panel-2))" }} />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Result panel */}
      {result && (
        <section
          className="panel fade-in"
          style={{
            border: result.paid
              ? "1px solid var(--accent)"
              : "1px solid var(--danger)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                color: result.paid ? "var(--accent)" : "var(--danger)",
              }}
            >
              {result.paid
                ? `✓ purchased: ${result.endpointLabel}`
                : `✗ payment failed`}
            </h2>
            {typeof result.settlement?.resultSummary === "string" && (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {result.settlement.resultSummary}
              </span>
            )}
          </div>

          {result.error && (
            <div
              style={{
                color: "var(--danger)",
                fontSize: 12,
                marginBottom: 8,
              }}
            >
              {result.error}
            </div>
          )}

          {result.settlement && (
            <div
              style={{
                display: "flex",
                gap: 20,
                fontSize: 12,
                fontFamily: "var(--mono)",
                color: "var(--muted)",
                marginBottom: 12,
              }}
            >
              <span>
                tx{" "}
                <a
                  href={result.settlement.explorerUrl as string}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(result.settlement.txHash as string, 6)} ↗
                </a>
              </span>
              <span>
                payer {short(account ?? "", 5)}
              </span>
              <span>
                {result.settlement.mock ? (
                  <span className="tag tag-mock">mock settlement</span>
                ) : (
                  <span className="tag">live settlement</span>
                )}
              </span>
            </div>
          )}

          {result.body !== undefined && result.paid && (
            <div style={{ marginTop: 4 }}>
              <ProductResult
                kind={(result.body as Record<string, unknown>)?.kind as string}
                data={result.body as Record<string, unknown>}
              />
            </div>
          )}

          {result.body !== undefined && !result.paid && (
            <details>
              <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>
                raw response ▾
              </summary>
              <pre style={{ margin: 0, padding: 14, background: "var(--panel-2)", borderRadius: 8, fontSize: 11, lineHeight: 1.5, overflow: "auto", maxHeight: 300 }}>
                {JSON.stringify(result.body, null, 2)}
              </pre>
            </details>
          )}

          {/* Next steps after purchase */}
          {result.paid && (
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <a href="/activity" className="btn" style={{ fontSize: 12 }}>
                View in Activity →
              </a>
              <a href="/wallet" className="btn" style={{ fontSize: 12 }}>
                Analyze a wallet →
              </a>
              <button className="btn" onClick={() => setResult(null)} style={{ fontSize: 12 }}>
                Buy another product
              </button>
            </div>
          )}
        </section>
      )}

      <style>{`
        @media (max-width: 768px) {
          .product-card-grid { grid-template-columns: 1fr !important; height: auto !important; }
        }
      `}</style>
    </main>
  );
}

// ─── EIP-1193 minimal type ──────────────────────────────

interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
