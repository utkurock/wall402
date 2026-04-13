"use client";

import { useCallback, useEffect, useState } from "react";
import { namehash } from "viem/ens";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { ProductResult } from "../components/product-results";

// ENS resolver via viem
async function resolveENS(ensName: string): Promise<string | null> {
  try {
    const client = createPublicClient({ chain: mainnet, transport: http("https://eth.llamarpc.com") });
    const address = await client.getEnsAddress({ name: ensName });
    return address ?? null;
  } catch {
    return null;
  }
}

interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function browserNonce(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "0x" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

type FreeReport = {
  address: string;
  chain: string;
  tier: "free";
  balance: {
    native: number;
    symbol: string;
    usd: number;
  };
  dexStats: {
    totalTransactions: number;
    winRate: string;
    realizedPnlUsd: number;
    buyVolume: number;
    sellVolume: number;
  };
  recentPnl: unknown;
  upgrade: { hint: string; includes: string[] };
  generatedAt: string;
};

type PaidReport = {
  tier: "paid";
  address: string;
  label?: string;
  chain: string;
  trustScore: number;
  verdict: string;
  stats: {
    winRate: string;
    totalTransactions: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd?: number;
    buyVolume: number;
    sellVolume: number;
  };
  tokenSecurity: { totalScanned: number; riskyTokens: number; clean: number };
  holdTimes?: { token: string; avgHoldHours: number; trades: number }[];
  tradeCount: number;
  aiSummary: string;
  generatedAt: string;
};

const short = (s: string, n = 8) =>
  s.length <= 2 * n + 2 ? s : `${s.slice(0, n + 2)}...${s.slice(-n)}`;

const fmtUsd = (n: number) => {
  if (Math.abs(n) >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
};

const fmtHours = (h: number) => {
  if (h < 1) return "<1h";
  if (h < 24) return h + "h";
  if (h < 168) return Math.round(h / 24) + "d";
  return Math.round(h / 168) + "w";
};

type Endpoint = { id: string; label: string; priceAmount: string; priceToken: string };

export default function WalletPage() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [loading, setLoading] = useState(false);
  const [freeData, setFreeData] = useState<FreeReport | null>(null);
  const [paidData, setPaidData] = useState<PaidReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null); // ENS name or null
  const [isDemo, setIsDemo] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [walletEp, setWalletEp] = useState<Endpoint | null>(null);
  const [buying, setBuying] = useState(false);

  // Listen for global wallet
  useEffect(() => {
    const w = window as unknown as { __wall402Account?: string | null };
    if (w.__wall402Account) setAccount(w.__wall402Account);
    const handler = (e: Event) => setAccount((e as CustomEvent).detail as string | null);
    window.addEventListener("wall402-account", handler);
    return () => window.removeEventListener("wall402-account", handler);
  }, []);

  // Load wallet intel endpoint
  const loadEp = useCallback(async () => {
    const res = await fetch("/api/endpoints");
    const { endpoints } = await res.json();
    setWalletEp(endpoints?.find((e: Endpoint) => e.label === "Wallet Intelligence") ?? null);
  }, []);
  useEffect(() => { loadEp(); }, [loadEp]);

  // Buy full intelligence in-page
  const buyIntel = async () => {
    if (!account || !walletEp || !address) return;
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    setBuying(true);
    try { const cid = await eth.request({ method: "eth_chainId" }) as string; if (parseInt(cid,16)!==196) { try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xc4" }] }); } catch(e:unknown) { if ((e as {code?:number})?.code===4902) { await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xc4", chainName: "X Layer", rpcUrls: ["https://rpc.xlayer.tech"], nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"] }] }); } else throw e; } } } catch { setError("Please switch to X Layer"); setBuying(false); return; }
    const qs = `?q=${encodeURIComponent(address)}`;
    try {
      const challengeRes = await fetch(`/api/paywall/${walletEp.id}${qs}`);
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
      const replay = await fetch(`/api/paywall/${walletEp.id}${qs}`, { headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify({ x402Version: 2, resource: challenge.resource, accepted, payload: { signature: sig, authorization: { from: account, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(now + 300), nonce } } })) } });
      if (replay.ok) {
        const body = await replay.json();
        setPaidData(body as PaidReport);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBuying(false);
    }
  };

  const lookup = async (overrideAddr?: string) => {
    const rawInput = overrideAddr ?? address;
    if (!rawInput) { setError("Enter an address or ENS name"); return; }

    setLoading(true);
    setError(null);
    setFreeData(null);
    setPaidData(null);
    setDisplayName(rawInput.endsWith(".eth") ? rawInput : null);
    setIsDemo(!!overrideAddr);

    let resolved = rawInput;
    // ENS resolution via viem
    if (rawInput.endsWith(".eth")) {
      const addr = await resolveENS(rawInput);
      if (!addr) { setError("ENS name not found"); setLoading(false); return; }
      resolved = addr;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(resolved)) {
      setError("Enter a valid 0x address or .eth name"); setLoading(false); return;
    }

    try {
      const res = await fetch(`/api/wallet/${resolved}?chain=${chain}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFreeData(data as FreeReport);
      // Keep ENS name in input if that's what was typed
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load vitalik.eth on first visit
  useEffect(() => {
    if (!freeData && !loading) {
      setAddress("vitalik.eth");
      setChain("ethereum");
      lookup("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trustColor = (score: number) =>
    score >= 80 ? "#4ade80" : score >= 60 ? "#a3e635" : score >= 40 ? "var(--accent)" : score >= 20 ? "#f59e0b" : "#ef4444";

  const pnlColor = (v: number) => (v > 0 ? "#4ade80" : v < 0 ? "#ef4444" : "var(--fg-dim)");

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" }}>
      {/* Header */}
      <div className="fade-in" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, margin: 0, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Wallet Explorer
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 6 }}>
          Free on-chain wallet analysis. Search any address or ENS name — try editing the example below.
        </p>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        <input
          className="input"
          placeholder="0x... or vitalik.eth"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          style={{ flex: 1 }}
        />
        <select
          className="input"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          style={{ width: 140 }}
        >
          <option value="ethereum">Ethereum</option>
          <option value="xlayer">X Layer</option>
          <option value="base">Base</option>
          <option value="arbitrum">Arbitrum</option>
          <option value="polygon">Polygon</option>
          <option value="bsc">BSC</option>
        </select>
        <button className="btn btn-primary" onClick={() => lookup()} disabled={loading}>
          {loading ? <><span className="spinner" style={{ marginRight: 6 }} />analyzing...</> : "Analyze"}
        </button>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {/* Free Report */}
      {freeData && (
        <div className="fade-in">
          {/* Address header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "14px 14px 0 0",
              borderBottom: "none",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {displayName ?? short(freeData.address, 10)}
              </div>
              {displayName && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {short(freeData.address, 8)}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                {freeData.chain} network
              </div>
            </div>
            <span className="tag">{isDemo ? "DEMO" : "FREE"}</span>
          </div>

          {/* Balance hero */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderTop: "none",
              padding: "24px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: 6 }}>Balance</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700 }}>
                {freeData.balance.native >= 1
                  ? freeData.balance.native.toLocaleString("en-US", { maximumFractionDigits: 4 })
                  : freeData.balance.native.toFixed(6)
                }
                <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 8 }}>{freeData.balance.symbol}</span>
              </div>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 20, color: "var(--fg-dim)" }}>
              ≈ {freeData.balance.usd >= 1000
                ? "$" + freeData.balance.usd.toLocaleString("en-US", { maximumFractionDigits: 0 })
                : fmtUsd(freeData.balance.usd)
              }
            </div>
          </div>

          {/* Bottom close */}
          <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "12px 20px", fontSize: 11, color: "var(--muted)" }}>
            Balance via {freeData.chain} RPC · Trading data from OKX DEX aggregator
          </div>

          {/* Upgrade CTA */}
          <div
            style={{
              marginTop: 20,
              padding: "20px 24px",
              background: "var(--accent-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                Unlock full intelligence
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {freeData.upgrade.includes.map((item) => (
                  <span
                    key={item}
                    style={{
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: 6,
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      color: "var(--fg-dim)",
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" disabled={!account || buying} onClick={buyIntel} style={{ flexShrink: 0, padding: "10px 20px" }}>
              {buying ? (<><span className="spinner" style={{ marginRight: 6 }} />Analyzing...</>) : !account ? "Connect wallet" : "0.025 USDG"}
            </button>
          </div>
        </div>
      )}

      {/* Paid Report — shown inline after purchase */}
      {paidData && (
        <div className="panel fade-in" style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 12 }}>
            Full intelligence report
          </div>
          <ProductResult kind="wallet" data={paidData as unknown as Record<string, unknown>} />
        </div>
      )}

      {/* Empty state */}
      {!freeData && !loading && !error && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 40, marginBottom: 12, opacity: 0.15, fontWeight: 700 }}>0x</div>
          <div style={{ fontSize: 14 }}>Enter any EVM wallet address to get started</div>
          <div style={{ fontSize: 12, marginTop: 6, color: "var(--muted)" }}>Supports Ethereum, X Layer, Base, Arbitrum, Polygon, BSC</div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          main { padding: 20px 16px 60px !important; max-width: 100% !important; }
          main input, main select { font-size: 14px !important; }
        }
      `}</style>
    </main>
  );
}
