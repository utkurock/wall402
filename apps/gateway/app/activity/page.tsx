"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ProductResult } from "../components/product-results";

type Receipt = {
  endpointId: string;
  endpointLabel: string;
  productKind?: string;
  txHash: string;
  payer: string;
  recipient: string;
  amount: string;
  token: string;
  network: "mainnet" | "testnet";
  settledAt: string;
  upstreamBody?: unknown;
  resultSummary?: string;
};

type AuditResponse = {
  stats: { totalCalls: number; totalVolume: Record<string, string> };
  receipts: Receipt[];
};

const short = (s: string, n = 6) =>
  s.length <= 2 * n + 2 ? s : `${s.slice(0, n + 2)}...${s.slice(-n)}`;

const fmtAmount = (amount: string, token: string) => {
  if (["USDG", "USDT", "USDC"].includes(token)) {
    const v = Number(amount) / 1e6;
    return `${v.toFixed(v >= 1 ? 2 : 4)} ${token}`;
  }
  return `${amount} ${token}`;
};

const explorer = (network: "mainnet" | "testnet", tx: string) =>
  network === "mainnet"
    ? `https://www.okx.com/web3/explorer/xlayer/tx/${tx}`
    : `https://www.okx.com/web3/explorer/xlayer-test/tx/${tx}`;

const timeAgo = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Minimal EIP-1193
interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export default function DashboardPage() {
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [account, setAccount] = useState<string | null>(null);
  const [showMine, setShowMine] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      setAudit(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const totalUsdg = audit?.stats.totalVolume?.USDG ?? "0";
  const totalUsdgDisplay = (Number(totalUsdg) / 1e6).toFixed(4);
  const receipts = audit?.receipts ?? [];
  const uniquePayers = new Set(receipts.map((r) => r.payer.toLowerCase())).size;

  // Product breakdown
  const byProduct = new Map<string, { count: number; usdg: number; kind?: string }>();
  for (const r of receipts) {
    const key = r.endpointLabel ?? "Unknown";
    const entry = byProduct.get(key) ?? { count: 0, usdg: 0, kind: r.productKind };
    entry.count++;
    entry.usdg += Number(r.amount) / 1e6;
    byProduct.set(key, entry);
  }

  // Wallet connect
  const connectWallet = async () => {
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    setAccount(accounts[0] ?? null);
  };

  // Filter
  const kinds = [...new Set(receipts.map((r) => r.productKind).filter(Boolean))];
  const afterMine = showMine && account
    ? receipts.filter((r) => r.payer.toLowerCase() === account.toLowerCase())
    : receipts;
  const filtered = filter === "all" ? afterMine : afterMine.filter((r) => r.productKind === filter);
  const myCount = account ? receipts.filter((r) => r.payer.toLowerCase() === account.toLowerCase()).length : 0;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Activity
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
            {showMine && account
              ? `Your transactions (${myCount})`
              : "All settlements on wall402"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {account ? (
            <>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-dim)" }}>
                {short(account, 4)}
              </span>
              <button
                className="btn"
                onClick={() => setShowMine(!showMine)}
                style={{
                  fontSize: 12,
                  background: showMine ? "var(--accent-subtle)" : undefined,
                  color: showMine ? "var(--accent)" : undefined,
                  borderColor: showMine ? "var(--accent-dim)" : undefined,
                }}
              >
                {showMine ? "Show all" : "My transactions"}
              </button>
            </>
          ) : (
            <button className="btn" onClick={connectWallet} style={{ fontSize: 12 }}>
              Connect to filter
            </button>
          )}
          <button className="btn" onClick={refresh} disabled={loading} style={{ fontSize: 12 }}>
            {loading ? "..." : "↻"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total settlements", value: String(audit?.stats.totalCalls ?? 0) },
          { label: "Volume", value: totalUsdgDisplay + " USDG" },
          { label: "Unique buyers", value: String(uniquePayers) },
          { label: "Products", value: String(byProduct.size) },
        ].map((s) => (
          <div key={s.label} className="panel" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 600 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Product breakdown */}
      {byProduct.size > 0 && (
        <div className="panel" style={{ marginBottom: 28 }}>
          <div className="panel-title">Revenue by product</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(byProduct.size, 4)}, 1fr)`, gap: 16 }}>
            {[...byProduct.entries()].sort((a, b) => b[1].usdg - a[1].usdg).map(([label, data]) => {
              const maxUsdg = Math.max(...[...byProduct.values()].map((d) => d.usdg)) || 1;
              return (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                      {data.kind && <span className="tag" style={{ fontSize: 9, marginTop: 4 }}>{data.kind}</span>}
                    </div>
                    <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{data.usdg.toFixed(4)}</div>
                      <div style={{ color: "var(--muted)", fontSize: 10 }}>{data.count} calls</div>
                    </div>
                  </div>
                  <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(data.usdg / maxUsdg) * 100}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.4s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter bar + transaction list */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="panel-title" style={{ margin: 0 }}>
            Transaction history
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="btn"
              onClick={() => setFilter("all")}
              style={{ fontSize: 11, padding: "4px 10px", background: filter === "all" ? "var(--accent-subtle)" : undefined, color: filter === "all" ? "var(--accent)" : undefined }}
            >
              All
            </button>
            {kinds.map((k) => (
              <button
                key={k}
                className="btn"
                onClick={() => setFilter(k!)}
                style={{ fontSize: 11, padding: "4px 10px", background: filter === k ? "var(--accent-subtle)" : undefined, color: filter === k ? "var(--accent)" : undefined }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>
            <div style={{ fontSize: 14 }}>No transactions yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Purchase a product on <a href="/explore">Explore</a> to see activity here.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {filtered.slice(0, 30).map((r) => {
              const isOpen = expanded === r.txHash;
              return (
                <Fragment key={r.txHash}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : r.txHash)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 1.2fr auto auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {/* Time */}
                    <div style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 11 }}>
                      {timeAgo(r.settledAt)}
                    </div>

                    {/* Product */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{r.endpointLabel}</strong>
                      {r.productKind && (
                        <span className="tag" style={{ fontSize: 9, padding: "1px 6px" }}>{r.productKind}</span>
                      )}
                    </div>

                    {/* Result */}
                    <div style={{ color: "var(--fg-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.resultSummary ?? "—"}
                    </div>

                    {/* Amount */}
                    <div style={{ fontFamily: "var(--mono)", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {fmtAmount(r.amount, r.token)}
                    </div>

                    {/* TX link */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <a
                        href={explorer(r.network, r.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontFamily: "var(--mono)", fontSize: 11 }}
                      >
                        {short(r.txHash, 4)} ↗
                      </a>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isOpen && (
                    <div className="fade-in" style={{ padding: "12px 0 16px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12, fontSize: 12 }}>
                        <div>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 4 }}>Payer</div>
                          <div style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{r.payer}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 4 }}>Recipient</div>
                          <div style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{r.recipient}</div>
                        </div>
                      </div>
                      {r.upstreamBody !== undefined && r.upstreamBody !== null && (
                        <div>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>Result delivered</div>
                          <ProductResult
                            kind={r.productKind}
                            data={r.upstreamBody as Record<string, unknown>}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          main { padding: 20px 16px 60px !important; max-width: 100% !important; }
        }
      `}</style>
    </main>
  );
}
