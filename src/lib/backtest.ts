export type BacktestCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type BacktestResult = {
  totalSignals: number;
  achatCount: number;
  achatWinRate: number;
  venteCount: number;
  venteWinRate: number;
  neutreCount: number;
};

export async function fetchHistoricalKlines(
  symbol: string,
  interval: string,
  limit = 500
): Promise<BacktestCandle[]> {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  const data = await res.json();
  return data.map((d: any) => ({
    time: d[0] / 1000,
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
  }));
}

export async function fetchHistoricalFunding(
  symbol: string,
  limit = 200
): Promise<{ time: number; rate: number }[]> {
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=${limit}`
  );
  const data = await res.json();
  return data.map((d: any) => ({
    time: d.fundingTime / 1000,
    rate: parseFloat(d.fundingRate),
  }));
}

// Version simplifiée du signal pour le backtest : zones = swing high/low
// glissants, clusters = biais basé sur le funding rate historique le plus proche
function nearestFunding(
  fundingHistory: { time: number; rate: number }[],
  time: number
): number {
  let closest = 0;
  let minDiff = Infinity;
  for (const f of fundingHistory) {
    const diff = Math.abs(f.time - time);
    if (diff < minDiff) {
      minDiff = diff;
      closest = f.rate;
    }
  }
  return closest;
}

export function runBacktest(
  candles: BacktestCandle[],
  fundingHistory: { time: number; rate: number }[],
  lookbackZone = 20,
  lookaheadCandles = 5,
  moveThresholdPct = 0.003
): BacktestResult {
  let achatCount = 0;
  let achatWins = 0;
  let venteCount = 0;
  let venteWins = 0;
  let neutreCount = 0;

  for (let i = lookbackZone; i < candles.length - lookaheadCandles; i++) {
    const window = candles.slice(i - lookbackZone, i);
    const current = candles[i];
    const swingHigh = Math.max(...window.map((c) => c.high));
    const swingLow = Math.min(...window.map((c) => c.low));
    const funding = nearestFunding(fundingHistory, current.time);

    const closeThreshold = 0.004;
    const distToHigh = (swingHigh - current.close) / current.close;
    const distToLow = (current.close - swingLow) / current.close;

    let signal: "achat" | "vente" | "neutre" = "neutre";

    // Funding très positif = marché crowded long -> proche d'un support pris,
    // risque de continuation baissière ; inverse pour funding négatif
    if (distToLow < closeThreshold && funding > 0.0005) {
      signal = "vente";
    } else if (distToHigh < closeThreshold && funding < -0.0005) {
      signal = "achat";
    }

    if (signal === "neutre") {
      neutreCount++;
      continue;
    }

    const future = candles[i + lookaheadCandles];
    const change = (future.close - current.close) / current.close;

    if (signal === "achat") {
      achatCount++;
      if (change > moveThresholdPct) achatWins++;
    } else {
      venteCount++;
      if (change < -moveThresholdPct) venteWins++;
    }
  }

  return {
    totalSignals: achatCount + venteCount,
    achatCount,
    achatWinRate: achatCount > 0 ? Math.round((achatWins / achatCount) * 100) : 0,
    venteCount,
    venteWinRate: venteCount > 0 ? Math.round((venteWins / venteCount) * 100) : 0,
    neutreCount,
  };
}
