import type { PaymentReceipt } from "@wall402/core";
import { supabase } from "./supabase";

/**
 * Audit log backed by Supabase.
 * Falls back to in-memory if Supabase is unavailable.
 */

// In-memory fallback
const globalForAudit = globalThis as unknown as {
  __wall402AuditLog?: PaymentReceipt[];
};
const memLog =
  globalForAudit.__wall402AuditLog ??
  (globalForAudit.__wall402AuditLog = []);

function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export async function appendReceipt(receipt: PaymentReceipt): Promise<void> {
  // Always keep in-memory copy
  memLog.push(receipt);

  if (!isSupabaseConfigured()) return;

  try {
    await supabase.from("receipts").insert({
      endpoint_id: receipt.endpointId,
      endpoint_label: receipt.endpointLabel,
      product_kind: receipt.productKind,
      tx_hash: receipt.txHash,
      payer: receipt.payer,
      recipient: receipt.recipient,
      amount: receipt.amount,
      token: receipt.token,
      network: receipt.network,
      settled_at: receipt.settledAt,
      result_summary: receipt.resultSummary,
      upstream_body: receipt.upstreamBody,
    });
  } catch (err) {
    console.error("supabase insert failed:", err);
  }
}

export async function listReceipts(opts?: {
  endpointId?: string;
  payer?: string;
  limit?: number;
}): Promise<PaymentReceipt[]> {
  if (!isSupabaseConfigured()) {
    return listReceiptsMemory(opts);
  }

  try {
    let query = supabase
      .from("receipts")
      .select("*")
      .order("settled_at", { ascending: false })
      .limit(opts?.limit ?? 50);

    if (opts?.endpointId) query = query.eq("endpoint_id", opts.endpointId);
    if (opts?.payer) query = query.ilike("payer", opts.payer);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map(dbToReceipt);
  } catch {
    return listReceiptsMemory(opts);
  }
}

export async function stats(): Promise<{
  totalCalls: number;
  totalVolume: Record<string, string>;
  uniquePayers?: number;
}> {
  if (!isSupabaseConfigured()) {
    return statsMemory();
  }

  try {
    const { data, error } = await supabase
      .from("receipt_stats")
      .select("*")
      .single();

    if (error) throw error;

    return {
      totalCalls: data?.total_calls ?? 0,
      totalVolume: { USDG: String(data?.total_volume_raw ?? "0") },
      uniquePayers: data?.unique_payers ?? 0,
    };
  } catch {
    return statsMemory();
  }
}

// ─── In-memory fallback ──────────────────────────────────

function listReceiptsMemory(opts?: {
  endpointId?: string;
  payer?: string;
  limit?: number;
}): PaymentReceipt[] {
  let out = memLog.slice().reverse();
  if (opts?.endpointId) out = out.filter((r) => r.endpointId === opts.endpointId);
  if (opts?.payer) out = out.filter((r) => r.payer.toLowerCase() === opts.payer!.toLowerCase());
  if (opts?.limit) out = out.slice(0, opts.limit);
  return out;
}

function statsMemory(): {
  totalCalls: number;
  totalVolume: Record<string, string>;
} {
  const totalVolume: Record<string, bigint> = {};
  for (const r of memLog) {
    totalVolume[r.token] = (totalVolume[r.token] ?? 0n) + BigInt(r.amount);
  }
  return {
    totalCalls: memLog.length,
    totalVolume: Object.fromEntries(
      Object.entries(totalVolume).map(([k, v]) => [k, v.toString()]),
    ),
  };
}

// ─── DB → Receipt mapper ─────────────────────────────────

function dbToReceipt(row: Record<string, unknown>): PaymentReceipt {
  return {
    endpointId: String(row.endpoint_id ?? ""),
    endpointLabel: String(row.endpoint_label ?? ""),
    productKind: row.product_kind ? String(row.product_kind) : undefined,
    txHash: String(row.tx_hash ?? ""),
    payer: String(row.payer ?? ""),
    recipient: String(row.recipient ?? ""),
    amount: String(row.amount ?? "0"),
    token: String(row.token ?? "USDG"),
    network: (row.network as "mainnet" | "testnet") ?? "mainnet",
    settledAt: String(row.settled_at ?? new Date().toISOString()),
    resultSummary: row.result_summary ? String(row.result_summary) : undefined,
    upstreamBody: row.upstream_body,
  };
}
