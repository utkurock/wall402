import { NextResponse, type NextRequest } from "next/server";
import { spawnSync } from "node:child_process";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

const CLI = process.env.ONCHAINOS_CLI ?? "onchainos";

export async function GET(req: NextRequest) {
  const rl = rateLimit(`swap-quote:${getClientIP(req)}`, { max: 20 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const amount = req.nextUrl.searchParams.get("amount");
  const fromSymbol = req.nextUrl.searchParams.get("fromSymbol") ?? "?";
  const toSymbol = req.nextUrl.searchParams.get("toSymbol") ?? "?";

  if (!from || !to || !amount) {
    return NextResponse.json({ error: "missing params: from, to, amount" }, { status: 400 });
  }

  const result = spawnSync(CLI, [
    "swap", "quote",
    "--from", from,
    "--to", to,
    "--readable-amount", amount,
    "--chain", "xlayer",
  ], { encoding: "utf8", timeout: 15_000 });

  try {
    const parsed = JSON.parse(result.stdout || "{}");
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error ?? "quote failed" });
    }
    const data = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
    const fromAmount = parseFloat(data?.fromTokenAmount ?? "0");
    const toAmount = parseFloat(data?.toTokenAmount ?? "0");
    const fromDecimals = parseInt(data?.fromToken?.decimal ?? "18", 10);
    const toDecimals = parseInt(data?.toToken?.decimal ?? "6", 10);
    const outputHuman = toAmount / 10 ** toDecimals;
    const inputHuman = fromAmount / 10 ** fromDecimals;
    const rate = inputHuman > 0 ? (outputHuman / inputHuman).toFixed(4) : "—";

    const routes = (data?.dexRouterList ?? []).map((r: Record<string, unknown>) =>
      (r.dexProtocol as Record<string, unknown>)?.dexName ?? "DEX"
    );

    return NextResponse.json({
      estimatedOutput: outputHuman.toFixed(outputHuman >= 1 ? 4 : 6),
      rate,
      route: routes.join(" → ") || "Uniswap V3/V4",
      priceImpact: data?.priceImpactPercent ?? "—",
      fromSymbol,
      toSymbol,
      raw: data,
    });
  } catch {
    return NextResponse.json({ error: result.stderr || "parse error" });
  }
}
