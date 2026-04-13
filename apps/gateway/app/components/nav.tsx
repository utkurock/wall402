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
    <nav style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "20px 40px",
      borderBottom: "1px solid var(--border)",
    }}>
      {/* Left: logo */}
      <a href="/" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--fg)", textDecoration: "none", marginRight: 32 }}>
        wall402<span style={{ color: "var(--muted)" }}>_</span>
      </a>

      {/* Center: nav links */}
      <div style={{ display: "flex", gap: 24, flex: 1 }}>
        {links.map((l) => {
          const active = path === l.href;
          return (
            <a key={l.href} href={l.href} style={{
              fontSize: 14,
              color: active ? "var(--fg)" : "var(--muted)",
              textDecoration: active ? "underline" : "none",
              textUnderlineOffset: "4px",
              textDecorationThickness: "1.5px",
              fontWeight: active ? 600 : 400,
            }}>
              {l.label}
            </a>
          );
        })}
      </div>

      {/* Right: theme + wallet */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ThemeToggle />
        {account ? (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 10,
              background: "var(--fg)", color: "var(--bg)",
              fontSize: 13, fontFamily: "var(--mono)", fontWeight: 600,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80" }} />
              {short(account)}
            </div>
            <button onClick={disconnect} style={{
              background: "none", border: "1px solid var(--border)", borderRadius: 8,
              padding: "8px 10px", fontSize: 12, color: "var(--muted)", cursor: "pointer",
            }}>×</button>
          </>
        ) : (
          <button onClick={connect} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 10,
            background: "var(--fg)", color: "var(--bg)", border: "none",
            fontSize: 13, fontFamily: "var(--mono)", fontWeight: 600, cursor: "pointer",
          }}>
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}
