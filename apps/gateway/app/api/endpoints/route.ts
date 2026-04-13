import { NextResponse } from "next/server";
import {
  listEndpoints,
  registerEndpoint,
  type NewEndpointInput,
} from "@/lib/registry";

/**
 * Dashboard + MCP server read this to discover what's available.
 * POST creates a new endpoint (no auth for the MVP — would gate on a
 * creator signature in production).
 */

export async function GET() {
  return NextResponse.json({ endpoints: listEndpoints() });
}

export async function POST(req: Request) {
  let input: NewEndpointInput;
  try {
    input = (await req.json()) as NewEndpointInput;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!input.creatorWallet || !input.upstreamUrl || !input.priceAmount) {
    return NextResponse.json(
      { error: "missing_fields", required: ["creatorWallet", "upstreamUrl", "priceAmount"] },
      { status: 400 },
    );
  }

  const endpoint = registerEndpoint({
    creatorWallet: input.creatorWallet,
    upstreamUrl: input.upstreamUrl,
    label: input.label ?? "Untitled endpoint",
    priceAmount: input.priceAmount,
    priceToken: input.priceToken ?? "USDG",
    network: input.network ?? "mainnet",
    rateLimitPerMin: input.rateLimitPerMin,
  });

  return NextResponse.json({ endpoint }, { status: 201 });
}
