import { OrderBookLevel } from "./binance";

export type Zone = { price: number; strength: number; side: "support" | "resistance" };
export type LiqCluster = { price: number; weight: number; side: "long" | "short" };
export type Signal = "achat" | "vente" | "neutre";
export type Candle = { high: number; low: number };

export function computeLiquidityZones(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  currentPrice: number,
  bucketPct = 0.001
): Zone[] {
  const bucketSize = currentPrice * bucketPct;
  const buckets = new Map<number, { qty: number; side: "support" | "resistance" }>();

  const fill = (levels: OrderBookLevel[], side: "support" | "resistance") => {
    for (const l of levels) {
      const key = Math.round(l.price / bucketSize) * bucketSize;
      const existing = buckets.get(key);
      buckets.set(key, { qty: (existing?.qty || 0) + l.qty, side });
    }
  };
  fill(bids, "support");
  fill(asks, "resistance");

  const zones: Zone[] = Array.from(buckets.entries()).map(([price, v]) => ({
    price,
    strength: v.qty,
    side: v.side,
  }));

  zones.sort((a, b) => b.strength - a.strength);
  return zones.slice(0, 8);
}

export function computeLiquidationClusters(
  currentPrice: number,
  openInterest: number,
  fundingRate: number
): LiqCluster[] {
  const leverageTiers = [5, 10, 25, 50, 75, 100];
  const longBias = fundingRate > 0 ? 1 + fundingRate * 50 : 1;
  const shortBias = fundingRate < 0 ? 1 + Math.abs(fundingRate) * 50 : 1;

  const clusters: LiqCluster[] = [];
  for (const lev of leverageTiers) {
    const move = 1 / lev;
    const longLiqPrice = currentPrice * (1 - move);
    const shortLiqPrice = currentPrice * (1 + move);
    const baseWeight = (openInterest / leverageTiers.length) * (1 / lev);

    clusters.push({ price: longLiqPrice, weight: baseWeight * longBias, side: "long" });
    clusters.push({ price: shortLiqPrice, weight: baseWeight * shortBias, side: "short" });
  }
  return clusters;
}

// Une zone est considérée "prise" (swept) si le prix l'a déjà traversée
// récemment (mèche haute au-dessus d'une résistance, mèche basse sous un support)
function zoneSwept(zonePrice: number, side: "support" | "resistance", recent: Candle[]): boolean {
  if (side === "resistance") return recent.some((c) => c.high >= zonePrice);
  return recent.some((c) => c.low <= zonePrice);
}

export function computeSignal(
  currentPrice: number,
  zones: Zone[],
  clusters: LiqCluster[],
  recentCandles: Candle[] = []
): { signal: Signal; reason: string } {
  const nearestResistance = zones
    .filter((z) => z.side === "resistance" && z.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0];
  const nearestSupport = zones
    .filter((z) => z.side === "support" && z.price < currentPrice)
    .sort((a, b) => b.price - a.price)[0];

  const nearestLongLiq = clusters
    .filter((c) => c.side === "long" && c.price < currentPrice)
    .sort((a, b) => b.price - a.price)[0];
  const nearestShortLiq = clusters
    .filter((c) => c.side === "short" && c.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0];

  const closeThreshold = 0.004;

  // Étape 1 : la liquidité a-t-elle déjà été "prise" récemment ?
  const resistanceSwept =
    nearestResistance && zoneSwept(nearestResistance.price, "resistance", recentCandles);
  const supportSwept =
    nearestSupport && zoneSwept(nearestSupport.price, "support", recentCandles);

  // Étape 2 : si oui, est-ce qu'un cluster de liquidation est maintenant proche
  // dans la continuité du mouvement (accélération) ?
  if (resistanceSwept && nearestShortLiq) {
    const dist = (nearestShortLiq.price - currentPrice) / currentPrice;
    if (dist < closeThreshold * 2) {
      return {
        signal: "achat",
        reason: "Liquidité de résistance déjà prise — accélération probable vers le cluster de liquidation shorts au-dessus",
      };
    }
  }
  if (supportSwept && nearestLongLiq) {
    const dist = (currentPrice - nearestLongLiq.price) / currentPrice;
    if (dist < closeThreshold * 2) {
      return {
        signal: "vente",
        reason: "Liquidité de support déjà prise — accélération probable vers le cluster de liquidation longs en dessous",
      };
    }
  }

  // Étape 3 : la liquidité n'est pas encore prise mais le prix s'en approche
  // → zone d'attraction/pause probable, pas encore de direction claire
  const distToResistance = nearestResistance
    ? (nearestResistance.price - currentPrice) / currentPrice
    : 1;
  const distToSupport = nearestSupport
    ? (currentPrice - nearestSupport.price) / currentPrice
    : 1;

  if (distToResistance < closeThreshold) {
    return {
      signal: "neutre",
      reason: "Prix proche d'une zone de liquidité non prise (résistance) — pause ou rebond probable avant tout mouvement directionnel",
    };
  }
  if (distToSupport < closeThreshold) {
    return {
      signal: "neutre",
      reason: "Prix proche d'une zone de liquidité non prise (support) — pause ou rebond probable avant tout mouvement directionnel",
    };
  }

  return { signal: "neutre", reason: "Aucune zone forte à proximité immédiate" };
}
