import {
  X_LAYER_CHAIN_IDS,
  type PaywallEndpoint,
  type XLayerNetwork,
} from "@wall402/core";
import { randomBytes } from "node:crypto";

/**
 * x402 v2 challenge and verification primitives.
 *
 * We implement the v2 spec (PAYMENT-REQUIRED header, base64-encoded body)
 * because that's what Onchain OS's `okx-x402-payment` CLI emits by default
 * when signing via TEE.
 *
 * Spec reference: https://x402.org and okx-x402-payment/SKILL.md.
 */

export interface X402AcceptEntry {
  scheme: "exact" | "aggr_deferred";
  network: string; // CAIP-2: "eip155:196"
  amount: string; // minimal units, stringified bigint
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra?: {
    name?: string;
    version?: string;
    sessionCert?: string;
  };
}

/**
 * Alternative tokens the gateway hints the agent can auto-swap from.
 * This is a non-spec extension that MCP-aware agents use: if the
 * primary asset is USDG but the agent holds OKB, it can
 * `swap_tokens(OKB → USDG)` before signing the x402 authorization.
 */
export interface X402AlternativeToken {
  symbol: string;
  address: string;
  estimatedRate?: string; // rough rate vs primary asset, for display
}

export const X_LAYER_ALT_TOKENS: X402AlternativeToken[] = [
  { symbol: "OKB", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
  { symbol: "USDT", address: "0x779ded0c9e1022225f8e0630b35a9b54be713736" },
  { symbol: "WOKB", address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b" },
];

export interface X402ChallengeBody {
  x402Version: 2;
  error: string;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepts: X402AcceptEntry[];
  /**
   * wall402 extension: alternative tokens the agent can auto-swap from.
   * Not part of the x402 core spec, but MCP-aware agents can read this
   * and call `swap_tokens()` before paying if they hold one of these.
   */
  alternativeTokens?: X402AlternativeToken[];
}

export interface X402PaymentPayloadV2 {
  x402Version: 2;
  resource: X402ChallengeBody["resource"];
  accepted: X402AcceptEntry;
  payload: {
    signature: string;
    authorization: X402Authorization;
  };
}

export interface X402Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

/**
 * Build an x402 v2 challenge for a given paywalled endpoint.
 *
 * Returns:
 *  - `body`: the decoded challenge body (what agents see after base64 decode)
 *  - `header`: the base64-encoded `PAYMENT-REQUIRED` header value
 */
export function buildChallenge(params: {
  endpoint: PaywallEndpoint;
  resourceUrl: string;
  assetAddress: string;
  /**
   * EIP-712 domain `name` field of the asset token — MUST match what
   * the token contract reports on-chain, not the display symbol. The
   * TEE signer reads the real name from the contract and will refuse
   * to sign otherwise. For USDG on X Layer: `"Global Dollar"`.
   */
  assetName: string;
  assetVersion?: string;
}): { body: X402ChallengeBody; header: string } {
  const { endpoint, resourceUrl, assetAddress, assetName } = params;
  const chainId =
    X_LAYER_CHAIN_IDS[endpoint.network as XLayerNetwork] ??
    X_LAYER_CHAIN_IDS.mainnet;
  const networkId = `eip155:${chainId}`;

  const accepts: X402AcceptEntry[] = [
    // Prefer aggr_deferred first — it skips on-chain EOA signing for payers
    // using Onchain OS TEE session keys. The CLI picks the best automatically.
    {
      scheme: "aggr_deferred",
      network: networkId,
      amount: endpoint.priceAmount,
      payTo: endpoint.creatorWallet,
      asset: assetAddress,
      maxTimeoutSeconds: 300,
      extra: { name: assetName, version: params.assetVersion ?? "1" },
    },
    {
      scheme: "exact",
      network: networkId,
      amount: endpoint.priceAmount,
      payTo: endpoint.creatorWallet,
      asset: assetAddress,
      maxTimeoutSeconds: 300,
      extra: { name: assetName, version: params.assetVersion ?? "1" },
    },
  ];

  const body: X402ChallengeBody = {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: resourceUrl,
      description: endpoint.label,
      mimeType: "application/json",
    },
    accepts,
    // Hint to MCP-aware agents that they can auto-swap from these
    // alternative tokens if they don't hold the primary asset (USDG).
    alternativeTokens: X_LAYER_ALT_TOKENS,
  };

  const header = Buffer.from(JSON.stringify(body)).toString("base64");
  return { body, header };
}

/**
 * Decode a v2 PAYMENT-SIGNATURE header back to its payload.
 */
export function decodePaymentHeader(
  headerValue: string,
): X402PaymentPayloadV2 | null {
  try {
    const json = Buffer.from(headerValue, "base64").toString("utf8");
    return JSON.parse(json) as X402PaymentPayloadV2;
  } catch {
    return null;
  }
}

/** Generate a 32-byte nonce (used by both challenge and local signing). */
export function generateNonce(): string {
  return "0x" + randomBytes(32).toString("hex");
}
