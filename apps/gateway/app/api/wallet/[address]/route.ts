import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { createPublicClient, http, formatEther, type Address, type Chain } from "viem";
import { mainnet, bsc, polygon, arbitrum, base } from "viem/chains";
import { spawnSync } from "node:child_process";
import { xLayerMainnet } from "@wall402/core";

/**
 * GET /api/wallet/:address?chain=ethereum
 *
 * Free tier: native balance + DEX trading stats + recent PnL.
 * Supports: ethereum, bsc, polygon, arbitrum, base, xlayer.
 */

const CLI = process.env.ONCHAINOS_CLI ?? "onchainos";

const CHAINS: Record<string, { chain: Chain; url: string; symbol: string; wrapped: string }> = {
  ethereum: { chain: mainnet, url: "https://eth.llamarpc.com", symbol: "ETH", wrapped: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  bsc: { chain: bsc, url: "https://bsc-dataseed.binance.org", symbol: "BNB", wrapped: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" },
  polygon: { chain: polygon, url: "https://polygon-rpc.com", symbol: "POL", wrapped: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" },
  arbitrum: { chain: arbitrum, url: "https://arb1.arbitrum.io/rpc", symbol: "ETH", wrapped: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" },
  base: { chain: base, url: "https://mainnet.base.org", symbol: "ETH", wrapped: "0x4200000000000000000000000000000000000006" },
  xlayer: { chain: xLayerMainnet, url: "https://rpc.xlayer.tech", symbol: "OKB", wrapped: "0xe538905cf8410324e03a5a23c1c177a474d59b2b" },
};

function cli(args: string[]): { ok: boolean; data?: unknown; error?: string } {
  const r = spawnSync(CLI, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
  });
  if (r.error) return { ok: false, error: (r.error as Error).message };
  try {
    const p = JSON.parse(r.stdout || "{}");
    return p.ok === false ? { ok: false, error: p.error } : { ok: true, data: p.data ?? p };
  } catch {
    return r.status === 0 ? { ok: true, data: r.stdout } : { ok: false, error: r.stderr || `exit ${r.status}` };
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;
  const chain = new URL(_req.url).searchParams.get("chain") ?? "ethereum";

  // Rate limit: 20 req/min per IP
  const rl = rateLimit(`wallet:${getClientIP(_req)}`, { max: 20 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "invalid_address", hint: "Expected 0x + 40 hex chars" },
      { status: 400 },
    );
  }

  // 1. Native balance via RPC
  const chainConfig = CHAINS[chain];
  let nativeBalance = "0";
  const nativeSymbol = chainConfig?.symbol ?? "ETH";
  let nativeUsd = 0;

  if (chainConfig) {
    try {
      const client = createPublicClient({
        chain: chainConfig.chain,
        transport: http(chainConfig.url),
      });
      const bal = await client.getBalance({ address: address as Address });
      nativeBalance = formatEther(bal);

      // Get price via wrapped token (more reliable than native sentinel)
      const priceRes = cli(["market", "price", "--address", chainConfig.wrapped, "--chain", chain]);
      if (priceRes.ok) {
        const pd = (Array.isArray(priceRes.data) ? priceRes.data[0] : priceRes.data) as Record<string, unknown>;
        const price = parseFloat(String(pd?.price ?? pd?.tokenUnitPrice ?? "0"));
        nativeUsd = parseFloat(nativeBalance) * price;
      }
    } catch {
      // RPC failed — continue with other data
    }
  }

  // 2. DEX trading stats
  const overview = cli([
    "market", "portfolio-overview",
    "--address", address,
    "--chain", chain,
    "--time-frame", "5", // 3 months
  ]);
  const o = overview.ok ? (overview.data as Record<string, unknown>) : null;
  const winRate = parseFloat(String(o?.winRate ?? "0"));
  const totalTx = parseInt(String(o?.totalTxCount ?? o?.buyTxCount ?? "0"), 10);

  // 3. Recent token PnL
  const pnl = cli([
    "market", "portfolio-recent-pnl",
    "--address", address,
    "--chain", chain,
    "--limit", "5",
  ]);

  const free = {
    address,
    chain,
    tier: "free" as const,
    balance: {
      native: parseFloat(parseFloat(nativeBalance).toFixed(6)),
      symbol: nativeSymbol,
      usd: Math.round(nativeUsd * 100) / 100,
    },
    dexStats: {
      totalTransactions: totalTx,
      winRate: Math.round(winRate * 100) + "%",
      realizedPnlUsd: parseFloat(String(o?.realizedPnlUsd ?? "0")),
      buyVolume: parseFloat(String(o?.buyTxVolume ?? "0")),
      sellVolume: parseFloat(String(o?.sellTxVolume ?? "0")),
    },
    recentPnl: pnl.ok ? pnl.data : null,
    upgrade: {
      hint: "Pay 0.025 USDG for the full Wallet Intelligence report.",
      includes: [
        "Trust score (0-100)",
        "AI-powered behavior analysis",
        "Token security scan (honeypot, risk flags)",
        "Detailed hold times per token",
        "Recent PnL breakdown by token",
      ],
      endpoint: "/explore",
    },
    dataSource: "RPC + OKX Portfolio API",
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(free);
}
