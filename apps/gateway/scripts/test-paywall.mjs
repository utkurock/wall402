// wall402 — narrated end-to-end demo scenario.
//
// Tells the full x402-over-X-Layer story in one terminal run:
//   1. Discover paywalled endpoints       → GET /api/endpoints
//   2. Fetch the 402 challenge              → GET /api/paywall/<id>
//   3. Sign EIP-3009 transferWithAuthorization (throwaway key)
//   4. Replay with PAYMENT-SIGNATURE        → gateway verifies + settles
//   5. Inspect the audit log                → GET /api/audit
//
// Usage:
//   pnpm demo                                # from repo root
//   pnpm --filter @wall402/gateway test:e2e  # inside the gateway package
//
// Requires the gateway running on http://localhost:3402.

import crypto from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:3402";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  mag: (s) => `\x1b[35m${s}\x1b[0m`,
};

const step = (n, title) =>
  console.log(`\n${c.bold(c.cyan(`▸ step ${n}`))}  ${c.bold(title)}`);
const kv = (k, v) => console.log(`  ${c.dim(k.padEnd(12))} ${v}`);
const div = () => console.log(c.dim("  " + "─".repeat(60)));

console.log(c.bold(c.mag("\n  wall402 — end-to-end demo\n")));
console.log(c.dim(`  gateway: ${GATEWAY}`));

// ── 1. Discover endpoint ──────────────────────────────────
step(1, "discover paywalled endpoints");
const listRes = await fetch(`${GATEWAY}/api/endpoints`);
if (!listRes.ok) {
  console.error(c.red(`  ✗ gateway not reachable (${listRes.status})`));
  process.exit(1);
}
const { endpoints } = await listRes.json();
const ep = endpoints[0];
if (!ep) {
  console.error(c.red("  ✗ no endpoints registered"));
  process.exit(1);
}
const paywallUrl = `${GATEWAY}/api/paywall/${ep.id}`;
kv("endpoint", ep.label);
kv("url", paywallUrl);
kv("price", `${Number(ep.priceAmount) / 1e6} ${ep.priceToken}`);
kv("creator", ep.creatorWallet);
kv("network", ep.network === "mainnet" ? "X Layer mainnet (196)" : "X Layer testnet");

// ── 2. Trigger 402 challenge ──────────────────────────────
step(2, "fetch resource without payment → expect HTTP 402");
const challengeRes = await fetch(paywallUrl);
kv("status", challengeRes.status === 402 ? c.yellow("402 Payment Required ✓") : c.red(challengeRes.status));
if (challengeRes.status !== 402) process.exit(1);

const header = challengeRes.headers.get("payment-required");
if (!header) {
  console.error(c.red("  ✗ no PAYMENT-REQUIRED header"));
  process.exit(1);
}
const challenge = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
const accepted = challenge.accepts.find((a) => a.scheme === "exact");
if (!accepted) {
  console.error(c.red("  ✗ no exact-scheme accepts entry"));
  process.exit(1);
}
kv("scheme", `${accepted.scheme} on ${accepted.network}`);
kv("asset", accepted.asset);
kv("eip-712", `${accepted.extra?.name} v${accepted.extra?.version}`);

// ── 3. Generate throwaway test account ────────────────────
step(3, "sign EIP-3009 transferWithAuthorization");
const pk = "0x" + crypto.randomBytes(32).toString("hex");
const account = privateKeyToAccount(pk);
kv("payer", account.address + c.dim("  (throwaway demo key)"));

const now = Math.floor(Date.now() / 1000);
const nonce = "0x" + crypto.randomBytes(32).toString("hex");

const authorization = {
  from: account.address,
  to: accepted.payTo,
  value: accepted.amount,
  validAfter: "0",
  validBefore: String(now + accepted.maxTimeoutSeconds),
  nonce,
};

const signature = await account.signTypedData({
  domain: {
    name: accepted.extra.name,
    version: accepted.extra.version,
    chainId: Number(accepted.network.split(":")[1]),
    verifyingContract: accepted.asset,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: account.address,
    to: accepted.payTo,
    value: BigInt(accepted.amount),
    validAfter: 0n,
    validBefore: BigInt(now + accepted.maxTimeoutSeconds),
    nonce,
  },
});
kv("sig", signature.slice(0, 24) + "…");
kv("nonce", nonce.slice(0, 24) + "…");

// ── 4. Assemble + replay ──────────────────────────────────
step(4, "replay request with PAYMENT-SIGNATURE header");
const paymentPayload = {
  x402Version: 2,
  resource: challenge.resource,
  accepted,
  payload: { signature, authorization },
};
const replayHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

const replay = await fetch(paywallUrl, {
  headers: { "PAYMENT-SIGNATURE": replayHeader },
});
kv(
  "status",
  replay.ok
    ? c.green(`${replay.status} OK ✓`)
    : c.red(`${replay.status} ${replay.statusText}`),
);

const paymentResp = replay.headers.get("payment-response");
if (paymentResp) {
  const r = JSON.parse(paymentResp);
  kv("tx hash", r.txHash);
  kv("mock", r.mock ? c.yellow("true  (dev mode)") : c.green("false (live)"));
  kv("explorer", c.cyan(r.explorerUrl));
}
const upstream = await replay.json().catch(() => replay.text());
div();
console.log(c.dim("  upstream body:"));
console.log(
  "  " +
    JSON.stringify(upstream, null, 2)
      .split("\n")
      .join("\n  "),
);

// ── 5. Audit log ──────────────────────────────────────────
step(5, "inspect settlement audit log");
const audit = await (await fetch(`${GATEWAY}/api/audit`)).json();
kv("total calls", audit.stats.totalCalls);
kv("total vol", `${Number(audit.stats.totalVolume?.USDG ?? 0) / 1e6} USDG`);
kv("receipts", `${audit.receipts.length} stored`);
if (audit.receipts[0]) {
  const r = audit.receipts[0];
  div();
  console.log(c.dim("  latest receipt:"));
  kv("  payer", r.payer);
  kv("  amount", `${Number(r.amount) / 1e6} ${r.token}`);
  kv("  tx", r.txHash);
  kv("  at", r.settledAt);
}

console.log("\n" + c.green(c.bold("  ✅ end-to-end demo complete")));
console.log(
  c.dim(`     open ${GATEWAY}/activity to see the receipt in the live UI.\n`),
);
