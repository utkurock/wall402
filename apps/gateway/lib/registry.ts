import type { PaywallEndpoint } from "@wall402/core";
import { randomUUID } from "node:crypto";
import { PRODUCTS } from "./products";

/**
 * In-memory paywall endpoint registry.
 *
 * Next.js dev mode hot-reloads modules on every file change, which would
 * reset module-level state. We stash the store on `globalThis` so it
 * survives HMR cycles — the standard Next.js pattern for dev-time
 * singletons.
 */
const globalForRegistry = globalThis as unknown as {
  __wall402Registry?: Map<string, PaywallEndpoint>;
};
const store =
  globalForRegistry.__wall402Registry ??
  (globalForRegistry.__wall402Registry = new Map<string, PaywallEndpoint>());

export type NewEndpointInput = Omit<PaywallEndpoint, "id" | "createdAt">;

export function registerEndpoint(input: NewEndpointInput): PaywallEndpoint {
  const endpoint: PaywallEndpoint = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  store.set(endpoint.id, endpoint);
  return endpoint;
}

export function getEndpoint(id: string): PaywallEndpoint | undefined {
  return store.get(id);
}

export function listEndpoints(): PaywallEndpoint[] {
  return Array.from(store.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function deleteEndpoint(id: string): boolean {
  return store.delete(id);
}

// ─────────────────────────────────────────────────────────
// Seed: the demo product catalog — three distinct paywalled
// endpoints an agent would actually buy from (trading signal,
// wallet risk scan, concentrated LP range scan). Each has a
// different price and returns a different structured payload
// so the audit log shows recognizable variety.
// ─────────────────────────────────────────────────────────

const SEED_CREATOR =
  process.env.AGENTIC_WALLET_ADDRESS ??
  "0x254c3699cc099b71df58a719984c4c8cb1034d55";

// Idempotent seeding: drop any legacy demo endpoints whose upstream no
// longer exists in the current catalog (e.g. the old `internal://demo/quote`),
// then register any catalog products that are missing from the store.
// Survives Next.js HMR because the store lives on globalThis.
for (const [id, ep] of Array.from(store.entries())) {
  if (
    ep.upstreamUrl.startsWith("internal://demo/") &&
    !PRODUCTS.some((p) => p.upstreamUrl === ep.upstreamUrl)
  ) {
    store.delete(id);
  }
}
for (const product of PRODUCTS) {
  const existing = Array.from(store.values()).find(
    (e) => e.upstreamUrl === product.upstreamUrl,
  );
  if (!existing) {
    registerEndpoint({
      creatorWallet: SEED_CREATOR,
      upstreamUrl: product.upstreamUrl,
      label: product.label,
      priceAmount: product.priceAmount,
      priceToken: "USDG",
      network: "mainnet",
    });
  }
}
