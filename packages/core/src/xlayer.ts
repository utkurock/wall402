import { defineChain } from "viem";

// ─────────────────────────────────────────────────────────
// X Layer chain definitions for viem
// ─────────────────────────────────────────────────────────

export const xLayerMainnet = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.xlayer.tech"] },
    public: { http: ["https://xlayerrpc.okx.com"] },
  },
  blockExplorers: {
    default: {
      name: "OKX X Layer Explorer",
      url: "https://www.okx.com/web3/explorer/xlayer",
    },
  },
});

export const xLayerTestnet = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testrpc.xlayer.tech/terigon"] },
    public: { http: ["https://xlayertestrpc.okx.com/terigon"] },
  },
  blockExplorers: {
    default: {
      name: "OKX X Layer Testnet Explorer",
      url: "https://www.okx.com/web3/explorer/xlayer-test",
    },
  },
  testnet: true,
});

// ─────────────────────────────────────────────────────────
// Known settlement tokens on X Layer
// ─────────────────────────────────────────────────────────

/**
 * USDG on X Layer mainnet — EIP-3009 enabled, zero-gas transfers via x402.
 * Decimals: 6.
 * Source: okx-x402-payment SKILL.md example payload.
 */
export const USDG_XLAYER_MAINNET =
  "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" as const;

export const STABLE_TOKEN_DECIMALS = 6;

/**
 * Minimal EIP-3009 ABI subset used by wall402 for settlement.
 *
 * transferWithAuthorization lets a third party (our gateway) submit a token
 * transfer that was signed off-chain by the payer. On X Layer, this settles
 * with zero gas for USDG/USDT.
 */
export const EIP3009_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "authorizationState",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
