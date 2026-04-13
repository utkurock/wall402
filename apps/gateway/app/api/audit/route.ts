import { NextResponse } from "next/server";
import { listReceipts, stats } from "@/lib/audit";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const endpointId = url.searchParams.get("endpointId") ?? undefined;
  const payer = url.searchParams.get("payer") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "50");

  const [statsData, receipts] = await Promise.all([
    stats(),
    listReceipts({ endpointId, payer, limit }),
  ]);

  return NextResponse.json({ stats: statsData, receipts });
}
