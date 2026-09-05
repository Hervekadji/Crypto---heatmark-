import { Candle, detectVolumeSpikes } from "./volumeSpike";
import { detectSwingPoints, clusterZones, Zone } from "./swingZones";

export type SignalType = "achat" | "vente" | "neutre";

export interface VolumeZoneSignal {
  signal: SignalType;
  confidence: number;
  reason: string;
  nearestZone: Zone | null;
}

function isNearZone(price: number, zone: Zone, tolerancePct: number = 0.5): boolean {
  const diffPct = (Math.abs(price - zone.priceAvg) / zone.priceAvg) * 100;
  return diffPct <= tolerancePct;
}

/**
 * Génère un signal basé sur : pic de volume dans une fenêtre récente + proximité d'une zone
 * spikeWindow = nombre de bougies récentes à considérer (3 = bougie actuelle + 2 précédentes)
 */
export function computeVolumeZoneSignal(
  candles: Candle[],
  options?: {
    volumePeriod?: number;
    volumeThreshold?: number;
    swingLookback?: number;
    zoneTolerancePct?: number;
    priceZoneTolerancePct?: number;
    spikeWindow?: number;
  }
): VolumeZoneSignal {
  const {
    volumePeriod = 20,
    volumeThreshold = 2,
    swingLookback = 3,
    zoneTolerancePct = 0.3,
    priceZoneTolerancePct = 0.5,
    spikeWindow = 3,
  } = options || {};

  if (candles.length < volumePeriod + swingLookback * 2) {
    return { signal: "neutre", confidence: 0, reason: "Pas assez de données", nearestZone: null };
  }

  const spikes = detectVolumeSpikes(candles, volumePeriod, volumeThreshold);
  const lastIndex = spikes.length - 1;

  // Cherche le pic de volume le plus récent dans la fenêtre (0 = bougie actuelle)
  let spikeCandle: (typeof spikes)[number] | null = null;
  let candlesAgo = -1;
  for (let i = 0; i < spikeWindow; i++) {
    const idx = lastIndex - i;
    if (idx < 0) break;
    if (spikes[idx].isSpike) {
      spikeCandle = spikes[idx];
      candlesAgo = i;
      break;
    }
  }

  const swingPoints = detectSwingPoints(candles, swingLookback);
  const zones = clusterZones(swingPoints, zoneTolerancePct);

  const currentPrice = candles[candles.length - 1].close;
  const nearbyZone = zones.find((z) => isNearZone(currentPrice, z, priceZoneTolerancePct)) || null;

  if (!spikeCandle) {
    return {
      signal: "neutre",
      confidence: 20,
      reason: `Pas de pic de volume detecte sur les ${spikeWindow} dernieres bougies`,
      nearestZone: nearbyZone,
    };
  }

  const agoLabel =
    candlesAgo === 0 ? "la derniere bougie" : `il y a ${candlesAgo} bougie${candlesAgo > 1 ? "s" : ""}`;

  if (nearbyZone) {
    if (nearbyZone.type === "support" && spikeCandle.direction === "bearish") {
      return {
        signal: "achat",
        confidence: Math.min(60 + nearbyZone.touches * 10, 95),
        reason: `Pic de volume (x${spikeCandle.volumeRatio}) ${agoLabel} sur bougie baissiere proche d'un support teste ${nearbyZone.touches} fois -> epuisement vendeur probable`,
        nearestZone: nearbyZone,
      };
    }
    if (nearbyZone.type === "resistance" && spikeCandle.direction === "bullish") {
      return {
        signal: "vente",
        confidence: Math.min(60 + nearbyZone.touches * 10, 95),
        reason: `Pic de volume (x${spikeCandle.volumeRatio}) ${agoLabel} sur bougie haussiere proche d'une resistance testee ${nearbyZone.touches} fois -> epuisement acheteur probable`,
        nearestZone: nearbyZone,
      };
    }
  }

  return {
    signal: "neutre",
    confidence: 35,
    reason: `Pic de volume detecte (x${spikeCandle.volumeRatio}) ${agoLabel} mais sans confirmation de zone claire`,
    nearestZone: nearbyZone,
  };
}
