#!/usr/bin/env node
/**
 * wall402 MCP server (stdio).
 *
 * Exposes wall402 as an MCP skill so any agent (Claude Desktop, Cursor,
 * custom agent) can discover paywalled endpoints, pay for access, swap
 * tokens, and verify security — all with zero friction on X Layer.
 *
 * Tools:
 *   - list_endpoints          → registered paywalls + prices
 *   - call_paid_endpoint      → full x402 handshake (with auto-swap fallback)
 *   - get_wallet_status       → agent wallet + balances
 *   - swap_tokens             → swap any token pair via Uniswap/DEX on X Layer
 *   - get_swap_quote          → read-only price estimate for a swap
 *   - check_token_security    → pre-payment token risk scan
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawnSync } from "node:child_process";

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const DEFAULT_GATEWAY =
  process.env.WALL402_GATEWAY_URL ?? "http://localhost:3402";
const ONCHAINOS_CLI = process.env.ONCHAINOS_CLI ?? "onchainos";
const DEFAULT_CHAIN = process.env.WALL402_CHAIN ?? "xlayer";
// Well-known token addresses on X Layer mainnet.
// The DEX aggregator uses 0xeee…eee as the native (OKB) sentinel.
const TOKENS: Record<string, string> = {
  USDG: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
  OKB: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",  // native token sentinel
  WOKB: "0xe538905cf8410324e03a5a23c1c177a474d59b2b", // wrapped OKB
  USDT: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  WETH: "0x5a77f1443d16ee5761d310e38b7308399678e948",
  WBTC: "0xea034fb02eb1808c2cc3adbc15f447b93cbe08e1",
};

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

type AcceptEntry = {
  scheme: "exact" | "aggr_deferred";
  network: string;
  amount: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string; sessionCert?: string };
};

type ChallengeBody = {
  x402Version: 2;
  error: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: AcceptEntry[];
};

type SignResult = {
  signature: string;
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
  sessionCert?: string;
};

const decodeChallenge = (headerValue: string): ChallengeBody => {
  const json = Buffer.from(headerValue, "base64").toString("utf8");
  return JSON.parse(json) as ChallengeBody;
};

const humanAmount = (value: string, decimals = 6): string => {
  const n = Number(value) / 10 ** decimals;
  return n >= 1 ? n.toFixed(2) : n.toFixed(4);
};

/** Run an onchainos CLI subcommand and parse JSON output. */
function runCli(
  args: string[],
  { timeout = 30_000 }: { timeout?: number } = {},
): { ok: boolean; data?: unknown; error?: string; raw: string } {
  const result = spawnSync(ONCHAINOS_CLI, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
  if (result.error) {
    return { ok: false, error: (result.error as Error).message, raw: "" };
  }
  const raw = result.stdout || "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed.ok === false) {
      return { ok: false, error: parsed.error ?? "unknown CLI error", raw };
    }
    return { ok: true, data: parsed.data ?? parsed, raw };
  } catch {
    if (result.status !== 0) {
      return {
        ok: false,
        error: result.stderr || `exit ${result.status}`,
        raw,
      };
    }
    return { ok: true, data: raw, raw };
  }
}

// ─────────────────────────────────────────────────────────
// Signing — TEE via onchainos CLI
// ─────────────────────────────────────────────────────────

function signViaOnchainosCli(accepts: AcceptEntry[]): SignResult | null {
  const res = runCli([
    "payment",
    "x402-pay",
    "--accepts",
    JSON.stringify(accepts),
  ]);
  if (!res.ok || !res.data) {
    process.stderr.write(`onchainos x402-pay failed: ${res.error}\n`);
    return null;
  }
  const data = res.data as Record<string, unknown>;
  return {
    signature: data.signature as string,
    authorization: data.authorization as SignResult["authorization"],
    sessionCert: data.sessionCert as string | undefined,
  };
}

// ─────────────────────────────────────────────────────────
// Assemble payment header (v2)
// ─────────────────────────────────────────────────────────

function buildPaymentHeader(
  challenge: ChallengeBody,
  signed: SignResult,
): { headerName: string; headerValue: string; accepted: AcceptEntry } {
  const accepted =
    (signed.sessionCert
      ? challenge.accepts.find((a) => a.scheme === "aggr_deferred")
      : challenge.accepts.find((a) => a.scheme === "exact")) ??
    challenge.accepts[0];
  if (signed.sessionCert) {
    accepted.extra = { ...accepted.extra, sessionCert: signed.sessionCert };
  }
  const payload = {
    x402Version: 2,
    resource: challenge.resource,
    accepted,
    payload: {
      signature: signed.signature,
      authorization: signed.authorization,
    },
  };
  return {
    headerName: "PAYMENT-SIGNATURE",
    headerValue: Buffer.from(JSON.stringify(payload)).toString("base64"),
    accepted,
  };
}

// ─────────────────────────────────────────────────────────
// Tool: list_endpoints
// ─────────────────────────────────────────────────────────

async function listEndpoints(gatewayUrl: string) {
  const res = await fetch(`${gatewayUrl}/api/endpoints`);
  if (!res.ok) throw new Error(`gateway ${res.status}: ${await res.text()}`);
  const { endpoints } = await res.json();
  return endpoints;
}

// ─────────────────────────────────────────────────────────
// Tool: get_wallet_status (enriched with balances)
// ─────────────────────────────────────────────────────────

async function getWalletStatus() {
  const statusRes = runCli(["wallet", "status"]);
  const balanceRes = runCli(["wallet", "balance", "--chain", "196"]);

  const status = statusRes.ok
    ? (statusRes.data as Record<string, unknown>)
    : { loggedIn: false, error: statusRes.error };

  const balance = balanceRes.ok
    ? (balanceRes.data as Record<string, unknown>)
    : { error: balanceRes.error };

  return { ...status, xlayerBalance: balance };
}

// ─────────────────────────────────────────────────────────
// Tool: swap_tokens (Uniswap/DEX via onchainos swap)
// ─────────────────────────────────────────────────────────

function resolveToken(symbolOrAddress: string): string {
  const upper = symbolOrAddress.toUpperCase();
  if (TOKENS[upper]) return TOKENS[upper];
  if (/^0x[a-fA-F0-9]{40}$/.test(symbolOrAddress)) return symbolOrAddress;
  throw new Error(
    `Unknown token: ${symbolOrAddress}. Use a 0x address or one of: ${Object.keys(TOKENS).join(", ")}`,
  );
}

async function swapTokens(input: {
  from: string;
  to: string;
  amount: string;
  chain?: string;
  slippage?: string;
  walletAddress?: string;
}) {
  const fromAddr = resolveToken(input.from);
  const toAddr = resolveToken(input.to);
  const chain = input.chain ?? DEFAULT_CHAIN;

  // Get wallet address if not provided
  let wallet = input.walletAddress;
  if (!wallet) {
    const addrRes = runCli(["wallet", "addresses", "--chain", chain]);
    if (addrRes.ok) {
      const data = addrRes.data as {
        xlayer?: Array<{ address: string }>;
        evm?: Array<{ address: string }>;
      };
      wallet =
        data.xlayer?.[0]?.address ?? data.evm?.[0]?.address ?? undefined;
    }
  }
  if (!wallet) {
    return {
      ok: false,
      error: "could not determine wallet address — provide walletAddress",
    };
  }

  // Get quote first for display
  const quoteRes = runCli([
    "swap",
    "quote",
    "--from",
    fromAddr,
    "--to",
    toAddr,
    "--amount",
    input.amount,
    "--chain",
    chain,
  ]);

  // Execute swap
  const swapArgs = [
    "swap",
    "execute",
    "--from",
    fromAddr,
    "--to",
    toAddr,
    "--amount",
    input.amount,
    "--chain",
    chain,
    "--wallet",
    wallet,
  ];
  if (input.slippage) {
    swapArgs.push("--slippage", input.slippage);
  }

  const swapRes = runCli(swapArgs, { timeout: 60_000 });

  return {
    ok: swapRes.ok,
    from: input.from,
    to: input.to,
    amount: input.amount,
    chain,
    wallet,
    quote: quoteRes.ok ? quoteRes.data : null,
    swap: swapRes.ok ? swapRes.data : null,
    error: swapRes.ok ? undefined : swapRes.error,
  };
}

// ─────────────────────────────────────────────────────────
// Tool: get_swap_quote
// ─────────────────────────────────────────────────────────

async function getSwapQuote(input: {
  from: string;
  to: string;
  amount?: string;
  readableAmount?: string;
  chain?: string;
}) {
  const fromAddr = resolveToken(input.from);
  const toAddr = resolveToken(input.to);
  const chain = input.chain ?? DEFAULT_CHAIN;

  const args = [
    "swap",
    "quote",
    "--from",
    fromAddr,
    "--to",
    toAddr,
    "--chain",
    chain,
  ];
  if (input.readableAmount) {
    args.push("--readable-amount", input.readableAmount);
  } else if (input.amount) {
    args.push("--amount", input.amount);
  } else {
    return { ok: false, error: "provide either amount or readableAmount" };
  }

  const res = runCli(args);
  return {
    ok: res.ok,
    from: input.from,
    to: input.to,
    chain,
    quote: res.ok ? res.data : null,
    error: res.ok ? undefined : res.error,
  };
}

// ─────────────────────────────────────────────────────────
// Tool: check_token_security
// ─────────────────────────────────────────────────────────

async function checkTokenSecurity(input: {
  tokenAddress?: string;
  chain?: string;
  scanWallet?: boolean;
}) {
  const chain = input.chain ?? DEFAULT_CHAIN;

  const args = ["security", "token-scan", "--chain", chain];
  if (input.tokenAddress) {
    args.push("--tokens", `196:${input.tokenAddress}`);
  }
  // If no address and scanWallet is true, CLI scans the logged-in wallet's tokens

  const res = runCli(args, { timeout: 30_000 });
  return {
    ok: res.ok,
    chain,
    tokenAddress: input.tokenAddress ?? "(wallet tokens)",
    scan: res.ok ? res.data : null,
    error: res.ok ? undefined : res.error,
  };
}

// ─────────────────────────────────────────────────────────
// Tool: call_paid_endpoint (with auto-swap fallback)
// ─────────────────────────────────────────────────────────

async function callPaidEndpoint(input: {
  gatewayUrl?: string;
  endpointId: string;
  maxPriceUsd?: number;
  method?: "GET" | "POST";
  body?: unknown;
  autoSwapFrom?: string; // token symbol/address to auto-swap from if USDG insufficient
}) {
  const gateway = input.gatewayUrl ?? DEFAULT_GATEWAY;
  const url = `${gateway}/api/paywall/${input.endpointId}`;

  // Step 1 — trigger challenge
  const init: RequestInit = { method: input.method ?? "GET" };
  if (input.body && init.method !== "GET") {
    init.body = JSON.stringify(input.body);
    init.headers = { "content-type": "application/json" };
  }

  const first = await fetch(url, init);
  if (first.status !== 402) {
    const body = await first.text();
    return {
      paid: false,
      status: first.status,
      body,
      note: "upstream returned without 402 — nothing to pay",
    };
  }

  const paymentRequired = first.headers.get("payment-required");
  if (!paymentRequired) {
    throw new Error("gateway returned 402 without PAYMENT-REQUIRED header");
  }
  const challenge = decodeChallenge(paymentRequired);

  // Step 2 — max price guard
  const exact = challenge.accepts.find((a) => a.scheme === "exact");
  const aggr = challenge.accepts.find((a) => a.scheme === "aggr_deferred");
  const quote = exact ?? aggr ?? challenge.accepts[0];
  const priceHuman = Number(humanAmount(quote.amount));

  if (input.maxPriceUsd !== undefined && priceHuman > input.maxPriceUsd) {
    return {
      paid: false,
      aborted: true,
      reason: `price ${priceHuman} exceeds maxPriceUsd ${input.maxPriceUsd}`,
      quote,
    };
  }

  // Step 3 — sign (TEE)
  let signed = signViaOnchainosCli(challenge.accepts);

  // Step 3b — auto-swap fallback if signing succeeded but settlement
  // might fail due to insufficient USDG. When `autoSwapFrom` is set,
  // we proactively swap before signing so the on-chain auth has funds.
  let swapInfo: { from: string; txHash?: string } | undefined;
  if (!signed && input.autoSwapFrom) {
    // Signing failed — might be balance issue. Try swapping first.
    process.stderr.write(
      `x402-pay failed, attempting auto-swap from ${input.autoSwapFrom}\n`,
    );
    const swapResult = await swapTokens({
      from: input.autoSwapFrom,
      to: "USDG",
      amount: quote.amount,
      chain: DEFAULT_CHAIN,
    });
    if (swapResult.ok) {
      swapInfo = {
        from: input.autoSwapFrom,
        txHash: (swapResult.swap as Record<string, string>)?.txHash,
      };
      // Retry signing after swap
      signed = signViaOnchainosCli(challenge.accepts);
    }
  }

  if (!signed) {
    return {
      paid: false,
      error: "signing_failed",
      hint:
        "onchainos CLI missing, not logged in, or insufficient balance. " +
        "Set autoSwapFrom to a token symbol (e.g. 'OKB') to auto-swap into USDG before paying.",
      challenge,
      swapAttempted: swapInfo ?? false,
    };
  }

  // Step 4 — build header + replay
  const { headerName, headerValue } = buildPaymentHeader(challenge, signed);
  const replay = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      [headerName]: headerValue,
    },
  });

  const paymentResponse = replay.headers.get("payment-response");
  const upstreamBody = await replay.text();

  return {
    paid: replay.ok,
    status: replay.status,
    priceHuman: `${priceHuman} USDG`,
    payer: signed.authorization.from,
    swapInfo: swapInfo ?? null,
    settlement: paymentResponse ? JSON.parse(paymentResponse) : null,
    body: (() => {
      try {
        return JSON.parse(upstreamBody);
      } catch {
        return upstreamBody;
      }
    })(),
  };
}

// ─────────────────────────────────────────────────────────
// MCP wiring
// ─────────────────────────────────────────────────────────

const server = new Server(
  { name: "wall402", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Discovery ──────────────────────────────────────
    {
      name: "list_endpoints",
      description:
        "List paywalled endpoints registered in a wall402 gateway, " +
        "with their prices, upstream URLs, and product types.",
      inputSchema: {
        type: "object",
        properties: {
          gatewayUrl: {
            type: "string",
            description: `Base URL of the wall402 gateway (default: ${DEFAULT_GATEWAY})`,
          },
        },
      },
    },
    // ── Payment ────────────────────────────────────────
    {
      name: "call_paid_endpoint",
      description:
        "Call a paywalled endpoint through wall402. Handles the full HTTP 402 / " +
        "x402 handshake: decode PAYMENT-REQUIRED challenge → sign via TEE Agentic " +
        "Wallet → settle on X Layer → return upstream response + settlement tx. " +
        "Set `autoSwapFrom` to a token symbol (e.g. 'OKB', 'WETH') to automatically " +
        "swap into USDG via Uniswap/DEX if the wallet lacks sufficient USDG balance.",
      inputSchema: {
        type: "object",
        properties: {
          endpointId: {
            type: "string",
            description: "The wall402 endpoint id (from list_endpoints)",
          },
          gatewayUrl: {
            type: "string",
            description: `Gateway base URL (default: ${DEFAULT_GATEWAY})`,
          },
          maxPriceUsd: {
            type: "number",
            description:
              "Maximum acceptable price per call in USDG units (e.g. 0.10)",
          },
          autoSwapFrom: {
            type: "string",
            description:
              "Token symbol or address to auto-swap from if USDG balance is " +
              "insufficient. Supported: OKB, WETH, WBTC, USDT, or any 0x address. " +
              "Uses Uniswap/DEX aggregator on X Layer.",
          },
          method: {
            type: "string",
            enum: ["GET", "POST"],
            description: "HTTP method (default: GET)",
          },
          body: {
            type: "object",
            description: "Optional JSON body for POST requests",
          },
        },
        required: ["endpointId"],
      },
    },
    // ── Wallet ─────────────────────────────────────────
    {
      name: "get_wallet_status",
      description:
        "Report the Onchain OS Agentic Wallet: login state, active account, " +
        "X Layer address, and token balances on chain 196.",
      inputSchema: { type: "object", properties: {} },
    },
    // ── Swap (Uniswap integration) ─────────────────────
    {
      name: "swap_tokens",
      description:
        "Swap tokens on X Layer via Uniswap/DEX aggregator (onchainos swap). " +
        "Executes the full flow: quote → approve → swap → broadcast. " +
        "Use this to convert tokens before paying for paywalled endpoints, or " +
        "for any token swap on X Layer. Returns the transaction hash and amounts.",
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description:
              "Source token: symbol (OKB, WETH, WBTC, USDT, USDG) or 0x address",
          },
          to: {
            type: "string",
            description:
              "Destination token: symbol or 0x address",
          },
          amount: {
            type: "string",
            description:
              "Amount in minimal units (wei). For 0.01 USDG use '10000'.",
          },
          chain: {
            type: "string",
            description: `Chain name (default: ${DEFAULT_CHAIN}). Supports: xlayer, ethereum, base, arbitrum, etc.`,
          },
          slippage: {
            type: "string",
            description:
              "Slippage tolerance in percent (e.g. '0.5'). Omit for auto.",
          },
          walletAddress: {
            type: "string",
            description:
              "Wallet address for the swap. Auto-detected from logged-in wallet if omitted.",
          },
        },
        required: ["from", "to", "amount"],
      },
    },
    {
      name: "get_swap_quote",
      description:
        "Get a read-only price estimate for a token swap on X Layer " +
        "(no transaction executed). Use this to check exchange rates and " +
        "estimate costs before committing to a swap.",
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Source token: symbol or 0x address",
          },
          to: {
            type: "string",
            description: "Destination token: symbol or 0x address",
          },
          amount: {
            type: "string",
            description: "Amount in minimal units (wei)",
          },
          readableAmount: {
            type: "string",
            description:
              'Human-readable amount (e.g. "1.5"). CLI fetches decimals automatically.',
          },
          chain: {
            type: "string",
            description: `Chain name (default: ${DEFAULT_CHAIN})`,
          },
        },
        required: ["from", "to"],
      },
    },
    // ── Security ───────────────────────────────────────
    {
      name: "check_token_security",
      description:
        "Run a security scan on a token before interacting with it. " +
        "Detects honeypots, high tax, mint authority risks, and other red flags. " +
        "Use this before paying for an endpoint that settles in an unfamiliar token, " +
        "or before swapping into a new asset.",
      inputSchema: {
        type: "object",
        properties: {
          tokenAddress: {
            type: "string",
            description:
              "Token contract address to scan. If omitted, scans all tokens in the logged-in wallet.",
          },
          chain: {
            type: "string",
            description: `Chain name (default: ${DEFAULT_CHAIN})`,
          },
          scanWallet: {
            type: "boolean",
            description:
              "If true and no tokenAddress, scans all tokens held by the logged-in wallet.",
          },
        },
      },
    },
    // ── Wallet intelligence ────────────────────────────
    {
      name: "analyze_wallet",
      description:
        "Generate a comprehensive intelligence report on any wallet address: " +
        "PnL (realized/unrealized), win rate, transaction history, token holdings " +
        "security scan, and a trust score. Useful for due diligence before " +
        "interacting with an unknown address.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Wallet address to analyze (0x...)",
          },
          chain: {
            type: "string",
            description: `Chain name (default: ${DEFAULT_CHAIN})`,
          },
        },
        required: ["address"],
      },
    },
  ],
}));

// ─── analyze_wallet implementation ───────────────────────

async function analyzeWallet(input: { address: string; chain?: string }) {
  const chain = input.chain ?? DEFAULT_CHAIN;

  const overview = runCli([
    "market", "portfolio-overview",
    "--address", input.address,
    "--chain", chain,
    "--time-frame", "5",
  ]);
  const pnl = runCli([
    "market", "portfolio-recent-pnl",
    "--address", input.address,
    "--chain", chain,
    "--limit", "10",
  ]);
  const security = runCli([
    "security", "token-scan",
    "--address", input.address,
    "--chain", chain,
  ]);

  const o = overview.ok ? (overview.data as Record<string, unknown>) : null;
  const winRate = parseFloat(String(o?.winRate ?? "0"));
  const totalTx = parseInt(String(o?.totalTxCount ?? o?.buyTxCount ?? "0"), 10);
  const realizedPnl = parseFloat(String(o?.realizedPnlUsd ?? "0"));
  const secData = security.ok && Array.isArray(security.data) ? security.data as Record<string, unknown>[] : [];
  const riskyTokens = secData.filter((t) => t.isHoneypot || t.isRiskToken).length;

  let trustScore = 50;
  if (winRate > 0.5) trustScore += 15;
  if (winRate > 0.7) trustScore += 10;
  if (totalTx > 10) trustScore += 10;
  if (totalTx > 100) trustScore += 5;
  if (realizedPnl > 0) trustScore += 5;
  if (riskyTokens === 0 && secData.length > 0) trustScore += 5;
  if (riskyTokens > 0) trustScore -= riskyTokens * 10;
  trustScore = Math.max(0, Math.min(100, trustScore));

  return {
    address: input.address,
    chain,
    trustScore,
    verdict: trustScore >= 80 ? "highly trusted" : trustScore >= 60 ? "trusted" : trustScore >= 40 ? "neutral" : trustScore >= 20 ? "caution" : "high risk",
    stats: {
      winRate: Math.round(winRate * 100) + "%",
      totalTransactions: totalTx,
      realizedPnlUsd: realizedPnl,
      buyVolume: parseFloat(String(o?.buyTxVolume ?? "0")),
      sellVolume: parseFloat(String(o?.sellTxVolume ?? "0")),
    },
    tokenSecurity: { totalScanned: secData.length, riskyTokens, clean: secData.length - riskyTokens },
    recentPnl: pnl.ok ? pnl.data : null,
    portfolio: o,
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    let result: unknown;
    switch (name) {
      case "list_endpoints":
        result = {
          endpoints: await listEndpoints(
            (a.gatewayUrl as string) ?? DEFAULT_GATEWAY,
          ),
        };
        break;

      case "call_paid_endpoint":
        result = await callPaidEndpoint(a as never);
        break;

      case "get_wallet_status":
        result = await getWalletStatus();
        break;

      case "swap_tokens":
        result = await swapTokens(a as never);
        break;

      case "get_swap_quote":
        result = await getSwapQuote(a as never);
        break;

      case "check_token_security":
        result = await checkTokenSecurity(a as never);
        break;

      case "analyze_wallet":
        result = await analyzeWallet(a as never);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `wall402 mcp error: ${(err as Error).message}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("wall402 MCP server ready on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`wall402 MCP server fatal: ${err}\n`);
  process.exit(1);
});
