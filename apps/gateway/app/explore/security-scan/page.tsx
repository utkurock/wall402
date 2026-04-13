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

const short = (s: string, n = 6) =>
  s.length <= 2 * n + 2 ? s : `${s.slice(0, n + 2)}...${s.slice(-n)}`;
const fmtPrice = (a: string) => (Number(a) / 1e6).toFixed(4) + " USDG";

type Endpoint = { id: string; label: string; priceAmount: string; priceToken: string; creatorWallet: string };

const POPULAR_TOKENS = [
  { name: "USDG", address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" },
  { name: "USDT", address: "0x779ded0c9e1022225f8e0630b35a9b54be713736" },
  { name: "WOKB", address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b" },
];

export default function SecurityScanPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [tokenAddress, setTokenAddress] = useState("");
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
    setEndpoint(endpoints?.find((e: Endpoint) => e.label === "Token Security Scan") ?? null);
  }, []);
  useEffect(() => { loadEndpoint(); }, [loadEndpoint]);

  const buy = async () => {
    if (!account || !endpoint) return;
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    setBuying(true); setResult(null);
    try { const cid = await eth.request({ method: "eth_chainId" }) as string; if (parseInt(cid,16)!==196) { try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] }); } catch(e:unknown) { if ((e as {code?:number})?.code===4902) { await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xc4", chainName: "X Layer", rpcUrls: ["https://rpc.xlayer.tech"], nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"] }] }); } else throw e; } } } catch { setResult({ paid: false, error: "Please switch to X Layer" }); setBuying(false); return; }
    const qs = tokenAddress ? `?q=${encodeURIComponent(tokenAddress)}` : "";
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
        <a href="/explore" style={{ color: "var(--muted)", textDecoration: "none" }}>~/explore</a> / security-scan
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Token Security Scan</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Scan any token for honeypots, high tax, mint authority risks, and other red flags before interacting.
          </p>
        </div>
        {endpoint && <div style={{ textAlign: "right" }}><div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700 }}>{fmtPrice(endpoint.priceAmount)}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>per scan</div></div>}
      </div>

      <div className="sec-grid" style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 24 }}>
        {/* Left: scan info + risk indicators */}
        <div>
          {/* Token input */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Token address to scan</div>
            <input className="input" placeholder="0x... token contract address" value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>or select a popular token:</div>
            <div style={{ display: "flex", gap: 6 }}>
              {POPULAR_TOKENS.map((t) => (
                <button key={t.name} className="btn" onClick={() => setTokenAddress(t.address)} style={{ fontSize: 11, padding: "5px 12px", background: tokenAddress === t.address ? "var(--fg)" : undefined, color: tokenAddress === t.address ? "var(--bg)" : undefined }}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* What we check */}
          <div className="panel">
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 16 }}>Security checks performed</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { name: "Honeypot Detection", desc: "Can you sell after buying?" },
                { name: "Tax Rate Analysis", desc: "Hidden buy/sell taxes" },
                { name: "Mint Authority", desc: "Can supply be inflated?" },
                { name: "Liquidity Check", desc: "Is liquidity real or faked?" },
                { name: "Contract Verification", desc: "Is source code verified?" },
                { name: "Holder Distribution", desc: "Whale concentration risk" },
              ].map((c) => (
                <div key={c.name} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: buy + result */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel">
            <button className="btn btn-primary" disabled={!account || buying} onClick={buy} style={{ width: "100%", padding: "12px", fontSize: 14 }}>
              {buying ? (<><span className="spinner" style={{ marginRight: 8 }} />Scanning...</>) : !account ? "Connect wallet" : `Scan Token — ${endpoint ? fmtPrice(endpoint.priceAmount) : "..."}`}
            </button>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
              Don&apos;t have USDG? <a href="/swap" style={{ color: "var(--fg)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "3px" }}>Swap any token →</a>
            </div>
          </div>

          {result?.paid && result.body ? (
            <div className="panel fade-in">
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Scan result</div>
              {result.settlement && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 12 }}>tx {short(String(result.settlement.txHash ?? ""), 5)}{result.settlement.mock === true && <span className="tag" style={{ fontSize: 9, marginLeft: 8 }}>mock</span>}</div>}
              <ProductResult kind="security" data={result.body as Record<string, unknown>} />
            </div>
          ) : result?.error ? (
            <div className="panel" style={{ border: "1px solid var(--danger)" }}><div style={{ color: "var(--danger)", fontSize: 13 }}>{result.error}</div></div>
          ) : (
            <div className="panel" style={{ position: "relative", overflow: "hidden" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 10 }}>Preview</div>
              <ProductResult kind="security" data={{ tokensScanned: 3, scan: [{ tokenAddress: "0x4ae46a509f6b", isHoneypot: false, isRiskToken: false, buyTaxes: "0", sellTaxes: "0" }, { tokenAddress: "0x779ded0c9e10", isHoneypot: false, isRiskToken: false, buyTaxes: "0", sellTaxes: "0" }] }} locked />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, var(--panel))" }} />
            </div>
          )}
        </div>
      </div>
      <style>{`@media(max-width:768px){.sec-grid{grid-template-columns:1fr!important}main{padding:20px 16px 60px!important}}`}</style>
    </main>
  );
}
