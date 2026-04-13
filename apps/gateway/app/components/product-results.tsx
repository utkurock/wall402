"use client";

/**
 * Visual renderers for each product type.
 * Used both as locked preview (explore page) and full result (after purchase).
 */

// ─── AI Trading Signal ──────────────────────────────────

export function SignalResult({ data, locked }: { data: Record<string, unknown>; locked?: boolean }) {
  const signal = String(data.signal ?? "—");
  const isLong = signal === "LONG";
  const asset = String(data.asset ?? "");
  const price = Number(data.price ?? 0);
  const entry = Number(data.entry ?? 0);
  const target = Number(data.target ?? 0);
  const stop = Number(data.stop ?? 0);
  const ind = (data.indicators ?? {}) as Record<string, unknown>;
  const rsi = Number(ind.rsi14 ?? 0);
  const macd = Number(ind.macd ?? 0);
  const macdHist = Number(ind.macdHistogram ?? 0);
  const macdSig = String(ind.macdSignal ?? "neutral");
  const ma20 = Number(ind.ma20 ?? 0);
  const volTrend = String(ind.volumeTrend ?? "—");
  const ai = String(data.aiAnalysis ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, filter: locked ? "blur(4px)" : undefined, userSelect: locked ? "none" : undefined }}>
      {/* Signal header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          padding: "6px 16px", borderRadius: 8, fontWeight: 700, fontSize: 14,
          background: isLong ? "#dcfce7" : "#fee2e2",
          color: isLong ? "#166534" : "#991b1b",
        }}>
          {signal}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)" }}>{asset}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Price levels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Entry", value: entry, color: "var(--fg)" },
          { label: "Target", value: target, color: "#166534" },
          { label: "Stop Loss", value: stop, color: "#991b1b" },
        ].map((p) => (
          <div key={p.label} style={{ padding: "12px 14px", background: "var(--panel-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 4 }}>{p.label}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: p.color }}>${p.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
          </div>
        ))}
      </div>

      {/* RSI bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
          <span>RSI(14)</span>
          <span style={{ fontFamily: "var(--mono)", color: rsi > 70 ? "#991b1b" : rsi < 30 ? "#166534" : "var(--fg)" }}>{rsi}</span>
        </div>
        <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", left: "30%", width: "1px", height: "100%", background: "var(--muted)", opacity: 0.3 }} />
          <div style={{ position: "absolute", left: "70%", width: "1px", height: "100%", background: "var(--muted)", opacity: 0.3 }} />
          <div style={{ height: "100%", width: `${Math.min(100, rsi)}%`, background: rsi > 70 ? "#ef4444" : rsi < 30 ? "#22c55e" : "var(--fg)", borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
          <span>oversold</span><span>overbought</span>
        </div>
      </div>

      {/* Extra indicators */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <div style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 3 }}>MACD</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: macdSig === "bullish" ? "#166534" : "#991b1b" }}>
            {macd.toFixed(4)}
          </div>
          <div style={{ fontSize: 10, color: macdHist > 0 ? "#166534" : "#991b1b", fontFamily: "var(--mono)" }}>
            {macdHist > 0 ? "+" : ""}{macdHist.toFixed(4)} · {macdSig}
          </div>
        </div>
        <div style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 3 }}>MA(20)</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600 }}>${ma20.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
          <div style={{ fontSize: 10, color: price > ma20 ? "#166534" : "#991b1b", fontFamily: "var(--mono)" }}>
            price {price > ma20 ? "above" : "below"}
          </div>
        </div>
        <div style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 3 }}>Volume</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600 }}>{volTrend}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>trend</div>
        </div>
      </div>

      {/* AI commentary */}
      {ai && (
        <div style={{ padding: "12px 14px", background: "var(--panel-2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, lineHeight: 1.6, color: "var(--fg-dim)", fontStyle: "italic" }}>
          {ai}
        </div>
      )}
    </div>
  );
}

// ─── Token Security Scan ────────────────────────────────

export function SecurityResult({ data, locked }: { data: Record<string, unknown>; locked?: boolean }) {
  const scan = (Array.isArray(data.scan) ? data.scan : []) as Record<string, unknown>[];
  const count = Number(data.tokensScanned ?? scan.length);
  const clean = scan.filter(t => !t.isHoneypot && !t.isRiskToken).length;
  const risky = scan.length - clean;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, filter: locked ? "blur(4px)" : undefined, userSelect: locked ? "none" : undefined }}>
      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <div style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 3 }}>Scanned</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600 }}>{count}</div>
        </div>
        <div style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 3 }}>Clean</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: "#166534" }}>{clean}</div>
        </div>
        <div style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 3 }}>Risky</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: risky > 0 ? "#991b1b" : "var(--fg-dim)" }}>{risky}</div>
        </div>
      </div>

      {/* Per-token detailed results */}
      {scan.map((t, i) => {
        const isRisky = t.isHoneypot || t.isRiskToken;
        const checks = [
          { name: "Honeypot", pass: !t.isHoneypot, detail: t.isHoneypot ? "Cannot sell" : "Sellable" },
          { name: "Buy Tax", pass: parseFloat(String(t.buyTaxes ?? "0")) < 5, detail: String(t.buyTaxes ?? "0") + "%" },
          { name: "Sell Tax", pass: parseFloat(String(t.sellTaxes ?? "0")) < 5, detail: String(t.sellTaxes ?? "0") + "%" },
          { name: "Mintable", pass: !t.isMintable, detail: t.isMintable ? "Yes" : "No" },
          { name: "Counterfeit", pass: !t.isCounterfeit, detail: t.isCounterfeit ? "Detected" : "None" },
          { name: "Airdrop Scam", pass: !t.isAirdropScam, detail: t.isAirdropScam ? "Detected" : "None" },
          { name: "Fake Liquidity", pass: !t.isFakeLiquidity, detail: t.isFakeLiquidity ? "Detected" : "None" },
          { name: "LP Removal", pass: !t.isLiquidityRemoval, detail: t.isLiquidityRemoval ? "Risk" : "Safe" },
          { name: "Low Liquidity", pass: !t.isLowLiquidity, detail: t.isLowLiquidity ? "Warning" : "OK" },
          { name: "Blocking History", pass: !t.isHasBlockingHis, detail: t.isHasBlockingHis ? "Detected" : "None" },
        ];
        const passCount = checks.filter(c => c.pass).length;

        return (
          <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {/* Token header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600 }}>{String(t.tokenAddress ?? "").slice(0, 14)}...</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{passCount}/{checks.length} passed</span>
                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: isRisky ? "#fee2e2" : "#dcfce7", color: isRisky ? "#991b1b" : "#166534" }}>
                  {isRisky ? "RISK" : "SAFE"}
                </span>
              </div>
            </div>
            {/* Checks grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0 }}>
              {checks.map((c, ci) => (
                <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", fontSize: 12, borderBottom: ci < checks.length - 2 ? "1px solid var(--border)" : undefined, borderRight: ci % 2 === 0 ? "1px solid var(--border)" : undefined }}>
                  <span style={{ color: "var(--fg-dim)" }}>{c.name}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: c.pass ? "#166534" : "#991b1b" }}>
                    {c.pass ? "✓" : "✗"} {c.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Market Overview ────────────────────────────────────

export function MarketResult({ data, locked }: { data: Record<string, unknown>; locked?: boolean }) {
  const assets = (data.assets ?? {}) as Record<string, Record<string, unknown>>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, filter: locked ? "blur(4px)" : undefined, userSelect: locked ? "none" : undefined }}>
      {Object.entries(assets).map(([name, info]) => {
        const price = Number(info.price ?? 0);
        const rsi = Number(info.rsi14 ?? 0);
        const ma20 = Number(info.ma20 ?? 0);
        const change = info.change24h;
        const volTrend = String(info.volumeTrend ?? "—");
        const bias = String(info.bias ?? "neutral");
        const isUp = String(change).startsWith("+") || Number(change) > 0;
        const biasColor = bias === "oversold" ? "#166534" : bias === "overbought" ? "#991b1b" : "var(--fg-dim)";
        return (
          <div key={name} style={{ padding: "16px 18px", background: "var(--panel-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{name}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700 }}>
                ${price.toLocaleString("en-US", { maximumFractionDigits: price > 1000 ? 0 : 2 })}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {[
                { label: "RSI(14)", value: String(rsi), color: rsi > 70 ? "#991b1b" : rsi < 30 ? "#166534" : "var(--fg)" },
                { label: "MA(20)", value: ma20 > 0 ? "$" + ma20.toLocaleString("en-US", { maximumFractionDigits: ma20 > 1000 ? 0 : 2 }) : "—" },
                { label: "24h", value: change != null ? String(change) + "%" : "—", color: isUp ? "#166534" : "#991b1b" },
                { label: "Volume", value: volTrend },
                { label: "Bias", value: bias, color: biasColor },
              ].map((s) => (
                <div key={s.label}>
                  <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: s.color ?? "var(--fg-dim)" }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Wallet Intelligence ────────────────────────────────

export function WalletResult({ data, locked }: { data: Record<string, unknown>; locked?: boolean }) {
  const score = Number(data.trustScore ?? 0);
  const verdict = String(data.verdict ?? "");
  const stats = (data.stats ?? {}) as Record<string, unknown>;
  const ai = String(data.aiSummary ?? "");
  const security = (data.tokenSecurity ?? {}) as Record<string, unknown>;

  const scoreColor = score >= 80 ? "#166534" : score >= 60 ? "#65a30d" : score >= 40 ? "#ca8a04" : "#991b1b";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, filter: locked ? "blur(4px)" : undefined, userSelect: locked ? "none" : undefined }}>
      {/* Trust score */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ position: "relative", width: 80, height: 80 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="5" />
            <circle cx="40" cy="40" r="34" fill="none" stroke={scoreColor} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 214} 214`} transform="rotate(-90 40 40)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: scoreColor }}>
            {score}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, textTransform: "uppercase", color: scoreColor }}>{verdict}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 2 }}>
            {String(data.address ?? "").slice(0, 14)}...
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[
          { label: "Win Rate (OKX DEX)", value: String(stats.winRate ?? "0%") },
          { label: "OKX DEX Trades", value: String(stats.totalTransactions ?? 0) },
          { label: "PnL (OKX DEX)", value: "$" + Number(stats.realizedPnlUsd ?? 0).toLocaleString() },
        ].map((s) => (
          <div key={s.label} style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Security summary */}
      {security.totalScanned != null && (
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <span>{String(security.totalScanned)} tokens scanned</span>
          <span style={{ color: "#166534" }}>{String(security.clean ?? 0)} clean</span>
          {Number(security.riskyTokens ?? 0) > 0 && (
            <span style={{ color: "#991b1b" }}>{String(security.riskyTokens)} risky</span>
          )}
        </div>
      )}

      {/* AI */}
      {ai && (
        <div style={{ padding: "12px 14px", background: "var(--panel-2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, lineHeight: 1.6, color: "var(--fg-dim)", fontStyle: "italic" }}>
          {ai}
        </div>
      )}
    </div>
  );
}

// ─── Smart Money Alerts ─────────────────────────────────

export function SmartMoneyResult({ data, locked }: { data: Record<string, unknown>; locked?: boolean }) {
  const signals = (data.signals ?? {}) as Record<string, unknown>;
  const top = (signals.top ?? []) as Record<string, unknown>[];
  const trending = (data.trending ?? []) as Record<string, unknown>[];
  const ai = String(data.aiSummary ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, filter: locked ? "blur(4px)" : undefined, userSelect: locked ? "none" : undefined }}>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { label: "Signals", value: String(signals.total ?? 0) },
          { label: "Volume", value: "$" + Number(signals.totalVolumeUsd ?? 0).toLocaleString() },
          { label: "Buy pressure", value: String(signals.buyPressure ?? 0), color: "#166534" },
          { label: "Sell pressure", value: String(signals.sellPressure ?? 0), color: "#991b1b" },
        ].map((s) => (
          <div key={s.label} style={{ padding: "10px 12px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: s.color ?? "var(--fg)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Smart money signals */}
      {top.length > 0 && (
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>Smart money activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {top.slice(0, 6).map((s, i) => {
              const soldRatio = Number(s.soldRatio ?? 0);
              const isBuy = soldRatio < 50;
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: i < Math.min(top.length, 6) - 1 ? "1px solid var(--border)" : undefined, fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: isBuy ? "#dcfce7" : "#fee2e2", color: isBuy ? "#166534" : "#991b1b" }}>
                      {isBuy ? "BUY" : "SELL"}
                    </span>
                    <span style={{ fontWeight: 600 }}>{String(s.token)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)" }}>
                    <span>${Number(s.amountUsd ?? 0).toLocaleString()}</span>
                    <span>{Number(s.holders ?? 0).toLocaleString()} holders</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trending tokens */}
      {trending.length > 0 && (
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: 8 }}>Trending tokens</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {trending.slice(0, 6).map((t, i) => (
              <div key={i} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{String(t.symbol)}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                    ${Number(t.price ?? 0) > 1 ? Number(t.price).toFixed(2) : Number(t.price).toFixed(6)}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                  <div>vol ${(Number(t.volume ?? 0) / 1000).toFixed(0)}k</div>
                  <div>{Number(t.holders ?? 0).toLocaleString()} holders</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI summary */}
      {ai && (
        <div style={{ padding: "12px 14px", background: "var(--panel-2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, lineHeight: 1.6, color: "var(--fg-dim)", fontStyle: "italic" }}>
          {ai}
        </div>
      )}
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────

export function ProductResult({ kind, data, locked }: { kind?: string; data: Record<string, unknown>; locked?: boolean }) {
  switch (kind) {
    case "signal": return <SignalResult data={data} locked={locked} />;
    case "security": return <SecurityResult data={data} locked={locked} />;
    case "market": return <MarketResult data={data} locked={locked} />;
    case "wallet": return <WalletResult data={data} locked={locked} />;
    case "alpha": return <SmartMoneyResult data={data} locked={locked} />;
    default: return (
      <pre style={{ fontSize: 11, lineHeight: 1.5, margin: 0, overflow: "auto", maxHeight: 300, filter: locked ? "blur(4px)" : undefined }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
}
