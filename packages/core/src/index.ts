import { z } from "zod";

export * from "./xlayer";

// ─────────────────────────────────────────────────────────
// wall402 — shared types and schemas
// ─────────────────────────────────────────────────────────

export const XLayerNetwork = z.enum(["mainnet", "testnet"]);
export type XLayerNetwork = z.infer<typeof XLayerNetwork>;

export const X_LAYER_CHAIN_IDS = {
  mainnet: 196,
  testnet: 1952,
} as const;

/**
 * A paywalled endpoint registered by a creator.
 */
export const PaywallEndpoint = z.object({
  id: z.string(),
  creatorWallet: z.string(),
  /** The upstream URL that wall402 proxies to on successful payment. */
  upstreamUrl: z.string().url(),
  /** Human-readable label shown to agents. */
  label: z.string(),
  /** Price per call, in the smallest unit of `priceToken`. */
  priceAmount: z.string(), // bigint-as-string for JSON safety
  /** Token symbol (e.g. "USDT", "USDG"). */
  priceToken: z.string(),
  /** Chain the settlement happens on. */
  network: XLayerNetwork,
  /** Optional rate limit per consumer wallet per minute. */
  rateLimitPerMin: z.number().int().positive().optional(),
  createdAt: z.string().datetime(),
});
export type PaywallEndpoint = z.infer<typeof PaywallEndpoint>;

/**
 * The 402 challenge we return to unauthenticated agent requests.
 * Shape aligned with x402 spec + Onchain OS payment skill.
 */
export const PaymentChallenge = z.object({
  version: z.literal("x402/1"),
  endpointId: z.string(),
  recipient: z.string(),
  amount: z.string(),
  token: z.string(),
  network: XLayerNetwork,
  chainId: z.number(),
  nonce: z.string(),
  expiresAt: z.string().datetime(),
});
export type PaymentChallenge = z.infer<typeof PaymentChallenge>;

/**
 * A settled payment record written to the audit log.
 *
 * In addition to the settlement primitives (tx hash, amount, payer) we
 * snapshot the _product_ that was bought — the endpoint's label and the
 * upstream response body at the moment of payment — so the audit log
 * answers both "who paid what" and "what did they actually get" without
 * needing to re-fetch. The snapshot is also durable against later edits
 * or deletion of the endpoint.
 */
export const PaymentReceipt = z.object({
  endpointId: z.string(),
  /** Human-readable label of the paywalled product at purchase time. */
  endpointLabel: z.string(),
  /** Short category hint for UI grouping (e.g. "signal", "risk-report"). */
  productKind: z.string().optional(),
  txHash: z.string(),
  payer: z.string(),
  recipient: z.string(),
  amount: z.string(),
  token: z.string(),
  network: XLayerNetwork,
  settledAt: z.string().datetime(),
  riskScore: z.number().optional(),
  /** The upstream response the buyer actually received, JSON-serialized. */
  upstreamBody: z.unknown().optional(),
  /** One-line human summary for dense table rendering. */
  resultSummary: z.string().optional(),
});
export type PaymentReceipt = z.infer<typeof PaymentReceipt>;

export const explorerUrl = (network: XLayerNetwork, txHash: string): string =>
  network === "mainnet"
    ? `https://www.okx.com/web3/explorer/xlayer/tx/${txHash}`
    : `https://www.okx.com/web3/explorer/xlayer-test/tx/${txHash}`;
