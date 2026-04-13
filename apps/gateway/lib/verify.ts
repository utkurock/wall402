import {
  hashTypedData,
  isAddressEqual,
  recoverAddress,
  type Address,
  type Hex,
} from "viem";
import type { X402PaymentPayloadV2 } from "./x402";

/**
 * Verify an EIP-3009 TransferWithAuthorization signature produced by an
 * x402 payer. This is the server-side half of the x402 handshake —
 * `okx-x402-payment` signs, we verify.
 *
 * Returns the recovered payer address on success, or an error string.
 *
 * NOTE: Only verifies the `exact` scheme (full EIP-3009). The
 * `aggr_deferred` scheme uses Ed25519 session keys and requires a
 * different verification path that delegates to the Onchain OS
 * settlement backend — out of scope for the hackathon MVP.
 */
export async function verifyExactScheme(
  payload: X402PaymentPayloadV2,
  expected: {
    chainId: number;
    verifyingContract: Address;
    domainName: string;
    domainVersion: string;
    expectedTo: Address;
    expectedValue: bigint;
    maxSkewSeconds?: number;
  },
): Promise<
  | { ok: true; payer: Address }
  | { ok: false; reason: string }
> {
  const { signature, authorization } = payload.payload;
  const now = Math.floor(Date.now() / 1000);
  const skew = expected.maxSkewSeconds ?? 30;

  const validAfter = Number(authorization.validAfter);
  const validBefore = Number(authorization.validBefore);
  if (Number.isNaN(validAfter) || Number.isNaN(validBefore)) {
    return { ok: false, reason: "invalid validity window" };
  }
  if (now + skew < validAfter) {
    return { ok: false, reason: "authorization not yet valid" };
  }
  if (now - skew > validBefore) {
    return { ok: false, reason: "authorization expired" };
  }

  // Recipient must match the registered creator wallet.
  if (!isAddressEqual(authorization.to as Address, expected.expectedTo)) {
    return { ok: false, reason: "recipient mismatch" };
  }

  // Value must be at least the required price (agents may overpay but
  // never underpay).
  let value: bigint;
  try {
    value = BigInt(authorization.value);
  } catch {
    return { ok: false, reason: "invalid value" };
  }
  if (value < expected.expectedValue) {
    return { ok: false, reason: "insufficient amount" };
  }

  // EIP-712 domain for EIP-3009 TransferWithAuthorization — token contract
  // defines `name` and `version`; we take them from the challenge extras.
  const domain = {
    name: expected.domainName,
    version: expected.domainVersion,
    chainId: expected.chainId,
    verifyingContract: expected.verifyingContract,
  } as const;

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const;

  const message = {
    from: authorization.from as Address,
    to: authorization.to as Address,
    value,
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: authorization.nonce as Hex,
  };

  const digest = hashTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  let recovered: Address;
  try {
    recovered = await recoverAddress({
      hash: digest,
      signature: signature as Hex,
    });
  } catch (err) {
    return {
      ok: false,
      reason: `signature recovery failed: ${(err as Error).message}`,
    };
  }

  if (!isAddressEqual(recovered, authorization.from as Address)) {
    return { ok: false, reason: "signature does not match `from`" };
  }

  return { ok: true, payer: recovered };
}

// ─────────────────────────────────────────────────────────
// In-process nonce replay guard.
// Prevents the same (from, nonce) tuple from being redeemed twice
// within this gateway instance. For a real deployment we'd back this
// with Redis or check `authorizationState` on-chain before settling.
// ─────────────────────────────────────────────────────────

const globalForVerify = globalThis as unknown as {
  __wall402Nonces?: Set<string>;
};
const seenNonces =
  globalForVerify.__wall402Nonces ??
  (globalForVerify.__wall402Nonces = new Set<string>());

export function markNonceUsed(from: string, nonce: string): boolean {
  const key = `${from.toLowerCase()}:${nonce.toLowerCase()}`;
  if (seenNonces.has(key)) return false;
  seenNonces.add(key);
  return true;
}
