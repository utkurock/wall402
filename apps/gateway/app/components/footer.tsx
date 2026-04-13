export default function Footer() {
  return (
    <footer style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "20px 40px",
      marginTop: "auto",
      borderTop: "1px solid var(--border)",
      fontSize: 13,
    }}>
      <span style={{ color: "var(--muted)" }}>
        <span style={{ fontWeight: 700, color: "var(--fg)" }}>wall402_</span>
        {" "}// x402 paywall on X Layer
      </span>
      <div style={{ display: "flex", gap: 24 }}>
        <a href="https://x.com/Utkurocks" target="_blank" rel="noreferrer" style={{ color: "var(--muted)", textDecoration: "none" }}>
          twitter
        </a>
        <a href="https://github.com/utkurock/wall402" target="_blank" rel="noreferrer" style={{ color: "var(--muted)", textDecoration: "none" }}>
          github
        </a>
      </div>
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
        X Layer mainnet
      </span>
    </footer>
  );
}
