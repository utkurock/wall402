import { z } from "zod";

/**
 * Typed access to environment variables. Loaded lazily so tests can override.
 */
const Env = z.object({
  XLAYER_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),
  XLAYER_MAINNET_RPC: z.string().url().default("https://rpc.xlayer.tech"),
  XLAYER_TESTNET_RPC: z
    .string()
    .url()
    .default("https://testrpc.xlayer.tech/terigon"),
  AGENTIC_WALLET_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0x254c3699cc099b71df58a719984c4c8cb1034d55"),
  SETTLEMENT_TOKEN: z.string().default("USDG"),
  SETTLEMENT_TOKEN_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"),
  SETTLEMENT_TOKEN_DECIMALS: z.coerce.number().int().default(6),
  /**
   * EIP-712 domain `name` field of the settlement token contract.
   * This MUST match what the token contract reports on-chain (the TEE
   * signer reads it from the contract and will reject challenges that
   * advertise a different name). For USDG on X Layer this is
   * "Global Dollar" — not the token symbol "USDG".
   */
  SETTLEMENT_TOKEN_DOMAIN_NAME: z.string().default("Global Dollar"),
  /**
   * EIP-712 domain `version` field. For USDG this is "1".
   */
  SETTLEMENT_TOKEN_DOMAIN_VERSION: z.string().default("1"),
  GATEWAY_PUBLIC_URL: z.string().url().default("http://localhost:3402"),
  /**
   * When `true`, the gateway records receipts but does NOT broadcast the
   * settlement tx — useful for local dev before the wallet has funds.
   * Set to `false` to enable live X Layer settlement.
   */
  WALL402_MOCK_SETTLEMENT: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /**
   * Path to the onchainos CLI binary.
   */
  ONCHAINOS_CLI: z.string().default("onchainos"),
});

export const env = Env.parse({
  XLAYER_NETWORK: process.env.XLAYER_NETWORK,
  XLAYER_MAINNET_RPC: process.env.XLAYER_MAINNET_RPC,
  XLAYER_TESTNET_RPC: process.env.XLAYER_TESTNET_RPC,
  AGENTIC_WALLET_ADDRESS: process.env.AGENTIC_WALLET_ADDRESS,
  SETTLEMENT_TOKEN: process.env.SETTLEMENT_TOKEN,
  SETTLEMENT_TOKEN_ADDRESS: process.env.SETTLEMENT_TOKEN_ADDRESS,
  SETTLEMENT_TOKEN_DECIMALS: process.env.SETTLEMENT_TOKEN_DECIMALS,
  SETTLEMENT_TOKEN_DOMAIN_NAME: process.env.SETTLEMENT_TOKEN_DOMAIN_NAME,
  SETTLEMENT_TOKEN_DOMAIN_VERSION: process.env.SETTLEMENT_TOKEN_DOMAIN_VERSION,
  GATEWAY_PUBLIC_URL: process.env.GATEWAY_PUBLIC_URL,
  WALL402_MOCK_SETTLEMENT: process.env.WALL402_MOCK_SETTLEMENT,
  ONCHAINOS_CLI: process.env.ONCHAINOS_CLI,
});

export type Env = typeof env;
