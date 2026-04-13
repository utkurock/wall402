import {
  X_LAYER_CHAIN_IDS,
  explorerUrl,
  type PaywallEndpoint,
} from "@wall402/core";
import { NextResponse, type NextRequest } from "next/server";
import { appendReceipt } from "@/lib/audit";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { findProductByUpstream } from "@/lib/products";
import { env } from "@/lib/env";
import { getEndpoint } from "@/lib/registry";
import { settle } from "@/lib/settlement";
import { markNonceUsed, verifyExactScheme } from "@/lib/verify";
import { buildChallenge, decodePaymentHeader } from "@/lib/x402";

/**
 * wall402 paywall proxy.
 *
 *   GET  /api/paywall/<endpointId>
 *   POST /api/paywall/<endpointId>
 *
 * Without `PAYMENT-SIGNATURE` header → returns HTTP 402 with an x402 v2
 * challenge. With a valid signed payload → verifies the signature,
 * settles on X Layer, then proxies the upstream resource.
 *
 * Internal upstreams (`internal://product/*`) are served from the
 * product catalog (lib/products.ts) which fetches real market data
 * from the onchainos CLI and optionally enriches with Gemini AI.
 */

async function fetchUpstream(
  endpoint: PaywallEndpoint,
  req: NextRequest,
): Promise<Response> {
  // Internal product upstreams are served from the product catalog.
  // generate() is async — may call onchainos CLI + Gemini AI.
  if (endpoint.upstreamUrl.startsWith("internal://")) {
    const product = findProductByUpstream(endpoint.upstreamUrl);
    if (product) {
      // Pass user query from ?q= parameter to the product generator
      const userQuery = req.nextUrl.searchParams.get("q") ?? undefined;
      const data = await product.generate(userQuery);
      return NextResponse.json({
        source: "wall402",
        endpointId: endpoint.id,
        endpointLabel: endpoint.label,
        kind: product.kind,
        ...data,
      });
    }
    return NextResponse.json(
      { error: "product_not_found", upstreamUrl: endpoint.upstreamUrl },
      { status: 500 },
    );
  }

  const init: RequestInit = {
    method: req.method,
    headers: new Headers(req.headers),
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  return fetch(endpoint.upstreamUrl, init);
}

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Rate limit: 30 req/min per IP
  const ip = getClientIP(req);
  const rl = rateLimit(`paywall:${ip}`, { max: 30 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await ctx.params;
  const endpoint = getEndpoint(id);
  if (!endpoint) {
    return NextResponse.json(
      { error: "endpoint_not_found", endpointId: id },
      { status: 404 },
    );
  }

  const paymentHeader =
    req.headers.get("payment-signature") ?? req.headers.get("x-payment");

  // ── 1. No payment → issue 402 challenge ────────────────
  if (!paymentHeader) {
    const { body, header } = buildChallenge({
      endpoint,
      resourceUrl: `${env.GATEWAY_PUBLIC_URL}/api/paywall/${endpoint.id}`,
      assetAddress: env.SETTLEMENT_TOKEN_ADDRESS,
      assetName: env.SETTLEMENT_TOKEN_DOMAIN_NAME,
      assetVersion: env.SETTLEMENT_TOKEN_DOMAIN_VERSION,
    });

    return new NextResponse(JSON.stringify({}), {
      status: 402,
      headers: {
        "content-type": "application/json",
        "payment-required": header,
        // Surface the decoded body too so human developers poking at the
        // endpoint from curl can read what's required without base64-ing.
        "x-wall402-challenge": JSON.stringify(body),
      },
    });
  }

  // ── 2. Payment provided → decode + verify ──────────────
  const payload = decodePaymentHeader(paymentHeader);
  if (!payload) {
    return NextResponse.json(
      { error: "invalid_payment_header" },
      { status: 400 },
    );
  }

  if (payload.accepted.scheme !== "exact") {
    // aggr_deferred requires session-cert validation via the Onchain OS
    // backend. For the hackathon MVP we only verify the exact scheme
    // locally; the CLI can be pointed at an exact-only gateway by preferring
    // it in the accepts ordering client-side.
    return NextResponse.json(
      {
        error: "scheme_not_supported",
        scheme: payload.accepted.scheme,
        hint: "wall402 currently verifies only the `exact` scheme end-to-end.",
      },
      { status: 400 },
    );
  }

  const verification = await verifyExactScheme(payload, {
    chainId:
      X_LAYER_CHAIN_IDS[endpoint.network as keyof typeof X_LAYER_CHAIN_IDS],
    verifyingContract: env.SETTLEMENT_TOKEN_ADDRESS as `0x${string}`,
    // Prefer the token's real on-chain EIP-712 domain over whatever the
    // client echoed back in `accepted.extra` — a hostile client could
    // otherwise downgrade verification by sending a stale domain name.
    domainName: env.SETTLEMENT_TOKEN_DOMAIN_NAME,
    domainVersion: env.SETTLEMENT_TOKEN_DOMAIN_VERSION,
    expectedTo: endpoint.creatorWallet as `0x${string}`,
    expectedValue: BigInt(endpoint.priceAmount),
  });

  if (!verification.ok) {
    return NextResponse.json(
      { error: "invalid_signature", reason: verification.reason },
      { status: 402 },
    );
  }

  if (
    !markNonceUsed(
      payload.payload.authorization.from,
      payload.payload.authorization.nonce,
    )
  ) {
    return NextResponse.json(
      { error: "nonce_replay" },
      { status: 409 },
    );
  }

  // ── 3. Settle on X Layer ───────────────────────────────
  let settlement;
  try {
    settlement = await settle({
      authorization: payload.payload.authorization,
      signature: payload.payload.signature,
      network: endpoint.network,
      endpointId: endpoint.id,
      endpointLabel: endpoint.label,
    });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    const isInsufficientFunds = msg.includes("insufficient") || msg.includes("funds") || msg.includes("balance") || msg.includes("revert");
    return NextResponse.json(
      {
        error: "settlement_failed",
        reason: isInsufficientFunds
          ? "Insufficient USDG balance on X Layer. You need USDG in your wallet to complete the payment. Swap OKB or other tokens to USDG first."
          : msg,
        hint: isInsufficientFunds ? "swap" : undefined,
      },
      { status: 402 },
    );
  }

  // ── 4. Proxy upstream and stamp payment-response ───────
  //
  // Order matters here: we fetch upstream BEFORE appending the receipt
  // so the audit log can snapshot what was actually delivered. If the
  // upstream blows up we still record the settlement (buyer paid, even
  // if the product returned an error) but flag the body as such.
  const upstream = await fetchUpstream(endpoint, req);
  const upstreamText = await upstream.text();
  let upstreamBody: unknown = upstreamText;
  try {
    upstreamBody = JSON.parse(upstreamText);
  } catch {
    /* leave as raw text */
  }

  const product = findProductByUpstream(endpoint.upstreamUrl);
  let resultSummary: string | undefined;
  let productKind: string | undefined;
  if (
    product &&
    upstream.ok &&
    upstreamBody &&
    typeof upstreamBody === "object"
  ) {
    productKind = product.kind;
    try {
      resultSummary = product.summarize(upstreamBody as Record<string, unknown>);
    } catch {
      resultSummary = undefined;
    }
  } else if (!upstream.ok) {
    resultSummary = `upstream ${upstream.status}`;
  }

  await appendReceipt({
    ...settlement.receipt,
    endpointLabel: endpoint.label,
    productKind,
    upstreamBody,
    resultSummary,
  });

  const responseHeaders = new Headers(upstream.headers);
  // HTTP header values are ByteString (ISO-8859-1). `resultSummary` and
  // the product label may contain non-ASCII characters (e.g. → … in the
  // alpha signal summary). We JSON.stringify then escape any char above
  // 0x7f as a valid JSON `\uXXXX` sequence so the result is both valid
  // JSON and safe to ship through a header.
  const paymentResponseJson = JSON.stringify({
    txHash: settlement.txHash,
    mock: settlement.mock,
    explorerUrl: settlement.explorerUrl,
    payer: verification.payer,
    amount: payload.payload.authorization.value,
    token: env.SETTLEMENT_TOKEN,
    product: endpoint.label,
    resultSummary,
  }).replace(
    /[\u0080-\uffff]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
  responseHeaders.set("payment-response", paymentResponseJson);
  responseHeaders.set(
    "x-wall402-explorer",
    explorerUrl(endpoint.network, settlement.txHash),
  );

  return new Response(upstreamText, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = handle;
export const POST = handle;
