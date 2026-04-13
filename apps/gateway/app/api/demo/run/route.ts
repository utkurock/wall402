import { NextResponse, type NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";
import { X_LAYER_CHAIN_IDS } from "@wall402/core";
import { env } from "@/lib/env";
import { listEndpoints } from "@/lib/registry";

/**
 * POST /api/demo/run
 *
 * One-click end-to-end demo. Signs a fresh EIP-3009 authorization with a
 * throwaway private key, replays it against `/api/paywall/<id>`, and
 * returns the settlement details. Because settlement is mocked in dev
 * mode, the signer doesn't need to hold any USDG — verify still passes
 * since it only checks the signature recovers to `authorization.from`.
 *
 * Used by the dashboard "simulate paid call" button so jurors see live
 * audit entries appear in the table without having to wire a real agent.
 */

export async function POST(req: NextRequest) {
  const endpoints = listEndpoints();

  // Prefer an `internal://demo/*` endpoint so we don't accidentally
  // settle a buyer-registered real upstream. If the caller passes an
  // `endpointId` query param, pin to that; otherwise pick uniformly at
  // random across demo products so repeated clicks produce variety in
  // the audit log.
  const pinned = req.nextUrl.searchParams.get("endpointId");
  const demoEndpoints = endpoints.filter((e) =>
    e.upstreamUrl.startsWith("internal://"),
  );
  const demo = pinned
    ? endpoints.find((e) => e.id === pinned)
    : demoEndpoints[Math.floor(Math.random() * demoEndpoints.length)];
  if (!demo) {
    return NextResponse.json(
      { error: "demo_endpoint_missing" },
      { status: 404 },
    );
  }

  const base =
    req.nextUrl.origin || env.GATEWAY_PUBLIC_URL || "http://localhost:3402";
  const paywallUrl = `${base}/api/paywall/${demo.id}`;

  // ── 1. Trigger 402 challenge ──────────────────────────────
  const challengeRes = await fetch(paywallUrl);
  if (challengeRes.status !== 402) {
    return NextResponse.json(
      { error: "expected_402", status: challengeRes.status },
      { status: 500 },
    );
  }
  const headerValue = challengeRes.headers.get("payment-required");
  if (!headerValue) {
    return NextResponse.json(
      { error: "missing_payment_required_header" },
      { status: 500 },
    );
  }
  const challenge = JSON.parse(
    Buffer.from(headerValue, "base64").toString("utf8"),
  ) as {
    x402Version: 2;
    resource: unknown;
    accepts: Array<{
      scheme: "exact" | "aggr_deferred";
      network: string;
      amount: string;
      payTo: string;
      asset: string;
      maxTimeoutSeconds: number;
      extra?: { name?: string; version?: string };
    }>;
  };

  const accepted = challenge.accepts.find((a) => a.scheme === "exact");
  if (!accepted) {
    return NextResponse.json(
      { error: "no_exact_scheme" },
      { status: 500 },
    );
  }

  // ── 2. Generate throwaway signer ──────────────────────────
  const pk = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
  const account = privateKeyToAccount(pk);

  // ── 3. Sign EIP-3009 TransferWithAuthorization ────────────
  const now = Math.floor(Date.now() / 1000);
  const nonce = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
  const validAfter = 0n;
  const validBefore = BigInt(now + accepted.maxTimeoutSeconds);
  const value = BigInt(accepted.amount);

  const chainId =
    X_LAYER_CHAIN_IDS[demo.network as keyof typeof X_LAYER_CHAIN_IDS];

  const signature = await account.signTypedData({
    domain: {
      name: accepted.extra?.name ?? env.SETTLEMENT_TOKEN_DOMAIN_NAME,
      version: accepted.extra?.version ?? env.SETTLEMENT_TOKEN_DOMAIN_VERSION,
      chainId,
      verifyingContract: accepted.asset as `0x${string}`,
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
      to: accepted.payTo as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce,
    },
  });

  // ── 4. Assemble payment payload + replay ──────────────────
  const authorization = {
    from: account.address,
    to: accepted.payTo,
    value: accepted.amount,
    validAfter: "0",
    validBefore: String(validBefore),
    nonce,
  };

  const paymentPayload = {
    x402Version: 2 as const,
    resource: challenge.resource,
    accepted,
    payload: { signature, authorization },
  };
  const replayHeader = Buffer.from(JSON.stringify(paymentPayload)).toString(
    "base64",
  );

  const replay = await fetch(paywallUrl, {
    headers: { "PAYMENT-SIGNATURE": replayHeader },
  });
  const replayBodyText = await replay.text();
  let replayBody: unknown = replayBodyText;
  try {
    replayBody = JSON.parse(replayBodyText);
  } catch {
    /* keep as text */
  }

  const paymentResponseHeader = replay.headers.get("payment-response");
  const settlement = paymentResponseHeader
    ? JSON.parse(paymentResponseHeader)
    : null;

  return NextResponse.json({
    ok: replay.ok,
    status: replay.status,
    endpoint: {
      id: demo.id,
      label: demo.label,
      upstreamUrl: demo.upstreamUrl,
      priceAmount: demo.priceAmount,
      priceToken: demo.priceToken,
    },
    payer: account.address,
    settlement,
    upstream: replayBody,
  });
}
