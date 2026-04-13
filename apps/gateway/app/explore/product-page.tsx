"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductResult } from "../components/product-results";

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

const fmtPrice = (amount: string, token: string) => {
  const v = Number(amount) / 1e6;
  return `${v.toFixed(v >= 1 ? 2 : 4)} ${token}`;
};

type Endpoint = {
  id: string;
  label: string;
  priceAmount: string;
  priceToken: string;
  creatorWallet: string;
};

export function ProductPage({
  slug,
  title,
  kind,
  description,
  features,
  inputConfig,
  sampleData,
}: {
  slug: string;
  title: string;
  kind: string;
  description: string;
  features: string[];
  inputConfig?: { placeholder: string; type: "select" | "text"; options?: string[] };
  sampleData: Record<string, unknown>;
}) {
  const [account, setAccount] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [input, setInput] = useState(inputConfig?.options?.[0] ?? "");
  const [buying, setBuying] = useState(false);
  const [result, setResult] = useState<{ paid: boolean; body?: unknown; settlement?: Record<string, unknown>; error?: string } | null>(null);

  // Listen for global wallet
  useEffect(() => {
    const w = window as unknown as { __wall402Account?: string | null };
    if (w.__wall402Account) setAccount(w.__wall402Account);
    const handler = (e: Event) => setAccount((e as CustomEvent).detail as string | null);
    window.addEventListener("wall402-account", handler);
    return () => window.removeEventListener("wall402-account", handler);
  }, []);

  // Find matching endpoint
  const loadEndpoint = useCallback(async () => {
    const res = await fetch("/api/endpoints");
    const { endpoints } = await res.json();
    const ep = endpoints?.find((e: Endpoint) => e.label === title);
    setEndpoint(ep ?? null);
  }, [title]);
  useEffect(() => { loadEndpoint(); }, [loadEndpoint]);

  // Buy flow
  const buy = async () => {
    if (!account || !endpoint) return;
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    setBuying(true);
    setResult(null);

    // Auto-switch to X Layer if needed
    try {
      const chainId = await eth.request({ method: "eth_chainId" }) as string;
      if (parseInt(chainId, 16) !== 196) {
        try {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] });
        } catch (switchErr: unknown) {
          if ((switchErr as { code?: number })?.code === 4902) {
            await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xc4", chainName: "X Layer", rpcUrls: ["https://rpc.xlayer.tech"], nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"] }] });
          } else throw switchErr;
        }
      }
    } catch (err) {
      setResult({ paid: false, error: "Please switch to X Layer network" });
      setBuying(false);
      return;
    }

    const qs = input ? `?q=${encodeURIComponent(input)}` : "";
    try {
      const challengeRes = await fetch(`/api/paywall/${endpoint.id}${qs}`);
      if (challengeRes.status !== 402) throw new Error(`Expected 402, got ${challengeRes.status}`);
      const headerValue = challengeRes.headers.get("payment-required");
      if (!headerValue) throw new Error("Missing PAYMENT-REQUIRED header");
      const challenge = JSON.parse(atob(headerValue));
      const accepted = challenge.accepts.find((a: { scheme: string }) => a.scheme === "exact");
      if (!accepted) throw new Error("No exact scheme");

      const now = Math.floor(Date.now() / 1000);
      const nonce = browserNonce();
      const signature = (await eth.request({
        method: "eth_signTypedData_v4",
        params: [account, JSON.stringify({
          types: {
            EIP712Domain: [
              { name: "name", type: "string" }, { name: "version", type: "string" },
              { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
            ],
            TransferWithAuthorization: [
              { name: "from", type: "address" }, { name: "to", type: "address" },
              { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
              { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
            ],
          },
          primaryType: "TransferWithAuthorization",
          domain: {
            name: accepted.extra?.name ?? "Global Dollar",
            version: accepted.extra?.version ?? "1",
            chainId: parseInt(accepted.network.split(":")[1]),
            verifyingContract: accepted.asset,
          },
          message: { from: account, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(now + 300), nonce },
        })],
      })) as string;

      const paymentPayload = {
        x402Version: 2, resource: challenge.resource, accepted,
        payload: { signature, authorization: { from: account, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(now + 300), nonce } },
      };
      const replay = await fetch(`/api/paywall/${endpoint.id}${qs}`, {
        headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(paymentPayload)) },
      });
      const bodyText = await replay.text();
      let body: unknown = bodyText;
      try { body = JSON.parse(bodyText); } catch { /* keep text */ }
      const paymentResponse = replay.headers.get("payment-response");

      setResult({
        paid: replay.ok,
        body,
        settlement: paymentResponse ? JSON.parse(paymentResponse) : undefined,
        error: replay.ok ? undefined : ((typeof body === "object" && body !== null && "reason" in (body as Record<string,unknown>)) ? String((body as Record<string,unknown>).reason) : `Payment failed (${replay.status})`),
      });
    } catch (err) {
      setResult({ paid: false, error: (err as Error).message });
    } finally {
      setBuying(false);
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px" }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8 }}>
        <a href="/explore" style={{ color: "var(--muted)", textDecoration: "none" }}>~/explore</a> / {slug}
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</h1>
          <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>{description}</p>
        </div>
        {endpoint && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700 }}>
              {fmtPrice(endpoint.priceAmount, endpoint.priceToken)}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>per call</div>
          </div>
        )}
      </div>

      {/* Features */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        {features.map((f) => (
          <span key={f} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--fg-dim)" }}>{f}</span>
        ))}
      </div>

      {/* Input + Buy */}
      <div className="panel" style={{ marginBottom: 28 }}>
        {inputConfig && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>
              {inputConfig.placeholder}
            </div>
            {inputConfig.type === "select" ? (
              <select className="input" value={input} onChange={(e) => setInput(e.target.value)} style={{ maxWidth: 300 }}>
                {inputConfig.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input className="input" placeholder={inputConfig.placeholder} value={input} onChange={(e) => setInput(e.target.value)} style={{ maxWidth: 440 }} />
            )}
          </div>
        )}
        <button className="btn btn-primary" disabled={!account || buying} onClick={buy} style={{ padding: "12px 32px", fontSize: 14 }}>
          {buying ? (<><span className="spinner" style={{ marginRight: 8 }} />Signing...</>) : !account ? "Connect wallet first" : `Buy for ${endpoint ? fmtPrice(endpoint.priceAmount, endpoint.priceToken) : "..."}`}
        </button>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
          Don&apos;t have USDG? <a href="/swap" style={{ color: "var(--fg)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: "3px" }}>Swap any token →</a>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="panel fade-in" style={{ border: result.paid ? "1px solid var(--border)" : "1px solid var(--danger)" }}>
          {result.error && !result.paid && (
            <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{result.error}</div>
          )}
          {result.paid && result.settlement && (
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)", marginBottom: 16, fontFamily: "var(--mono)" }}>
              <span>tx {short(String(result.settlement.txHash ?? ""), 5)}</span>
              <span>payer {short(account ?? "", 4)}</span>
              {result.settlement.mock === true && <span className="tag" style={{ fontSize: 10 }}>mock</span>}
            </div>
          )}
          {result.paid && result.body !== undefined && result.body !== null && (
            <ProductResult kind={kind} data={result.body as Record<string, unknown>} />
          )}
        </div>
      )}

      {/* Preview (when no result yet) */}
      {!result && (
        <div className="panel" style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 12 }}>
            Sample result preview
          </div>
          <ProductResult kind={kind} data={sampleData} locked />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "linear-gradient(transparent, var(--panel))" }} />
          <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center", fontSize: 13, color: "var(--fg-dim)", fontWeight: 500 }}>
            Purchase to unlock full result
          </div>
        </div>
      )}
    </main>
  );
}
