"use client";

import { useCallback, useEffect, useState } from "react";
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

const SAMPLE_WALLETS = [
  { label: "vitalik.eth", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  { label: "Binance Hot", address: "0xF977814e90dA44bFA03b6295A0616a897441aceC" },
];

export default function WalletIntelPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [buying, setBuying] = useState(false);
  const [freePreview, setFreePreview] = useState<Record<string, unknown> | null>(null);
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
    setEndpoint(endpoints?.find((e: Endpoint) => e.label === "Wallet Intelligence") ?? null);
  }, []);
  useEffect(() => { loadEndpoint(); }, [loadEndpoint]);

  // Free preview when address changes
  const fetchFreePreview = async () => {
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return;
    try {
      const res = await fetch(`/api/wallet/${walletAddress}?chain=ethereum`);
      if (res.ok) setFreePreview(await res.json());
    } catch { /* ignore */ }
  };

  const buy = async () => {
    if (!account || !endpoint) return;
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    setBuying(true); setResult(null);
    const qs = walletAddress ? `?q=${encodeURIComponent(walletAddress)}` : "";
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

  const fmtUsd = (n: number) => n >= 1000 ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "$" + n.toFixed(2);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8 }}>
        <a href="/explore" style={{ color: "var(--muted)", textDecoration: "none" }}>~/explore</a> / wallet-intel
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Wallet Intelligence</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>Deep multi-chain wallet analysis: trust score, PnL, security scan, hold times, AI behavioral summary.</p>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {["Ethereum", "BSC", "Polygon", "Arbitrum", "Base", "X Layer"].map((c) => (
              <span key={c} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--muted)" }}>{c}</span>
            ))}
          </div>
        </div>
        {endpoint && <div style={{ textAlign: "right" }}><div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700 }}>{fmtPrice(endpoint.priceAmount)}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>per report</div></div>}
      </div>

      {/* Address input */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Wallet address to analyze</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="0x... wallet address" value={walletAddress} onChange={(e) => { setWalletAddress(e.target.value); setFreePreview(null); setResult(null); }} style={{ flex: 1 }} />
          <button className="btn" onClick={fetchFreePreview} style={{ whiteSpace: "nowrap" }}>Free preview</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 4 }}>try:</span>
          {SAMPLE_WALLETS.map((w) => (
            <button key={w.label} className="btn" onClick={() => { setWalletAddress(w.address); setFreePreview(null); setResult(null); }} style={{ fontSize: 11, padding: "4px 10px" }}>{w.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Left: free preview + comparison */}
        <div>
          {/* Free tier preview */}
          {freePreview && (
            <div className="panel fade-in" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)" }}>Free preview</div>
                <span className="tag" style={{ fontSize: 10 }}>FREE</span>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-dim)", marginBottom: 12 }}>{short(walletAddress, 8)}</div>
              {(freePreview as { balance?: { native: number; symbol: string; usd: number } }).balance && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700 }}>
                    {(freePreview as { balance: { native: number; symbol: string } }).balance.native.toFixed(4)} <span style={{ fontSize: 12, color: "var(--muted)" }}>{(freePreview as { balance: { symbol: string } }).balance.symbol}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--fg-dim)" }}>≈ {fmtUsd((freePreview as { balance: { usd: number } }).balance.usd)}</div>
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--muted)", padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6 }}>
                Free tier shows balance only. Upgrade for trust score, AI analysis, security scan, hold times.
              </div>
            </div>
          )}

          {/* What's included comparison */}
          <div className="panel">
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 16 }}>Free vs Paid</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { feature: "Native balance", free: true, paid: true },
                { feature: "USD valuation", free: true, paid: true },
                { feature: "DEX trade stats", free: true, paid: true },
                { feature: "Trust score (0-100)", free: false, paid: true },
                { feature: "AI behavior analysis", free: false, paid: true },
                { feature: "Token security scan", free: false, paid: true },
                { feature: "Hold time per token", free: false, paid: true },
                { feature: "PnL breakdown", free: false, paid: true },
              ].map((row, i) => (
                <div key={row.feature} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", padding: "8px 0", borderBottom: i < 7 ? "1px solid var(--border)" : undefined, fontSize: 12, alignItems: "center" }}>
                  <span style={{ color: "var(--fg-dim)" }}>{row.feature}</span>
                  <span style={{ textAlign: "center", color: row.free ? "var(--fg)" : "var(--muted)" }}>{row.free ? "✓" : "—"}</span>
                  <span style={{ textAlign: "center", color: "var(--fg)" }}>✓</span>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", padding: "8px 0", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}>
                <span />
                <span style={{ textAlign: "center" }}>Free</span>
                <span style={{ textAlign: "center" }}>Paid</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: buy + full result */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <button className="btn btn-primary" disabled={!account || buying || !walletAddress} onClick={buy} style={{ width: "100%", padding: "14px", fontSize: 15, justifyContent: "center" }}>
            {buying ? (<><span className="spinner" style={{ marginRight: 8 }} />Analyzing...</>) : !account ? "Connect wallet" : !walletAddress ? "Enter address first" : `Full Report — ${endpoint ? fmtPrice(endpoint.priceAmount) : "..."}`}
          </button>

          {result?.paid && result.body ? (
            <div className="panel fade-in">
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Full intelligence report</div>
              {result.settlement && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 12 }}>tx {short(String(result.settlement.txHash ?? ""), 5)}{result.settlement.mock === true && <span className="tag" style={{ fontSize: 9, marginLeft: 8 }}>mock</span>}</div>}
              <ProductResult kind="wallet" data={result.body as Record<string, unknown>} />
            </div>
          ) : result?.error ? (
            <div className="panel" style={{ border: "1px solid var(--danger)" }}><div style={{ color: "var(--danger)", fontSize: 13 }}>{result.error}</div></div>
          ) : (
            <div className="panel" style={{ position: "relative", overflow: "hidden" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Preview</div>
              <ProductResult kind="wallet" data={{ address: walletAddress || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", trustScore: 75, verdict: "trusted", stats: { winRate: "68%", totalTransactions: 142, realizedPnlUsd: 12450 }, tokenSecurity: { totalScanned: 8, clean: 7, riskyTokens: 1 }, aiSummary: "Full AI analysis unlocked after purchase..." }} locked />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, var(--panel))" }} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
