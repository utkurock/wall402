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

const short = (s: string, n = 6) => s.length <= 2 * n + 2 ? s : `${s.slice(0, n + 2)}...${s.slice(-n)}`;
const fmtPrice = (a: string) => (Number(a) / 1e6).toFixed(4) + " USDG";

type Endpoint = { id: string; label: string; priceAmount: string; priceToken: string };

function TickerWidget() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || ref.current.children.length > 0) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: "OKX:OKBUSDT", title: "OKB" },
        { proName: "BINANCE:BTCUSDT", title: "BTC" },
        { proName: "BINANCE:ETHUSDT", title: "ETH" },
        { proName: "BINANCE:SOLUSDT", title: "SOL" },
        { proName: "BINANCE:BNBUSDT", title: "BNB" },
      ],
      showSymbolLogo: true, colorTheme: "light", isTransparent: true, displayMode: "adaptive", locale: "en",
    });
    ref.current.appendChild(script);
  }, []);
  return <div ref={ref} style={{ marginBottom: 20, borderRadius: 8, overflow: "hidden" }} />;
}

function HeatmapWidget() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || ref.current.children.length > 0) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      dataSource: "Crypto", blockSize: "market_cap_calc", blockColor: "change",
      locale: "en", symbolUrl: "", colorTheme: "light", hasTopBar: false,
      isDataSetEnabled: false, isZoomEnabled: false, hasSymbolTooltip: true,
      width: "100%", height: 400, isTransparent: true,
    });
    ref.current.appendChild(script);
  }, []);
  return <div ref={ref} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }} />;
}

const CHAINS = ["ethereum", "base", "arbitrum", "bsc", "polygon", "X Layer"];

export default function SmartMoneyPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [chain, setChain] = useState("ethereum");
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
    setEndpoint(endpoints?.find((e: Endpoint) => e.label === "Smart Money Alerts") ?? null);
  }, []);
  useEffect(() => { loadEndpoint(); }, [loadEndpoint]);

  const buy = async () => {
    if (!account || !endpoint) return;
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    setBuying(true); setResult(null);
    try { const cid = await eth.request({ method: "eth_chainId" }) as string; if (parseInt(cid,16)!==196) { try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] }); } catch(e:unknown) { if ((e as {code?:number})?.code===4902) { await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xc4", chainName: "X Layer", rpcUrls: ["https://rpc.xlayer.tech"], nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"] }] }); } else throw e; } } } catch { setResult({ paid: false, error: "Please switch to X Layer" }); setBuying(false); return; }
    const qs = `?q=${encodeURIComponent(chain)}`;
    try {
      const challengeRes = await fetch(`/api/paywall/${endpoint.id}${qs}`);
      if (challengeRes.status !== 402) throw new Error(`Expected 402`);
      const challenge = JSON.parse(atob(challengeRes.headers.get("payment-required")!));
      const accepted = challenge.accepts.find((a: { scheme: string }) => a.scheme === "exact");
      const now = Math.floor(Date.now() / 1000), nonce = browserNonce();
      const sig = (await eth.request({ method: "eth_signTypedData_v4", params: [account, JSON.stringify({
        types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        primaryType: "TransferWithAuthorization",
        domain: { name: accepted.extra?.name ?? "Global Dollar", version: accepted.extra?.version ?? "1", chainId: parseInt(accepted.network.split(":")[1]), verifyingContract: accepted.asset },
        message: { from: account, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(now + 300), nonce },
      })] })) as string;
      const replay = await fetch(`/api/paywall/${endpoint.id}${qs}`, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify({ x402Version: 2, resource: challenge.resource, accepted, payload: { signature: sig, authorization: { from: account, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(now + 300), nonce } } })) } });
      const body = await replay.json().catch(() => replay.text());
      const pr = replay.headers.get("payment-response");
      setResult({ paid: replay.ok, body, settlement: pr ? JSON.parse(pr) : undefined, error: replay.ok ? undefined : `HTTP ${replay.status}` });
    } catch (err) { setResult({ paid: false, error: (err as Error).message }); }
    finally { setBuying(false); }
  };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8 }}>
        <a href="/explore" style={{ color: "var(--muted)", textDecoration: "none" }}>~/explore</a> / smart-money
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Smart Money Alerts</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Track whale wallets, smart money flows, and trending tokens in real-time. AI-powered market sentiment analysis.
          </p>
        </div>
        {endpoint && <div style={{ textAlign: "right" }}><div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700 }}>{fmtPrice(endpoint.priceAmount)}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>per alert</div></div>}
      </div>

      {/* Chain selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {CHAINS.map((c) => (
          <button key={c} onClick={() => { setChain(c); setResult(null); }} className="btn" style={{
            padding: "8px 16px", fontSize: 12, textTransform: "capitalize",
            fontWeight: chain === c ? 600 : 400,
            background: chain === c ? "var(--fg)" : undefined,
            color: chain === c ? "var(--bg)" : undefined,
            borderColor: chain === c ? "var(--fg)" : undefined,
          }}>
            {c}
          </button>
        ))}
      </div>

      {/* Ticker tape */}
      <TickerWidget />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20, marginBottom: 24 }}>
        {/* Left: heatmap */}
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>
            Market heatmap
          </div>
          <HeatmapWidget />
        </div>

        {/* Right: buy + result */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel">
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 12 }}>
              Get alerts for {chain}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {["Whale trades", "Smart money", "Trending tokens", "Buy/sell pressure", "Volume analysis", "AI sentiment"].map((f) => (
                <span key={f} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--fg-dim)" }}>{f}</span>
              ))}
            </div>
            <button className="btn btn-primary" disabled={!account || buying} onClick={buy} style={{ width: "100%", padding: "12px", fontSize: 14 }}>
              {buying ? (<><span className="spinner" style={{ marginRight: 8 }} />Loading...</>) : !account ? "Connect wallet" : `Get Alerts — ${endpoint ? fmtPrice(endpoint.priceAmount) : "..."}`}
            </button>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
              Don&apos;t have USDG? <a href="/swap" style={{ color: "var(--fg)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "3px" }}>Swap any token →</a>
            </div>
          </div>

          {result?.paid && result.body ? (
            <div className="panel fade-in" style={{ maxHeight: 500, overflow: "auto" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Alert results</div>
              {result.settlement && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 12 }}>tx {short(String(result.settlement.txHash ?? ""), 5)}{result.settlement.mock === true && <span className="tag" style={{ fontSize: 9, marginLeft: 8 }}>mock</span>}</div>}
              <ProductResult kind="alpha" data={result.body as Record<string, unknown>} />
            </div>
          ) : result?.error ? (
            <div className="panel" style={{ border: "1px solid var(--danger)" }}><div style={{ color: "var(--danger)", fontSize: 13 }}>{result.error}</div></div>
          ) : (
            <div className="panel" style={{ position: "relative", overflow: "hidden" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Preview</div>
              <ProductResult kind="alpha" data={{
                signals: { total: 13, totalVolumeUsd: 245000, buyPressure: 8, sellPressure: 5, top: [
                  { token: "PEPE", amountUsd: 45000, soldRatio: 12, holders: 8500 },
                  { token: "RAVE", amountUsd: 24500, soldRatio: 91, holders: 3400 },
                  { token: "MOG", amountUsd: 18000, soldRatio: 22, holders: 12000 },
                ] },
                trending: [
                  { symbol: "RAVE", price: 6.26, volume: 1377000, holders: 3400 },
                  { symbol: "GORK", price: 0.042, volume: 890000, holders: 8200 },
                ],
                aiSummary: "Bullish sentiment. Smart money accumulating mid-cap tokens with strong holder growth...",
              }} locked />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, var(--panel))" }} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
