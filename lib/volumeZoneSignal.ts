// volumeZoneSignal.ts
// Combine pics de volume + zones support/résistance pour générer un signal de confirmation
// À utiliser comme 3e composante à côté de ta logique liquidation + heatmap

import { Candle, detectVolumeSpikes } from "./volumeSpike";
import { detectSwingPoints, clusterZones, Zone } from "./swingZones";

export type SignalType = "achat" | "vente" | "neutre";

export interface VolumeZoneSignal {
  signal: SignalType;
  confidence: number; // 0 à 100
  reason: string;
  nearestZone: Zone | null;
}

/**
 * Détermine si le prix actuel est proche d'une zone donnée (en %)
 */
function isNearZone(price: number, zone: Zone, tolerancePct: number = 0.5): boolean {
  const diffPct = (Math.abs(price - zone.priceAvg) / zone.priceAvg) * 100;
  return diffPct <= tolerancePct;
}

/**
 * Génère un signal basé sur : dernière bougie + pic de volume + proximité d'une zone
 */
export function computeVolumeZoneSignal(
  candles: Candle[],
  options?: {
    volumePeriod?: number;
    volumeThreshold?: number;
    swingLookback?: number;
    zoneTolerancePct?: number;
    priceZoneTolerancePct?: number;
  }
): VolumeZoneSignal {
  const {
    volumePeriod = 20,
    volumeThreshold = 2,
    swingLookback = 3,
    zoneTolerancePct = 0.3,
    priceZoneTolerancePct = 0.5,
  } = options || {};

  if (candles.length < volumePeriod + swingLookback * 2) {
    return { signal: "neutre", confidence: 0, reason: "Pas assez de données", nearestZone: null };
  }

  const spikes = detectVolumeSpikes(candles, volumePeriod, volumeThreshold);
  const lastCandle = spikes[spikes.length - 1];

  const swingPoints = detectSwingPoints(candles, swingLookback);
  const zones = clusterZones(swingPoints, zoneTolerancePct);

  const currentPrice = lastCandle.close;
  const nearbyZone = zones.find((z) => isNearZone(currentPrice, z, priceZoneTolerancePct)) || null;

  // Pas de pic de volume => pas de confirmation forte
  if (!lastCandle.isSpike) {
    return {
      signal: "neutre",
      confidence: 20,
      reason: "Pas de pic de volume détecté sur la dernière bougie",
      nearestZone: nearbyZone,
    };
  }

  // Pic de volume + proche d'une zone => signal fort
  if (nearbyZone) {
    if (nearbyZone.type === "support" && lastCandle.direction === "bearish") {
      return {
        signal: "achat",
        confidence: Math.min(60 + nearbyZone.touches * 10, 95),
        reason: `Pic de volume (x${lastCandle.volumeRatio}) sur bougie baissière proche d'un support testé ${nearbyZone.touches} fois → épuisement vendeur probable`,
        nearestZone: nearbyZone,
      };
    }
    if (nearbyZone.type === "resistance" && lastCandle.direction === "bullish") {
      return {
        signal: "vente",
        confidence: Math.min(60 + nearbyZone.touches * 10, 95),
        reason: `Pic de volume (x${lastCandle.volumeRatio}) sur bougie haussière proche d'une résistance testée ${nearbyZone.touches} fois → épuisement acheteur probable`,
        nearestZone: nearbyZone,
      };
    }
  }

  // Pic de volume mais pas de zone claire ou pas de configuration cohérente
  return {
    signal: "neutre",
    confidence: 35,
    reason: `Pic de volume détecté (x${lastCandle.volumeRatio}) mais sans confirmation de zone claire`,
    nearestZone: nearbyZone,
  };
}
