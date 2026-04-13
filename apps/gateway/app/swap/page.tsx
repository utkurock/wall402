"use client";

import { useEffect, useRef, useState } from "react";

interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const TOKENS = [
  { symbol: "OKB", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", native: true },
  { symbol: "USDG", address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" },
  { symbol: "USDT", address: "0x779ded0c9e1022225f8e0630b35a9b54be713736" },
  { symbol: "WOKB", address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b" },
];

function SwapWidget() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || ref.current.children.length > 0) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: "OKX:OKBUSDT", width: "100%", height: "100%", locale: "en",
      dateRange: "1D", colorTheme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light", isTransparent: true, autosize: true,
    });
    ref.current.appendChild(script);
  }, []);
  return <div ref={ref} style={{ height: 200, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }} />;
}

export default function SwapPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [fromToken, setFromToken] = useState("OKB");
  const [toToken, setToToken] = useState("USDG");
  const [amount, setAmount] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<{ ok: boolean; data?: unknown; error?: string } | null>(null);

  useEffect(() => {
    const w = window as unknown as { __wall402Account?: string | null };
    if (w.__wall402Account) setAccount(w.__wall402Account);
    const handler = (e: Event) => setAccount((e as CustomEvent).detail as string | null);
    window.addEventListener("wall402-account", handler);
    return () => window.removeEventListener("wall402-account", handler);
  }, []);

  const getQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setQuoteLoading(true);
    setQuote(null);
    try {
      const from = TOKENS.find(t => t.symbol === fromToken)!;
      const to = TOKENS.find(t => t.symbol === toToken)!;
      const res = await fetch(`/api/swap/quote?from=${from.address}&to=${to.address}&amount=${amount}&fromSymbol=${fromToken}&toSymbol=${toToken}`);
      const data = await res.json();
      setQuote(data);
    } catch (err) {
      setQuote({ error: (err as Error).message });
    } finally {
      setQuoteLoading(false);
    }
  };

  const executeSwap = async () => {
    if (!account || !amount) return;
    setSwapping(true);
    setSwapResult(null);
    try {
      const from = TOKENS.find(t => t.symbol === fromToken)!;
      const to = TOKENS.find(t => t.symbol === toToken)!;
      const res = await fetch("/api/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.address, to: to.address, amount, wallet: account }),
      });
      const data = await res.json();
      setSwapResult(data);
    } catch (err) {
      setSwapResult({ ok: false, error: (err as Error).message });
    } finally {
      setSwapping(false);
    }
  };

  const flip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setQuote(null);
    setSwapResult(null);
  };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8 }}>~/swap</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Swap</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Swap tokens on X Layer via Uniswap V3/V4 aggregator. Zero gas for USDG transfers.
          </p>
        </div>
        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--muted)" }}>X Layer · 196</span>
      </div>

      <div className="swap-grid" style={{ display: "grid", gridTemplateColumns: "1fr 440px", gap: 24 }}>
        {/* Left: chart + info */}
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>
            {fromToken} / {toToken}
          </div>
          <SwapWidget />

          <div className="panel" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 12 }}>Swap details</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "ROUTE", value: quote ? "Uniswap V3/V4 via onchainos" : "—" },
                { label: "NETWORK", value: "X Layer (196)" },
                { label: "GAS", value: "Zero gas for USDG transfers" },
                { label: "SLIPPAGE", value: "Auto" },
                { label: "AGGREGATOR", value: "OKX DEX Aggregator" },
              ].map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}>{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: swap form */}
        <div>
          <div className="panel">
            {/* From */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>You pay</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setQuote(null); setSwapResult(null); }}
                  style={{ flex: 1, fontSize: 24, fontWeight: 600, fontFamily: "var(--mono)", padding: "16px" }}
                />
                <select
                  className="input"
                  value={fromToken}
                  onChange={(e) => { setFromToken(e.target.value); setQuote(null); }}
                  style={{ width: 110, fontSize: 14, fontWeight: 600 }}
                >
                  {TOKENS.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
                </select>
              </div>
            </div>

            {/* Flip button */}
            <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
              <button
                onClick={flip}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: "1px solid var(--border)", background: "var(--panel-2)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, color: "var(--muted)",
                }}
              >
                ↕
              </button>
            </div>

            {/* To */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>You receive</div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{
                  flex: 1, padding: "16px", fontSize: 24, fontWeight: 600, fontFamily: "var(--mono)",
                  background: "var(--panel-2)", borderRadius: 10, border: "1px solid var(--border)",
                  color: quote && !quote.error ? "var(--fg)" : "var(--muted)",
                  minHeight: 60, display: "flex", alignItems: "center",
                }}>
                  {quoteLoading ? "..." : quote?.estimatedOutput ? String(quote.estimatedOutput) : "0.00"}
                </div>
                <select
                  className="input"
                  value={toToken}
                  onChange={(e) => { setToToken(e.target.value); setQuote(null); }}
                  style={{ width: 110, fontSize: 14, fontWeight: 600 }}
                >
                  {TOKENS.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
                </select>
              </div>
            </div>

            {/* Quote button */}
            {!quote && (
              <button className="btn" onClick={getQuote} disabled={!amount || quoteLoading} style={{ width: "100%", justifyContent: "center", padding: "12px", marginBottom: 8 }}>
                {quoteLoading ? <><span className="spinner" style={{ marginRight: 8 }} />Getting quote...</> : "Get quote"}
              </button>
            )}

            {/* Quote result */}
            {quote && typeof quote.error === "undefined" && (
              <div style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "var(--muted)" }}>Rate</span>
                  <span style={{ fontFamily: "var(--mono)" }}>1 {fromToken} = {String(quote.rate ?? "—")} {toToken}</span>
                </div>
                {typeof quote.route === "string" && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Route</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{String(quote.route)}</span>
                  </div>
                )}
              </div>
            )}

            {typeof quote?.error === "string" && (
              <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 12 }}>{quote.error}</div>
            )}

            {/* Swap button */}
            <button className="btn btn-primary" onClick={executeSwap} disabled={!account || swapping || !quote || typeof quote.error === "string"} style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: 15 }}>
              {swapping ? <><span className="spinner" style={{ marginRight: 8 }} />Swapping...</> : !account ? "Connect wallet" : !quote ? "Get quote first" : `Swap ${fromToken} → ${toToken}`}
            </button>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
              Executed via onchainos on X Layer. Requires token balance.
            </div>

            <div style={{ marginTop: 16, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, textAlign: "center" }}>
              Swap to USDG, then pay for AI signals, security scans, and more.
              <br />
              <a href="/explore" style={{ color: "var(--fg)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>
                Browse products →
              </a>
            </div>
          </div>

          {/* Swap result */}
          {swapResult && (
            <div className="panel fade-in" style={{ marginTop: 16, border: swapResult.ok ? "1px solid var(--border)" : "1px solid var(--danger)" }}>
              {swapResult.ok ? (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Swap submitted</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Transaction has been sent to X Layer via onchainos. Check your wallet for confirmation.
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--danger)", fontSize: 13 }}>{String(swapResult.error ?? "Swap failed")}</div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .swap-grid { grid-template-columns: 1fr !important; }
          main { padding: 20px 16px 60px !important; }
        }
      `}</style>
    </main>
  );
}
