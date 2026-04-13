"use client";

import { useEffect, useRef, useState } from "react";
import { BackgroundPaths } from "./components/ui/background-paths";

// ─── Install terminal ────────────────────────────────────

const INSTALL_CMD = "npm install -g @wall402/mcp-server";

function InstallTerminal() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const copy = () => {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 440, margin: "0 auto" }}>
      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ffbd2e" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#28c840" }} />
          </div>
          <button onClick={copy} style={{ background: "none", border: "none", fontSize: 10, color: copied ? "var(--accent)" : "var(--muted)", cursor: "pointer", padding: "2px 6px" }}>
            {copied ? "copied!" : "copy"}
          </button>
        </div>
        <div style={{ padding: "14px 18px", fontFamily: "var(--mono)", fontSize: 13, color: "var(--fg-dim)" }}>
          <span style={{ color: "var(--muted)", userSelect: "none" }}>$ </span>
          npm install -g <span style={{ color: "var(--fg)" }}>@wall402/mcp-server</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────

type Stats = { totalCalls: number; totalVolume: Record<string, string> };

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [epCount, setEpCount] = useState(0);
  useEffect(() => {
    Promise.all([
      fetch("/api/audit").then((r) => r.json()),
      fetch("/api/endpoints").then((r) => r.json()),
    ]).then(([audit, eps]) => {
      setStats(audit.stats);
      setEpCount(eps.endpoints?.length ?? 0);
    });
  }, []);

  const vol = stats ? (Number(stats.totalVolume?.USDG ?? 0) / 1e6).toFixed(2) : "—";

  return (
    <main>
      {/* ── Hero (dark banner like lusty) ─────────────── */}
      <section
        className="fade-in"
        style={{
          margin: "0 auto",
          maxWidth: 1200,
          padding: "0 24px",
          marginTop: 32,
        }}
      >
        <BackgroundPaths>
          <div
            style={{
              background: "#1a1714",
              borderRadius: 16,
              padding: "56px 48px 48px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 32,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Background pattern */}
            <div style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='32' height='64' viewBox='0 0 32 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 28h20V16h-4v8H4V4h28v28h-4V8H8v12h4v-8h12v20H0v-4zm12 8h20v4H16v24H0v-4h12V36zm16 12h-4v12h8v4H20V44h12v12h-4v-8zM0 36h8v20H0v-4h4V40H0v-4z' fill='%23ffffff' fill-opacity='0.03' fill-rule='evenodd'/%3E%3C/svg%3E")`,
              pointerEvents: "none",
            }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 12, color: "#8a857c", fontFamily: "var(--mono)", marginBottom: 12 }}>~/wall402</div>
              <h1 style={{ fontSize: 48, margin: 0, letterSpacing: "-0.04em", lineHeight: 1.05, fontWeight: 800, color: "#f0ece4" }}>
                Paywall any API.
              </h1>
              <p style={{ fontSize: 14, marginTop: 14, color: "#8a857c", lineHeight: 1.6, maxWidth: 340 }}>
                AI agents pay per call. Zero gas settlement on X Layer. Any token accepted.
              </p>
              <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
                <a href="/explore" style={{ padding: "9px 20px", borderRadius: 8, background: "#f0ece4", color: "#1a1714", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  Explore Products →
                </a>
                <a href="/wallet" style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #33302a", color: "#8a857c", fontSize: 13, textDecoration: "none" }}>
                  Wallet Lookup
                </a>
              </div>
            </div>

            <div style={{ position: "relative", textAlign: "right" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 36, fontWeight: 700, color: "#f0ece4", letterSpacing: "-0.03em" }}>
                {vol} <span style={{ fontSize: 16, color: "#8a857c" }}>USDG</span>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#4ade80", marginTop: 4 }}>
                {stats?.totalCalls ?? 0} payments settled
              </div>
            </div>
          </div>
        </BackgroundPaths>
      </section>

      {/* (stats bar removed) */}

      {/* ── Products table (lusty assets style) ────── */}
      <section style={{ maxWidth: 1200, margin: "32px auto 0", padding: "0 24px" }}>
        <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 12 }}>~/products</div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 120px", padding: "10px 20px", borderBottom: "1px solid var(--border)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)" }}>
            <span>Product</span>
            <span>Type</span>
            <span>Price</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>
          {/* Rows */}
          {[
            { name: "AI Trading Signal", kind: "signal", price: "0.01 USDG", href: "/explore/ai-signal" },
            { name: "Token Security Scan", kind: "security", price: "0.02 USDG", href: "/explore/security-scan" },
            { name: "Market Overview", kind: "market", price: "0.015 USDG", href: "/explore/market-overview" },
            { name: "Wallet Intelligence", kind: "wallet", price: "0.025 USDG", href: "/explore/wallet-intel" },
            { name: "Smart Money Alerts", kind: "alpha", price: "0.015 USDG", href: "/explore/smart-money" },
          ].map((p) => (
            <a key={p.name} href={p.href} style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 120px", padding: "14px 20px", borderBottom: "1px solid var(--border)", alignItems: "center", fontSize: 13, textDecoration: "none", color: "inherit", transition: "background 0.15s" }}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{p.kind}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p.price}</span>
              <span style={{ textAlign: "right" }}>
                <span className="btn" style={{ fontSize: 11, padding: "5px 12px" }}>View →</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ── Quick links row ───────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "24px auto 0", padding: "0 24px", display: "flex", gap: 12 }}>
        <a href="/wallet" className="btn" style={{ flex: 1, justifyContent: "center", padding: "12px" }}>
          Wallet Explorer
        </a>
        <a href="/activity" className="btn" style={{ flex: 1, justifyContent: "center", padding: "12px" }}>
          Activity Feed
        </a>
      </section>

      {/* ── How it works (visual schema) ─────────────── */}
      <section style={{ maxWidth: 1200, margin: "56px auto 0", padding: "0 24px" }}>
        <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 16 }}>~/how-it-works</div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {/* Flow diagram */}
          <div style={{ padding: "32px 28px 28px", display: "flex", alignItems: "flex-start", gap: 0 }}>
            {[
              { step: "1", title: "Request", desc: "Agent calls a paywalled API endpoint", mono: "GET /api/data" },
              { step: "2", title: "Challenge", desc: "Gateway returns HTTP 402 with payment terms", mono: "402 Payment Required" },
              { step: "3", title: "Payment", desc: "Agent signs EIP-3009 transfer authorization", mono: "signTypedData_v4()" },
              { step: "4", title: "Settlement", desc: "USDG transferred on X Layer, response delivered", mono: "transferWithAuth()" },
            ].map((s, i) => (
              <div key={s.step} style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 0 }}>
                {i > 0 && (
                  <div style={{ width: 32, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 14, flexShrink: 0, color: "var(--border)" }}>
                    <svg width="20" height="12" viewBox="0 0 20 12"><path d="M0 6h16M12 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>{s.step}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>{s.desc}</div>
                  <code style={{ fontSize: 10, padding: "3px 8px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--fg-dim)" }}>{s.mono}</code>
                </div>
              </div>
            ))}
          </div>

          {/* Tech stack row */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "14px 28px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
            {[
              { label: "Signing", items: ["TEE Agentic Wallet", "EIP-3009 / EIP-712"] },
              { label: "Settlement", items: ["X Layer (chain 196)", "Zero gas USDG", "Uniswap V3/V4 auto-swap"] },
              { label: "Intelligence", items: ["7 MCP tools", "AI analysis", "Token security scan"] },
            ].map((col, i) => (
              <div key={col.label} style={{ padding: "0 12px", borderLeft: i > 0 ? "1px solid var(--border)" : undefined }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>{col.label}</div>
                {col.items.map((item) => (
                  <div key={item} style={{ fontSize: 12, color: "var(--fg-dim)", lineHeight: 1.8 }}>{item}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MCP Install ───────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "48px auto 0", padding: "0 24px 80px" }}>
        <div className="section-label">For AI agents</div>
        <InstallTerminal />
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 11, marginTop: 10 }}>
          Works with Claude Desktop, Cursor, and any MCP client.
        </p>
      </section>

    </main>
  );
}
