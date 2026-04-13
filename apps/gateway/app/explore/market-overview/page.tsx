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

type Endpoint = { id: string; label: string; priceAmount: string; priceToken: string; creatorWallet: string };

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
        { proName: "BINANCE:BNBUSDT", title: "BNB" },
        { proName: "BINANCE:SOLUSDT", title: "SOL" },
      ],
      showSymbolLogo: true,
      colorTheme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      isTransparent: true,
      displayMode: "adaptive",
      locale: "en",
    });
    ref.current.appendChild(script);
  }, []);
  return <div ref={ref} style={{ marginBottom: 20, borderRadius: 8, overflow: "hidden" }} />;
}

function MarketChart({ symbol, label }: { symbol: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || ref.current.children.length > 0) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [[label, symbol]],
      chartOnly: false,
      width: "100%",
      height: 300,
      locale: "en",
      colorTheme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      autosize: false,
      showVolume: true,
      showMA: true,
      hideDateRanges: false,
      hideMarketStatus: true,
      hideSymbolLogo: false,
      scalePosition: "right",
      scaleMode: "Normal",
      fontFamily: "var(--mono)",
      fontSize: "10",
      noTimeScale: false,
      valuesTracking: "1",
      changeMode: "price-and-percent",
      chartType: "area",
      lineWidth: 2,
      lineType: 0,
      dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D"],
      isTransparent: true,
    });
    ref.current.appendChild(script);
  }, [symbol, label]);
  return <div ref={ref} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }} />;
}

export default function MarketOverviewPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
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
    setEndpoint(endpoints?.find((e: Endpoint) => e.label === "Market Overview") ?? null);
  }, []);
  useEffect(() => { loadEndpoint(); }, [loadEndpoint]);

  const buy = async () => {
    if (!account || !endpoint) return;
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    setBuying(true); setResult(null);
    try { const cid = await eth.request({ method: "eth_chainId" }) as string; if (parseInt(cid,16)!==196) { try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] }); } catch(e:unknown) { if ((e as {code?:number})?.code===4902) { await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xc4", chainName: "X Layer", rpcUrls: ["https://rpc.xlayer.tech"], nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"] }] }); } else throw e; } } } catch { setResult({ paid: false, error: "Please switch to X Layer" }); setBuying(false); return; }
    try {
      const challengeRes = await fetch(`/api/paywall/${endpoint.id}`);
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
      const replay = await fetch(`/api/paywall/${endpoint.id}`, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify({ x402Version: 2, resource: challenge.resource, accepted, payload: { signature: sig, authorization: { from: account, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(now + 300), nonce } } })) } });
      const body = await replay.json().catch(() => replay.text());
      const pr = replay.headers.get("payment-response");
      setResult({ paid: replay.ok, body, settlement: pr ? JSON.parse(pr) : undefined, error: replay.ok ? undefined : ((typeof body === "object" && body !== null && "reason" in (body as Record<string,unknown>)) ? String((body as Record<string,unknown>).reason) : `Payment failed (${replay.status})`) });
    } catch (err) { setResult({ paid: false, error: (err as Error).message }); }
    finally { setBuying(false); }
  };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8 }}>
        <a href="/explore" style={{ color: "var(--muted)", textDecoration: "none" }}>~/explore</a> / market-overview
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Market Overview</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>Live multi-asset snapshot with RSI, moving averages, volume trends, and 24h change from X Layer DEX.</p>
        </div>
        {endpoint && <div style={{ textAlign: "right" }}><div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700 }}>{fmtPrice(endpoint.priceAmount)}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>per snapshot</div></div>}
      </div>

      {/* Ticker tape */}
      <TickerWidget />

      {/* Charts grid */}
      <div className="charts-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <MarketChart symbol="OKX:OKBUSDT" label="OKB/USDT" />
        <MarketChart symbol="BINANCE:BTCUSDT" label="BTC/USDT" />
        <MarketChart symbol="BINANCE:ETHUSDT" label="ETH/USDT" />
      </div>

      {/* Buy + result */}
      <div className="mkt-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="panel">
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 12 }}>What you get</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {["OKB price & RSI", "BTC price & RSI", "ETH price & RSI", "Volume trends", "24h change", "Bias indicator"].map((f) => (
              <span key={f} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--fg-dim)" }}>{f}</span>
            ))}
          </div>
          <button className="btn btn-primary" disabled={!account || buying} onClick={buy} style={{ width: "100%", padding: "12px", fontSize: 14 }}>
            {buying ? (<><span className="spinner" style={{ marginRight: 8 }} />Loading...</>) : !account ? "Connect wallet" : `Get Snapshot — ${endpoint ? fmtPrice(endpoint.priceAmount) : "..."}`}
          </button>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>DEX prices via OKX aggregator · may differ from CEX</div>
        </div>

        {result?.paid && result.body ? (
          <div className="panel fade-in">
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Snapshot result</div>
            {result.settlement && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 12 }}>tx {short(String(result.settlement.txHash ?? ""), 5)}</div>}
            <ProductResult kind="market" data={result.body as Record<string, unknown>} />
          </div>
        ) : result?.error ? (
          <div className="panel" style={{ border: "1px solid var(--danger)" }}><div style={{ color: "var(--danger)", fontSize: 13 }}>{result.error}</div></div>
        ) : (
          <div className="panel" style={{ position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Preview</div>
            <ProductResult kind="market" data={{ assets: { OKB: { price: 84.72, rsi14: 58.2, change24h: "+1.4" }, BTC: { price: 85067, rsi14: 44.5, change24h: "-0.8" }, ETH: { price: 2213, rsi14: 38.1, change24h: "-2.1" } } }} locked />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, var(--panel))" }} />
          </div>
        )}
      </div>
      <style>{`@media(max-width:768px){.charts-grid{grid-template-columns:1fr!important}.mkt-grid{grid-template-columns:1fr!important}main{padding:20px 16px 60px!important}}`}</style>
    </main>
  );
}
