export default function Footer() {
  return (
    <>
      <footer className="site-footer" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 24px",
        marginTop: "auto",
        borderTop: "1px solid var(--border)",
        fontSize: 13,
      }}>
        <span style={{ color: "var(--muted)" }}>
          <span style={{ fontWeight: 700, color: "var(--fg)" }}>wall402_</span>
          {" "}// x402 paywall on X Layer
        </span>
        <div className="footer-links" style={{ display: "flex", gap: 20 }}>
          <a href="https://x.com/Utkurocks" target="_blank" rel="noreferrer" style={{ color: "var(--muted)", textDecoration: "none" }}>twitter</a>
          <a href="https://github.com/utkurock/wall402" target="_blank" rel="noreferrer" style={{ color: "var(--muted)", textDecoration: "none" }}>github</a>
          <a href="https://web3.okx.com/en/dex-swap/bridge" target="_blank" rel="noreferrer" style={{ color: "var(--muted)", textDecoration: "none" }}>bridge</a>
          <a href="https://www.okx.com/web3/explorer/xlayer" target="_blank" rel="noreferrer" style={{ color: "var(--muted)", textDecoration: "none" }}>scan</a>
        </div>
        <span className="footer-network" style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
          X Layer mainnet
        </span>
      </footer>
      <style>{`
        @media (max-width: 768px) {
          .site-footer { flex-direction: column !important; gap: 8px !important; text-align: center; padding: 16px 20px !important; }
          .footer-links { gap: 16px !important; }
          .footer-network { font-size: 10px !important; }
        }
      `}</style>
    </>
  );
}
