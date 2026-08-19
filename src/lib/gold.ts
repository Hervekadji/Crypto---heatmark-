export type GoldCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const YF_INTERVAL: Record<string, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "4h": "60m",
};

function aggregateTo4h(candles: GoldCandle[]): GoldCandle[] {
  const bucketSeconds = 4 * 3600;
  const buckets = new Map<number, GoldCandle>();
  for (const c of candles) {
    const key = Math.floor(c.time / bucketSeconds) * bucketSeconds;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { ...c, time: key });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

export async function fetchGoldCandles(timeframe: string): Promise<GoldCandle[]> {
  const interval = YF_INTERVAL[timeframe] || "15m";
  const range = timeframe === "4h" ? "5d" : "2d";

  const res = await fetch(`/api/gold?interval=${interval}&range=${range}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};

  let candles: GoldCandle[] = timestamps
    .map((t, i) => ({
      time: t,
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i] || 0,
    }))
    .filter(
      (c) => c.open != null && c.high != null && c.low != null && c.close != null
    ) as GoldCandle[];

  if (timeframe === "4h") {
    candles = aggregateTo4h(candles);
  }
  return candles;
}
