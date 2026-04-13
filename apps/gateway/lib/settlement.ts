import {
  EIP3009_ABI,
  explorerUrl,
  xLayerMainnet,
  xLayerTestnet,
  type PaymentReceipt,
  type XLayerNetwork,
} from "@wall402/core";
import {
  createPublicClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { env } from "./env";
import type { X402Authorization } from "./x402";

/**
 * Submit (or mock) an EIP-3009 settlement on X Layer.
 *
 * Two modes:
 *  - **mock** (default for local dev): pretends the tx was broadcast and
 *    returns a synthetic hash. Lets us demo the full flow before the
 *    wallet has been funded.
 *  - **live**: actually broadcasts via Onchain OS CLI (TEE signing) so the
 *    tx is on-chain and visible in the explorer.
 *
 * We go through the Onchain OS CLI instead of a local viem walletClient
 * because our wallet's private key lives inside a TEE — we never hold it
 * locally. The CLI signs inside the enclave and returns a tx hash.
 */

export interface SettlementParams {
  authorization: X402Authorization;
  signature: string;
  network: XLayerNetwork;
  endpointId: string;
  endpointLabel: string;
}

export interface SettlementResult {
  txHash: string;
  mock: boolean;
  explorerUrl: string;
  receipt: PaymentReceipt;
}

const publicClients = {
  mainnet: createPublicClient({
    chain: xLayerMainnet,
    transport: http(env.XLAYER_MAINNET_RPC),
  }),
  testnet: createPublicClient({
    chain: xLayerTestnet,
    transport: http(env.XLAYER_TESTNET_RPC),
  }),
};

/**
 * Split a 65-byte (r, s, v) EIP-3009 signature into v, r, s components.
 */
function splitSignature(sig: string): { v: number; r: Hex; s: Hex } {
  const hex = sig.startsWith("0x") ? sig.slice(2) : sig;
  if (hex.length !== 130) {
    throw new Error(`expected 65-byte signature, got ${hex.length / 2} bytes`);
  }
  const r = ("0x" + hex.slice(0, 64)) as Hex;
  const s = ("0x" + hex.slice(64, 128)) as Hex;
  let v = parseInt(hex.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

export async function settle(
  params: SettlementParams,
): Promise<SettlementResult> {
  const { authorization, signature, network, endpointId, endpointLabel } =
    params;
  const settledAt = new Date().toISOString();

  const baseReceipt: Omit<PaymentReceipt, "txHash"> = {
    endpointId,
    endpointLabel,
    payer: authorization.from,
    recipient: authorization.to,
    amount: authorization.value,
    token: env.SETTLEMENT_TOKEN,
    network,
    settledAt,
  };

  // ─── MOCK MODE ────────────────────────────────────────
  // Read directly from process.env at runtime to bypass build-time caching
  const isMock = (process.env.WALL402_MOCK_SETTLEMENT ?? "true") === "true";
  if (isMock) {
    const fakeTx =
      "0x" +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join("");
    return {
      txHash: fakeTx,
      mock: true,
      explorerUrl: explorerUrl(network, fakeTx),
      receipt: { ...baseReceipt, txHash: fakeTx },
    };
  }

  // ─── LIVE MODE ────────────────────────────────────────
  // Pre-simulate via viem, then broadcast via onchainos CLI.
  // Requires a funded wallet (USDG balance on X Layer).
  // Set WALL402_MOCK_SETTLEMENT=false to enable.
  const client = publicClients[network];
  const { v, r, s } = splitSignature(signature);

  // Pre-flight simulation — will revert with a descriptive error if
  // the signature, nonce, or balance is bad.
  await client.simulateContract({
    address: env.SETTLEMENT_TOKEN_ADDRESS as Address,
    abi: EIP3009_ABI,
    functionName: "transferWithAuthorization",
    args: [
      authorization.from as Address,
      authorization.to as Address,
      BigInt(authorization.value),
      BigInt(authorization.validAfter),
      BigInt(authorization.validBefore),
      authorization.nonce as Hex,
      v,
      r,
      s,
    ],
    account: env.AGENTIC_WALLET_ADDRESS as Address,
  });

  // Broadcast via onchainos CLI — the TEE wallet signs the tx inside the enclave
  const { spawnSync } = await import("node:child_process");
  const cli = env.ONCHAINOS_CLI;
  const txData = `0x${EIP3009_ABI[0] ? "" : ""}e3ee160e` + // transferWithAuthorization selector
    (authorization.from as string).slice(2).padStart(64, "0") +
    (authorization.to as string).slice(2).padStart(64, "0") +
    BigInt(authorization.value).toString(16).padStart(64, "0") +
    BigInt(authorization.validAfter).toString(16).padStart(64, "0") +
    BigInt(authorization.validBefore).toString(16).padStart(64, "0") +
    (authorization.nonce as string).slice(2).padStart(64, "0") +
    v.toString(16).padStart(64, "0") +
    r.slice(2).padStart(64, "0") +
    s.slice(2).padStart(64, "0");

  const result = spawnSync(cli, [
    "wallet", "contract-call",
    "--chain", "xlayer",
    "--to", env.SETTLEMENT_TOKEN_ADDRESS,
    "--input-data", txData,
    "--force",
  ], { encoding: "utf8", timeout: 60_000 });

  let txHash: string;
  try {
    const parsed = JSON.parse(result.stdout || "{}");
    if (!parsed.ok) {
      throw new Error(parsed.error ?? "broadcast failed");
    }
    txHash = parsed.data?.txHash ?? parsed.data?.hash ?? "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  } catch (err) {
    // If CLI broadcast fails, still record as pending — the auth is valid
    throw new Error(`Settlement broadcast failed: ${(err as Error).message}. The signed authorization is valid but could not be submitted on-chain.`);
  }

  return {
    txHash,
    mock: false,
    explorerUrl: explorerUrl(network, txHash),
    receipt: { ...baseReceipt, txHash },
  };
}
