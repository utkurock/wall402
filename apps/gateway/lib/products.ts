/**
 * wall402 — Real product catalog.
 *
 * Each product fetches live market data from the onchainos CLI,
 * computes technical indicators, and (when GEMINI_API_KEY is set)
 * sends the data to Gemini for an AI-powered trading analysis.
 *
 * Products:
 *   - AI Trading Signal   → live OHLC + RSI/MA + Gemini long/short analysis
 *   - Token Security Scan → real onchainos security token-scan
 *   - Market Overview     → live multi-asset prices + trends
 */

import { spawnSync } from "node:child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";

const ONCHAINOS = process.env.ONCHAINOS_CLI ?? "onchainos";

// ─── CLI helper ──────────────────────────────────────────

function cli(
  args: string[],
  timeout = 15_000,
): { ok: boolean; data?: unknown; error?: string } {
  const r = spawnSync(ONCHAINOS, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
  if (r.error) return { ok: false, error: (r.error as Error).message };
  try {
    const p = JSON.parse(r.stdout || "{}");
    return p.ok === false
      ? { ok: false, error: p.error ?? "cli error" }
      : { ok: true, data: p.data ?? p };
  } catch {
    return r.status === 0
      ? { ok: true, data: r.stdout }
      : { ok: false, error: r.stderr || `exit ${r.status}` };
  }
}

// ─── Technical indicators ────────────────────────────────

type Candle = { o: string; h: string; l: string; c: string; vol: string; ts: string };

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeIndicators(candles: Candle[]) {
  const closes = candles.map((c) => parseFloat(c.c));
  const volumes = candles.map((c) => parseFloat(c.vol));
  const latest = closes[closes.length - 1];

  const rsi14 = computeRSI(closes, 14);
  const ma20 = Math.round(sma(closes, 20) * 100) / 100;
  const ma50 = Math.round(sma(closes, Math.min(50, closes.length)) * 100) / 100;

  const recentVol = sma(volumes.slice(-5), 5);
  const olderVol = sma(volumes.slice(-20, -5), 15);
  const volumeTrend =
    recentVol > olderVol * 1.2
      ? "increasing"
      : recentVol < olderVol * 0.8
        ? "decreasing"
        : "stable";

  const change24h =
    candles.length >= 24
      ? Math.round(((latest - parseFloat(candles[candles.length - 24].c)) / parseFloat(candles[candles.length - 24].c)) * 10000) / 100
      : null;

  // MACD (12, 26, 9)
  function ema(values: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const result: number[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
      result.push(values[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = Math.round((ema12[ema12.length - 1] - ema26[ema26.length - 1]) * 10000) / 10000;
  const macdHistory = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdHistory, 9);
  const macdHistogram = Math.round((macdLine - signalLine[signalLine.length - 1]) * 10000) / 10000;
  const macdSignal = macdHistogram > 0 ? "bullish" : "bearish";

  return { price: latest, rsi14, ma20, ma50, volumeTrend, change24h, macd: macdLine, macdHistogram, macdSignal };
}

// ─── Gemini AI analysis ──────────────────────────────────

async function geminiAnalysis(
  asset: string,
  indicators: ReturnType<typeof computeIndicators>,
  candles: Candle[],
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return `Technical summary: RSI ${indicators.rsi14}, price ${indicators.price > indicators.ma20 ? "above" : "below"} MA20 (${indicators.ma20}), volume ${indicators.volumeTrend}. ${indicators.rsi14 < 30 ? "Oversold territory — potential bounce." : indicators.rsi14 > 70 ? "Overbought — caution advised." : "Neutral momentum."}`;
  }

  const genai = new GoogleGenerativeAI(key);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

  const last10 = candles.slice(-10).map((c) => ({
    time: new Date(parseInt(c.ts)).toISOString(),
    o: parseFloat(c.o).toFixed(2),
    h: parseFloat(c.h).toFixed(2),
    l: parseFloat(c.l).toFixed(2),
    c: parseFloat(c.c).toFixed(2),
    vol: parseFloat(c.vol).toFixed(2),
  }));

  const prompt = `You are a concise crypto trading analyst. Analyze this ${asset} data and give a 2-3 sentence trading insight with a clear LONG or SHORT bias.

Price: $${indicators.price}
RSI(14): ${indicators.rsi14}
MA20: $${indicators.ma20}
MA50: $${indicators.ma50}
Volume trend: ${indicators.volumeTrend}
24h change: ${indicators.change24h ?? "N/A"}%

Recent 1H candles (last 10):
${JSON.stringify(last10)}

Reply with ONLY the analysis, no markdown, no headers. Start with "LONG:" or "SHORT:" followed by your reasoning.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    return `AI analysis unavailable: ${(err as Error).message}. Fallback: RSI ${indicators.rsi14}, MA20 ${indicators.ma20}, volume ${indicators.volumeTrend}.`;
  }
}

// ─── Product definitions ─────────────────────────────────

export type Product = {
  upstreamUrl: string;
  label: string;
  kind: string;
  priceAmount: string;
  generate: (query?: string) => Promise<Record<string, unknown>>;
  summarize: (body: Record<string, unknown>) => string;
};

const ASSETS: Record<string, { address: string; chain: string; symbol: string }> = {
  OKB: { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", chain: "xlayer", symbol: "OKB" },
  BTC: { address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", chain: "ethereum", symbol: "WBTC" },
  ETH: { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", chain: "ethereum", symbol: "ETH" },
};

// ── Product 1: AI Trading Signal ─────────────────────────

const SIGNAL_ASSETS = ["OKB", "BTC", "ETH"];
let signalRotation = 0;

const AI_SIGNAL: Product = {
  upstreamUrl: "internal://product/ai-signal",
  label: "AI Trading Signal",
  kind: "signal",
  priceAmount: "10000", // 0.01 USDG
  generate: async (query?: string) => {
    // If user specified an asset (OKB, BTC, ETH), use it; otherwise rotate
    const assetKey = (query && ASSETS[query.toUpperCase()]) ? query.toUpperCase() : SIGNAL_ASSETS[signalRotation % SIGNAL_ASSETS.length];
    if (!query) signalRotation++;
    const asset = ASSETS[assetKey];

    // Fetch real OHLC data
    const klineRes = cli([
      "market", "kline",
      "--address", asset.address,
      "--chain", asset.chain,
      "--bar", "1H",
      "--limit", "100",
    ]);

    if (!klineRes.ok || !Array.isArray(klineRes.data)) {
      return {
        product: "ai-trading-signal",
        asset: assetKey,
        error: "market_data_unavailable",
        reason: klineRes.error ?? "failed to fetch candles",
        dataSource: "onchainos market kline",
        generatedAt: new Date().toISOString(),
      };
    }

    const candles = klineRes.data as Candle[];
    const indicators = computeIndicators(candles);
    const aiAnalysis = await geminiAnalysis(assetKey, indicators, candles);

    // Derive signal from indicators + AI
    const isLong = aiAnalysis.toUpperCase().startsWith("LONG");
    const signal = isLong ? "LONG" : "SHORT";
    const entry = indicators.price;
    const target = isLong
      ? Math.round(entry * 1.05 * 100) / 100
      : Math.round(entry * 0.95 * 100) / 100;
    const stop = isLong
      ? Math.round(entry * 0.97 * 100) / 100
      : Math.round(entry * 1.03 * 100) / 100;

    return {
      product: "ai-trading-signal",
      asset: assetKey,
      price: indicators.price,
      signal,
      entry,
      target,
      stop,
      indicators: {
        rsi14: indicators.rsi14,
        ma20: indicators.ma20,
        ma50: indicators.ma50,
        macd: indicators.macd,
        macdHistogram: indicators.macdHistogram,
        macdSignal: indicators.macdSignal,
        volumeTrend: indicators.volumeTrend,
        change24h: indicators.change24h,
      },
      aiAnalysis,
      dataSource: "X Layer DEX · real-time via onchainos",
      generatedAt: new Date().toISOString(),
    };
  },
  summarize: (b) =>
    `${b.signal} ${b.asset} @ $${b.entry} → $${b.target} (RSI ${(b.indicators as Record<string,unknown>)?.rsi14 ?? "?"})`,
};

// ── Product 2: Token Security Scan ───────────────────────

const SECURITY_SCAN: Product = {
  upstreamUrl: "internal://product/security-scan",
  label: "Token Security Scan",
  kind: "security",
  priceAmount: "20000", // 0.02 USDG
  generate: async (query?: string) => {
    // If user specified a token address, scan that; otherwise scan defaults
    const tokens = query && /^0x[a-fA-F0-9]{40}$/.test(query)
      ? [`196:${query}`]
      : [
          "196:0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",  // USDG
          "196:0x779ded0c9e1022225f8e0630b35a9b54be713736",  // USDT
          "196:0xe538905cf8410324e03a5a23c1c177a474d59b2b",  // WOKB
        ];

    const res = cli([
      "security", "token-scan",
      "--chain", "xlayer",
      "--tokens", tokens.join(","),
    ]);

    return {
      product: "token-security-scan",
      chain: "X Layer (196)",
      tokensScanned: tokens.length,
      scan: res.ok ? res.data : null,
      error: res.ok ? undefined : res.error,
      dataSource: "OKX Security API · real-time",
      generatedAt: new Date().toISOString(),
    };
  },
  summarize: (b) => {
    const count = (b.tokensScanned as number) ?? 0;
    const safe = b.scan ? "clean" : "scan failed";
    return `${count} tokens scanned · ${safe}`;
  },
};

// ── Product 3: Market Overview ───────────────────────────

const MARKET_OVERVIEW: Product = {
  upstreamUrl: "internal://product/market-overview",
  label: "Market Overview",
  kind: "market",
  priceAmount: "15000", // 0.015 USDG
  generate: async (_query?: string) => {
    const results: Record<string, unknown> = {};

    for (const [name, asset] of Object.entries(ASSETS)) {
      const kline = cli([
        "market", "kline",
        "--address", asset.address,
        "--chain", asset.chain,
        "--bar", "1H",
        "--limit", "50",
      ]);

      if (kline.ok && Array.isArray(kline.data)) {
        const candles = kline.data as Candle[];
        const ind = computeIndicators(candles);
        results[name] = {
          price: ind.price,
          rsi14: ind.rsi14,
          ma20: ind.ma20,
          volumeTrend: ind.volumeTrend,
          change24h: ind.change24h,
          bias: ind.rsi14 < 35 ? "oversold" : ind.rsi14 > 65 ? "overbought" : "neutral",
        };
      } else {
        results[name] = { error: kline.error ?? "unavailable" };
      }
    }

    return {
      product: "market-overview",
      assets: results,
      dataSource: "X Layer DEX · real-time via onchainos",
      generatedAt: new Date().toISOString(),
    };
  },
  summarize: (b) => {
    const assets = b.assets as Record<string, Record<string, unknown>>;
    const parts = Object.entries(assets)
      .filter(([, v]) => v.price)
      .map(([k, v]) => `${k} $${v.price}`)
      .slice(0, 3);
    return parts.join(" · ");
  },
};

// ── Product 4: Wallet Intelligence Report ────────────────

const SAMPLE_WALLETS = [
  { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", chain: "ethereum", label: "vitalik.eth" },
  { address: "0x254c3699cc099b71df58a719984c4c8cb1034d55", chain: "xlayer", label: "wall402 deployer" },
  { address: "0x28C6c06298d514Db089934071355E5743bf21d60", chain: "ethereum", label: "Binance Hot Wallet" },
];
let walletRotation = 0;

const WALLET_INTEL: Product = {
  upstreamUrl: "internal://product/wallet-intel",
  label: "Wallet Intelligence",
  kind: "wallet",
  priceAmount: "25000", // 0.025 USDG
  generate: async (query?: string) => {
    // If user specified an address, analyze that; otherwise rotate samples
    const wallet = (query && /^0x[a-fA-F0-9]{40}$/.test(query))
      ? { address: query, chain: "ethereum", label: query.slice(0, 10) + "..." }
      : SAMPLE_WALLETS[walletRotation % SAMPLE_WALLETS.length];
    if (!query) walletRotation++;

    // Multi-chain scan — EVM address is same across chains
    const SCAN_CHAINS = ["ethereum", "bsc", "polygon", "arbitrum", "base", "xlayer"];
    const chainResults: Record<string, { overview: unknown; hasTx: boolean }> = {};

    for (const chain of SCAN_CHAINS) {
      const res = cli([
        "market", "portfolio-overview",
        "--address", wallet.address,
        "--chain", chain,
        "--time-frame", "5",
      ]);
      const data = res.ok ? (res.data as Record<string, unknown>) : null;
      const txCount = parseInt(String(data?.totalTxCount ?? data?.buyTxCount ?? "0"), 10);
      chainResults[chain] = { overview: data, hasTx: txCount > 0 };
    }

    // Use the chain with most activity for primary stats
    const primaryChain = Object.entries(chainResults)
      .filter(([, v]) => v.hasTx)
      .sort((a, b) => {
        const aTx = parseInt(String((a[1].overview as Record<string, unknown>)?.totalTxCount ?? "0"), 10);
        const bTx = parseInt(String((b[1].overview as Record<string, unknown>)?.totalTxCount ?? "0"), 10);
        return bTx - aTx;
      })[0]?.[0] ?? wallet.chain;

    const overview = { ok: true, data: chainResults[primaryChain]?.overview };
    const activeChains = Object.entries(chainResults).filter(([, v]) => v.hasTx).map(([c]) => c);

    // Fetch recent PnL per token from primary chain
    const pnl = cli([
      "market", "portfolio-recent-pnl",
      "--address", wallet.address,
      "--chain", primaryChain,
      "--limit", "10",
    ]);

    // Fetch DEX trade history for hold time analysis
    const now = Date.now();
    const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000;
    const history = cli([
      "market", "portfolio-dex-history",
      "--address", wallet.address,
      "--chain", wallet.chain,
      "--begin", String(threeMonthsAgo),
      "--end", String(now),
      "--limit", "50",
    ]);

    // Security scan on wallet's tokens
    const security = cli([
      "security", "token-scan",
      "--address", wallet.address,
      "--chain", wallet.chain,
    ]);

    const overviewData = overview.ok ? overview.data as Record<string, unknown> : null;
    const pnlData = pnl.ok ? pnl.data : null;
    const securityData = security.ok ? security.data : null;
    const historyData = history.ok && Array.isArray(history.data) ? history.data as Record<string, unknown>[] : [];

    // Compute hold times: for each token, find buy→sell pairs and compute duration
    const holdTimes: { token: string; avgHoldHours: number; trades: number }[] = [];
    const buysByToken = new Map<string, number[]>();
    for (const tx of historyData) {
      const token = String(tx.tokenSymbol ?? tx.tokenAddress ?? "unknown");
      const ts = parseInt(String(tx.timeStamp ?? tx.blockTime ?? "0"), 10);
      const type = String(tx.txType ?? tx.side ?? "");
      if (type === "1" || type.toLowerCase() === "buy") {
        if (!buysByToken.has(token)) buysByToken.set(token, []);
        buysByToken.get(token)!.push(ts);
      } else if (type === "2" || type.toLowerCase() === "sell") {
        const buys = buysByToken.get(token);
        if (buys && buys.length > 0) {
          const buyTs = buys.shift()!;
          const holdMs = (ts - buyTs) * (ts > 1e12 ? 1 : 1000); // handle ms vs s
          const holdHours = Math.round(holdMs / 3600000);
          const existing = holdTimes.find((h) => h.token === token);
          if (existing) {
            existing.avgHoldHours = Math.round((existing.avgHoldHours * existing.trades + holdHours) / (existing.trades + 1));
            existing.trades++;
          } else {
            holdTimes.push({ token, avgHoldHours: holdHours, trades: 1 });
          }
        }
      }
    }

    // Compute trust score based on available data
    const winRate = parseFloat(String(overviewData?.winRate ?? "0"));
    const totalTx = parseInt(String(overviewData?.totalTxCount ?? overviewData?.buyTxCount ?? "0"), 10);
    const realizedPnl = parseFloat(String(overviewData?.realizedPnlUsd ?? "0"));
    const riskyTokens = Array.isArray(securityData)
      ? securityData.filter((t: Record<string, unknown>) => t.isHoneypot || t.isRiskToken).length
      : 0;
    const totalTokens = Array.isArray(securityData) ? securityData.length : 0;

    // Trust score: wallets with no/low OKX DEX activity default to "safe" (75)
    // since lack of DEX trading doesn't indicate risk
    let trustScore = 75; // default: safe baseline
    if (totalTx > 0) {
      // Has OKX DEX activity — adjust based on performance
      trustScore = 60; // active trader baseline
      if (winRate > 0.5) trustScore += 10;
      if (winRate > 0.7) trustScore += 10;
      if (totalTx > 50) trustScore += 5;
      if (realizedPnl > 0) trustScore += 5;
    }
    if (riskyTokens === 0 && totalTokens > 0) trustScore += 5;
    if (riskyTokens > 0) trustScore -= riskyTokens * 15;
    trustScore = Math.max(0, Math.min(100, trustScore));

    const verdict =
      trustScore >= 80 ? "highly trusted" :
      trustScore >= 60 ? "trusted" :
      trustScore >= 40 ? "neutral" :
      trustScore >= 20 ? "caution" : "high risk";

    // AI analysis if available
    let aiSummary: string | undefined;
    const key = process.env.GEMINI_API_KEY;
    if (key && overviewData) {
      try {
        const genai = new GoogleGenerativeAI(key);
        const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `You are a blockchain wallet analyst. Give a 2-3 sentence summary of this wallet's trading behavior and risk profile.

Address: ${wallet.address} (${wallet.label})
Chain: ${wallet.chain}
Win rate: ${winRate}
Total transactions: ${totalTx}
Realized PnL: $${realizedPnl}
Buy volume: $${overviewData.buyTxVolume}
Sell volume: $${overviewData.sellTxVolume}
Risky tokens held: ${riskyTokens}/${totalTokens}
Trust score: ${trustScore}/100

Reply with ONLY the analysis, no markdown.`;
        const result = await model.generateContent(prompt);
        aiSummary = result.response.text().trim();
      } catch {
        /* skip AI if unavailable */
      }
    }

    return {
      product: "wallet-intelligence",
      address: wallet.address,
      label: wallet.label,
      chain: primaryChain,
      chainsScanned: SCAN_CHAINS,
      activeChains,
      trustScore,
      verdict,
      stats: {
        winRate: Math.round(winRate * 100) + "%",
        totalTransactions: totalTx,
        realizedPnlUsd: realizedPnl,
        unrealizedPnlUsd: parseFloat(String(overviewData?.unrealizedPnlUsd ?? "0")),
        buyVolume: parseFloat(String(overviewData?.buyTxVolume ?? "0")),
        sellVolume: parseFloat(String(overviewData?.sellTxVolume ?? "0")),
      },
      tokenSecurity: {
        totalScanned: totalTokens,
        riskyTokens,
        clean: totalTokens - riskyTokens,
      },
      holdTimes: holdTimes.length > 0 ? holdTimes : null,
      tradeCount: historyData.length,
      recentPnl: pnlData,
      aiSummary: aiSummary ?? `Trust score ${trustScore}/100 (${verdict}). Win rate ${Math.round(winRate * 100)}% across ${totalTx} transactions.`,
      tier: "paid" as const,
      dataSource: "OKX DEX data · on-chain balance via RPC · security via OKX API",
      generatedAt: new Date().toISOString(),
    };
  },
  summarize: (b) =>
    `${b.label ?? String(b.address).slice(0, 10) + "..."} · trust ${b.trustScore}/100 (${b.verdict})`,
};

// ── Product 5: Smart Money Alerts ────────────────────────

const SMART_MONEY: Product = {
  upstreamUrl: "internal://product/smart-money",
  label: "Smart Money Alerts",
  kind: "alpha",
  priceAmount: "15000", // 0.015 USDG
  generate: async (query?: string) => {
    const chain = query ?? "ethereum";

    // Fetch smart money / whale signals
    const signals = cli([
      "signal", "list",
      "--chain", chain,
      "--wallet-type", "1,3", // Smart Money + Whales
      "--min-amount-usd", "5000",
    ]);

    // Fetch trending tokens
    const trending = cli([
      "token", "hot-tokens",
      "--chain", chain,
      "--time-frame", "4", // 24h
      "--risk-filter", "true",
    ]);

    const signalData = signals.ok && Array.isArray(signals.data) ? signals.data as Record<string, unknown>[] : [];
    const trendingRaw = trending.ok ? trending.data as Record<string, unknown> : {};
    const trendingList = (Array.isArray(trendingRaw) ? trendingRaw : (trendingRaw.data as Record<string, unknown>[] ?? [])).slice(0, 10);

    // Compute summary stats
    const totalSignalVolume = signalData.reduce((sum, s) => sum + parseFloat(String(s.amountUsd ?? "0")), 0);
    const buySignals = signalData.filter(s => parseFloat(String(s.soldRatioPercent ?? "100")) < 50).length;
    const sellSignals = signalData.length - buySignals;

    // AI summary if available
    let aiSummary: string | undefined;
    const key = process.env.GEMINI_API_KEY;
    if (key && signalData.length > 0) {
      try {
        const genai = new GoogleGenerativeAI(key);
        const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
        const topSignals = signalData.slice(0, 5).map(s => ({
          amount: "$" + Math.round(parseFloat(String(s.amountUsd ?? "0"))).toLocaleString(),
          token: (s.token as Record<string, unknown>)?.tokenSymbol ?? "unknown",
          soldRatio: s.soldRatioPercent + "%",
        }));
        const topTrending = trendingList.slice(0, 5).map(t => ({
          symbol: t.tokenSymbol ?? t.symbol,
          price: "$" + parseFloat(String(t.price ?? "0")).toFixed(4),
          volume: "$" + Math.round(parseFloat(String(t.volume ?? "0"))).toLocaleString(),
        }));
        const prompt = `You are a crypto alpha analyst. Summarize this smart money activity in 2-3 sentences.

Smart money signals (${chain}): ${JSON.stringify(topSignals)}
Trending tokens: ${JSON.stringify(topTrending)}
Total signal volume: $${Math.round(totalSignalVolume).toLocaleString()}
Buy pressure: ${buySignals} buys vs ${sellSignals} sells

Reply with ONLY the analysis. Start with the market sentiment (bullish/bearish/mixed).`;
        const result = await model.generateContent(prompt);
        aiSummary = result.response.text().trim();
      } catch { /* skip */ }
    }

    return {
      product: "smart-money-alerts",
      chain,
      signals: {
        total: signalData.length,
        totalVolumeUsd: Math.round(totalSignalVolume),
        buyPressure: buySignals,
        sellPressure: sellSignals,
        top: signalData.slice(0, 8).map(s => ({
          token: (s.token as Record<string, unknown>)?.tokenSymbol ?? "?",
          logo: (s.token as Record<string, unknown>)?.logo,
          amountUsd: Math.round(parseFloat(String(s.amountUsd ?? "0"))),
          soldRatio: parseFloat(String(s.soldRatioPercent ?? "0")),
          holders: (s.token as Record<string, unknown>)?.holders,
          price: parseFloat(String(s.price ?? "0")),
          timestamp: s.timestamp,
        })),
      },
      trending: trendingList.slice(0, 8).map(t => ({
        symbol: t.tokenSymbol ?? t.symbol,
        price: parseFloat(String(t.price ?? "0")),
        volume: parseFloat(String(t.volume ?? "0")),
        marketCap: parseFloat(String(t.marketCap ?? "0")),
        holders: parseInt(String(t.holders ?? "0"), 10),
        liquidity: parseFloat(String(t.liquidity ?? "0")),
      })),
      aiSummary: aiSummary ?? `${signalData.length} smart money signals detected on ${chain}. Total volume $${Math.round(totalSignalVolume).toLocaleString()}. ${buySignals > sellSignals ? "Buy pressure dominant." : "Sell pressure dominant."}`,
      dataSource: "OKX Signal API + Token API · real-time",
      generatedAt: new Date().toISOString(),
    };
  },
  summarize: (b) => {
    const sig = b.signals as Record<string, unknown>;
    return `${sig?.total ?? 0} signals · $${(sig?.totalVolumeUsd ?? 0).toLocaleString()} volume · ${b.chain}`;
  },
};

// ─── Exports ─────────────────────────────────────────────

export const PRODUCTS: Product[] = [AI_SIGNAL, SECURITY_SCAN, MARKET_OVERVIEW, WALLET_INTEL, SMART_MONEY];

export function findProductByUpstream(url: string): Product | undefined {
  return PRODUCTS.find((p) => p.upstreamUrl === url);
}
