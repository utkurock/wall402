"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProductResult } from "../../components/product-results";

interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function browserNonce(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "0x" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

const short = (s: string, n = 6) =>
  s.length <= 2 * n + 2 ? s : `${s.slice(0, n + 2)}...${s.slice(-n)}`;

// ─── TradingView Widget ──────────────────────────────────

const TV_SYMBOLS: Record<string, string> = {
  OKB: "OKX:OKBUSDT",
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
};

function MiniChart({ symbol, label }: { symbol: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || ref.current.children.length > 0) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      height: "100%",
      locale: "en",
      dateRange: "1D",
      colorTheme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
      noTimeScale: false,
      chartOnly: false,
    });
    ref.current.appendChild(script);
  }, [symbol]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <div ref={ref} style={{ height: 180, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }} />
    </div>
  );
}

function TechnicalAnalysis({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      interval: "1h",
      width: "100%",
      height: 380,
      symbol,
      showIntervalTabs: true,
      locale: "en",
      colorTheme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      isTransparent: true,
    });
    ref.current.appendChild(script);
  }, [symbol]);

  return <div ref={ref} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }} />;
}

// ─── Page ────────────────────────────────────────────────

type Endpoint = { id: string; label: string; priceAmount: string; priceToken: string; creatorWallet: string };

export default function AISignalPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [asset, setAsset] = useState("OKB");
  const [buying, setBuying] = useState(false);
  const [result, setResult] = useState<{ paid: boolean; body?: unknown; settlement?: Record<string, unknown>; error?: string } | null>(null);

  useEffect(() => {
    const w = window as unknown as { __wall402Account?: string | null };
    if (w.__wall402Account) setAccount(w.__wall402Account);
    const handler = (e: Event) => setAccount((e as CustomEvent).detail as string | null);
    window.addEventListener("wall402-account", handler);
    return () => window.removeEventListener("wall402-account", handler);
  }, []);

  const loadEndpoint = useCallback(async () => {
    const res = await fetch("/api/endpoints");
    const { endpoints } = await res.json();
    const ep = endpoints?.find((e: Endpoint) => e.label === "AI Trading Signal");
    setEndpoint(ep ?? null);
  }, []);
  useEffect(() => { loadEndpoint(); }, [loadEndpoint]);

  const buy = async () => {
    if (!account || !endpoint) return;
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    setBuying(true);
    setResult(null);
    try {
      const chainId = await eth.request({ method: "eth_chainId" }) as string;
      if (parseInt(chainId, 16) !== 196) {
        try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] }); }
        catch (e: unknown) { if ((e as {code?:number})?.code === 4902) { await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xc4", chainName: "X Layer", rpcUrls: ["https://rpc.xlayer.tech"], nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"] }] }); } else throw e; }
      }
    } catch { setResult({ paid: false, body: undefined, error: "Please switch to X Layer" }); setBuying(false); return; }
    const qs = `?q=${encodeURIComponent(asset)}`;
    try {
      const challengeRes = await fetch(`/api/paywall/${endpoint.id}${qs}`);
      if (challengeRes.status !== 402) throw new Error(`Expected 402, got ${challengeRes.status}`);
      const headerValue = challengeRes.headers.get("payment-required");
      if (!headerValue) throw new Error("Missing header");
      const challenge = JSON.parse(atob(headerValue));
      const accepted = challenge.accepts.find((a: { scheme: string }) => a.scheme === "exact");
      if (!accepted) throw new Error("No exact scheme");
      const now = Math.floor(Date.now() / 1000);
      const nonce = browserNonce();
      const signature = (await eth.request({
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify({
          types: {
            EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
            TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }],
          },
          primaryType: "TransferWithAuthorization",
          domain: { name: accepted.extra?.name ?? "Global Dollar", version: accepted.extra?.version ?? "1", chainId: parseInt(accepted.network.split(":")[1]), verifyingContract: accepted.asset },
          message: { from: account, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(now + 300), nonce },
        })],
      })) as string;
      const paymentPayload = { x402Version: 2, resource: challenge.resource, accepted, payload: { signature, authorization: { from: account, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(now + 300), nonce } } };
      const replay = await fetch(`/api/paywall/${endpoint.id}${qs}`, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(paymentPayload)) } });
      const bodyText = await replay.text();
      let body: unknown = bodyText;
      try { body = JSON.parse(bodyText); } catch { /* */ }
      const pr = replay.headers.get("payment-response");
      setResult({ paid: replay.ok, body, settlement: pr ? JSON.parse(pr) : undefined, error: replay.ok ? undefined : ((typeof body === "object" && body !== null && "reason" in (body as Record<string,unknown>)) ? String((body as Record<string,unknown>).reason) : `Payment failed (${replay.status})`) });
    } catch (err) {
      setResult({ paid: false, error: (err as Error).message });
    } finally {
      setBuying(false);
    }
  };

  const fmtPrice = (a: string) => (Number(a) / 1e6).toFixed(4) + " USDG";
  const tvSymbol = TV_SYMBOLS[asset] ?? TV_SYMBOLS.OKB;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8 }}>
        <a href="/explore" style={{ color: "var(--muted)", textDecoration: "none" }}>~/explore</a> / ai-signal
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>AI Trading Signal</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Live market data + technical indicators + AI analysis. Pick an asset and get a real-time signal.
          </p>
        </div>
        {endpoint && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700 }}>{fmtPrice(endpoint.priceAmount)}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>per signal</div>
          </div>
        )}
      </div>

      {/* Asset selector tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {["OKB", "BTC", "ETH"].map((a) => (
          <button
            key={a}
            onClick={() => { setAsset(a); setResult(null); }}
            className="btn"
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: asset === a ? 600 : 400,
              background: asset === a ? "var(--fg)" : undefined,
              color: asset === a ? "var(--bg)" : undefined,
              borderColor: asset === a ? "var(--fg)" : undefined,
            }}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <MiniChart symbol={TV_SYMBOLS.OKB} label="OKB / USDT" />
        <MiniChart symbol={TV_SYMBOLS.BTC} label="BTC / USDT" />
        <MiniChart symbol={TV_SYMBOLS.ETH} label="ETH / USDT" />
      </div>

      {/* Main content: Technical Analysis + Buy panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 24 }}>
        {/* Left: TradingView Technical Analysis */}
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>
            Technical analysis · {asset}
          </div>
          <TechnicalAnalysis symbol={tvSymbol} />
        </div>

        {/* Right: Buy panel + features */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel">
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 12 }}>
              Get AI signal for {asset}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {["Long/Short", "Entry price", "Target", "Stop loss", "RSI(14)", "MACD", "MA(20)", "Volume", "AI analysis"].map((f) => (
                <span key={f} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--fg-dim)" }}>{f}</span>
              ))}
            </div>
            <button className="btn btn-primary" disabled={!account || buying} onClick={buy} style={{ width: "100%", padding: "12px", fontSize: 14 }}>
              {buying ? (<><span className="spinner" style={{ marginRight: 8 }} />Signing...</>) : !account ? "Connect wallet" : `Buy ${asset} Signal — ${endpoint ? fmtPrice(endpoint.priceAmount) : "..."}`}
            </button>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
              Don&apos;t have USDG? <a href="/swap" style={{ color: "var(--fg)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "3px" }}>Swap any token →</a>
            </div>
          </div>

          {/* Result or preview */}
          {result?.paid && result.body ? (
            <div className="panel fade-in" style={{ maxHeight: 520, overflow: "auto" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>
                Signal result
              </div>
              {result.settlement && (
                <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 12 }}>
                  tx {short(String(result.settlement.txHash ?? ""), 5)}
                  {result.settlement.mock === true && <span className="tag" style={{ fontSize: 9, marginLeft: 8 }}>mock</span>}
                </div>
              )}
              <ProductResult kind="signal" data={result.body as Record<string, unknown>} />
            </div>
          ) : result?.error ? (
            <div className="panel" style={{ border: "1px solid var(--danger)" }}>
              <div style={{ color: "var(--danger)", fontSize: 13 }}>{result.error}</div>
            </div>
          ) : (
            <div className="panel" style={{ position: "relative", overflow: "hidden" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Preview</div>
              <ProductResult kind="signal" data={{ asset, signal: "LONG", price: 84.34, entry: 84.10, target: 88.30, stop: 82.50, indicators: { rsi14: 52.3, ma20: 83.80 }, aiAnalysis: "AI analysis unlocked after purchase..." }} locked />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, var(--panel))" }} />
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          main { padding: 20px 16px 60px !important; }
          main > div:nth-child(4) { flex-direction: column !important; }
          main > div:nth-child(4) > div { min-height: 160px; }
          main > div:nth-child(5) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
