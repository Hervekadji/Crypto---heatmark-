// swingZones.ts
// Détection des swing highs/lows et regroupement en zones de support/résistance

import { Candle } from "./volumeSpike";

export interface SwingPoint {
  time: number;
  price: number;
  type: "high" | "low";
}

export interface Zone {
  type: "support" | "resistance";
  priceMin: number;
  priceMax: number;
  priceAvg: number;
  touches: number;
}

/**
 * Détecte les swing highs/lows sur une série de bougies.
 * Un swing high = bougie dont le "high" est supérieur à celui de `lookback`
 * bougies avant et après. Idem pour swing low.
 */
export function detectSwingPoints(candles: Candle[], lookback: number = 3): SwingPoint[] {
  const points: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    const before = candles.slice(i - lookback, i);
    const after = candles.slice(i + 1, i + 1 + lookback);

    const isHigh =
      before.every((c) => c.high <= current.high) &&
      after.every((c) => c.high <= current.high);

    const isLow =
      before.every((c) => c.low >= current.low) &&
      after.every((c) => c.low >= current.low);

    if (isHigh) {
      points.push({ time: current.time, price: current.high, type: "high" });
    }
    if (isLow) {
      points.push({ time: current.time, price: current.low, type: "low" });
    }
  }

  return points;
}

/**
 * Regroupe les swing points proches en zones (tolérance en %)
 * Ex: tolerance = 0.3 => les niveaux à moins de 0.3% l'un de l'autre fusionnent
 */
export function clusterZones(points: SwingPoint[], tolerancePct: number = 0.3): Zone[] {
  const highs = points.filter((p) => p.type === "high").map((p) => p.price).sort((a, b) => a - b);
  const lows = points.filter((p) => p.type === "low").map((p) => p.price).sort((a, b) => a - b);

  const cluster = (prices: number[], zoneType: "resistance" | "support"): Zone[] => {
    const zones: Zone[] = [];
    let currentCluster: number[] = [];

    for (const price of prices) {
      if (currentCluster.length === 0) {
        currentCluster.push(price);
        continue;
      }
      const avg = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length;
      const diffPct = (Math.abs(price - avg) / avg) * 100;

      if (diffPct <= tolerancePct) {
        currentCluster.push(price);
      } else {
        zones.push({
          type: zoneType,
          priceMin: Math.min(...currentCluster),
          priceMax: Math.max(...currentCluster),
          priceAvg: avg,
          touches: currentCluster.length,
        });
        currentCluster = [price];
      }
    }

    if (currentCluster.length > 0) {
      const avg = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length;
      zones.push({
        type: zoneType,
        priceMin: Math.min(...currentCluster),
        priceMax: Math.max(...currentCluster),
        priceAvg: avg,
        touches: currentCluster.length,
      });
    }

    return zones;
  };

  const resistanceZones = cluster(highs, "resistance");
  const supportZones = cluster(lows, "support");

  // On garde uniquement les zones touchées au moins 2 fois (plus fiables)
  return [...supportZones, ...resistanceZones]
    .filter((z) => z.touches >= 2)
    .sort((a, b) => b.touches - a.touches);
}
