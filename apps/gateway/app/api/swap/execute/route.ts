import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

const CLI = process.env.ONCHAINOS_CLI ?? "onchainos";

export async function POST(req: Request) {
  const rl = rateLimit(`swap-exec:${getClientIP(req)}`, { max: 5, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = await req.json();
  const { from, to, amount, wallet } = body as {
    from?: string;
    to?: string;
    amount?: string;
    wallet?: string;
  };

  if (!from || !to || !amount || !wallet) {
    return NextResponse.json({ ok: false, error: "missing params" }, { status: 400 });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ ok: false, error: "invalid wallet address" }, { status: 400 });
  }

  const result = spawnSync(CLI, [
    "swap", "execute",
    "--from", from,
    "--to", to,
    "--readable-amount", amount,
    "--chain", "xlayer",
    "--wallet", wallet,
  ], { encoding: "utf8", timeout: 60_000 });

  try {
    const parsed = JSON.parse(result.stdout || "{}");
    return NextResponse.json({
      ok: parsed.ok ?? false,
      data: parsed.data ?? null,
      error: parsed.ok ? undefined : (parsed.error ?? "swap failed"),
    });
  } catch {
    return NextResponse.json({
      ok: false,
      error: result.stderr || "execution failed",
    });
  }
}
