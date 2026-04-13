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

  // Enforce $0.10 max swap limit — OKB ↔ USDG only
  const okbAddr = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const usdgAddr = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";
  if (from !== okbAddr && from !== usdgAddr) {
    return NextResponse.json({ ok: false, error: "Only OKB ↔ USDG swaps allowed" }, { status: 400 });
  }
  if (to !== okbAddr && to !== usdgAddr) {
    return NextResponse.json({ ok: false, error: "Only OKB ↔ USDG swaps allowed" }, { status: 400 });
  }
  const numAmount = parseFloat(amount);
  if (from === okbAddr && numAmount > 0.0015) {
    return NextResponse.json({ ok: false, error: "Max swap: ~$0.10 per tx" }, { status: 400 });
  }
  if (from === usdgAddr && numAmount > 0.11) {
    return NextResponse.json({ ok: false, error: "Max swap: $0.10 per tx" }, { status: 400 });
  }

  // Step 1: TEE wallet does the swap
  const swapResult = spawnSync(CLI, [
    "swap", "execute",
    "--from", from,
    "--to", to,
    "--readable-amount", amount,
    "--chain", "xlayer",
    "--wallet", "0x254c3699cc099b71df58a719984c4c8cb1034d55", // TEE wallet
  ], { encoding: "utf8", timeout: 60_000 });

  let swapOk = false;
  let swapData: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(swapResult.stdout || "{}");
    swapOk = parsed.ok ?? false;
    swapData = parsed.data ?? null;
    if (!swapOk) {
      return NextResponse.json({ ok: false, error: parsed.error ?? "swap failed" });
    }
  } catch {
    return NextResponse.json({ ok: false, error: swapResult.stderr || "swap execution failed" });
  }

  // Step 2: Send swapped tokens to user's wallet
  const outputToken = to;
  // Estimate output from quote (approximate)
  const sendAmount = amount; // simplified — send same readable amount
  const sendResult = spawnSync(CLI, [
    "wallet", "send",
    "--recipient", wallet,
    "--chain", "xlayer",
    ...(outputToken === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      ? ["--readable-amount", sendAmount]
      : ["--contract-token", outputToken, "--readable-amount", sendAmount]),
    "--force",
  ], { encoding: "utf8", timeout: 60_000 });

  let sendOk = false;
  let sendData: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(sendResult.stdout || "{}");
    sendOk = parsed.ok ?? false;
    sendData = parsed.data ?? null;
  } catch { /* ignore */ }

  return NextResponse.json({
    ok: swapOk,
    swap: swapData,
    sent: sendOk,
    sendData,
    recipient: wallet,
    error: sendOk ? undefined : "Swap succeeded but transfer to your wallet failed. Contact support.",
  });
}
