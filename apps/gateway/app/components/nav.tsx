"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "./theme-toggle";

interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
}

const links = [
  { href: "/", label: "home" },
  { href: "/explore", label: "explore" },
  { href: "/swap", label: "swap" },
  { href: "/wallet", label: "wallet" },
  { href: "/activity", label: "activity" },
];

const short = (s: string) =>
  s.length <= 12 ? s : `${s.slice(0, 6)}...${s.slice(-4)}`;

export default function Nav() {
  const path = usePathname();
  const [account, setAccount] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((accs) => {
      const list = accs as string[];
      if (list?.[0]) setAccount(list[0]);
    });
    eth.on?.("accountsChanged", (accs) => {
      const list = accs as string[];
      setAccount(list?.[0] ?? null);
    });
  }, []);

  const connect = async () => {
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) { alert("Install MetaMask or a compatible wallet."); return; }
    const accs = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    setAccount(accs[0] ?? null);
  };

  const disconnect = () => setAccount(null);

  useEffect(() => {
    (window as unknown as { __wall402Account?: string | null }).__wall402Account = account;
    window.dispatchEvent(new CustomEvent("wall402-account", { detail: account }));
  }, [account]);

  return (
    <>
      <nav style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Left: logo */}
        <a href="/" style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg)", textDecoration: "none", marginRight: 24, flexShrink: 0 }}>
          wall402<span style={{ color: "var(--muted)" }}>_</span>
        </a>

        {/* Desktop nav links */}
        <div className="nav-links" style={{ display: "flex", gap: 20, flex: 1 }}>
          {links.map((l) => {
            const active = path === l.href;
            return (
              <a key={l.href} href={l.href} style={{
                fontSize: 13, color: active ? "var(--fg)" : "var(--muted)",
                textDecoration: active ? "underline" : "none",
                textUnderlineOffset: "4px", textDecorationThickness: "1.5px",
                fontWeight: active ? 600 : 400,
              }}>
                {l.label}
              </a>
            );
          })}
        </div>

        {/* Right: theme + wallet */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle />
          {account ? (
            <>
              <div className="wallet-badge" style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 12px", borderRadius: 8,
                background: "var(--fg)", color: "var(--bg)",
                fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
                <span className="wallet-addr">{short(account)}</span>
              </div>
              <button onClick={disconnect} style={{
                background: "none", border: "1px solid var(--border)", borderRadius: 8,
                padding: "7px 10px", fontSize: 11, color: "var(--muted)", cursor: "pointer",
              }}>×</button>
            </>
          ) : (
            <button onClick={connect} className="connect-btn" style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8,
              background: "var(--fg)", color: "var(--bg)", border: "none",
              fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600, cursor: "pointer",
            }}>
              Connect
            </button>
          )}

          {/* Mobile hamburger */}
          <button className="mobile-menu-btn" onClick={() => setMenuOpen(!menuOpen)} style={{
            display: "none", background: "none", border: "1px solid var(--border)",
            borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "var(--fg)", fontSize: 16,
          }}>
            {menuOpen ? "×" : "☰"}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="mobile-menu" style={{
          display: "none", flexDirection: "column", gap: 0,
          borderBottom: "1px solid var(--border)", background: "var(--bg)",
        }}>
          {links.map((l) => {
            const active = path === l.href;
            return (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{
                padding: "12px 24px", fontSize: 14, textDecoration: "none",
                color: active ? "var(--fg)" : "var(--muted)",
                fontWeight: active ? 600 : 400,
                borderBottom: "1px solid var(--border)",
              }}>
                {l.label}
              </a>
            );
          })}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-links { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
          .mobile-menu { display: flex !important; }
          .wallet-addr { display: none; }
          .wallet-badge { padding: 7px 8px !important; }
          .connect-btn { font-size: 11px !important; padding: 7px 10px !important; }
        }
      `}</style>
    </>
  );
}
