// volumeSpike.ts
// Détection des pics de volume anormaux sur une série de bougies (klines Binance)

export interface Candle {
  time: number;      // timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumeSpikeResult extends Candle {
  isSpike: boolean;
  volumeRatio: number; // volume / moyenne mobile du volume
  direction: "bullish" | "bearish";
}

/**
 * Calcule la moyenne mobile simple du volume sur une fenêtre donnée
 */
function averageVolume(candles: Candle[], index: number, period: number): number {
  const start = Math.max(0, index - period);
  const slice = candles.slice(start, index);
  if (slice.length === 0) return candles[index].volume;
  const sum = slice.reduce((acc, c) => acc + c.volume, 0);
  return sum / slice.length;
}

/**
 * Détecte les pics de volume sur une série de bougies
 * @param candles Liste des bougies (ordre chronologique croissant)
 * @param period Période de la moyenne mobile de volume (défaut 20)
 * @param threshold Multiplicateur pour déclencher un pic (défaut 2 = 200% de la moyenne)
 */
export function detectVolumeSpikes(
  candles: Candle[],
  period: number = 20,
  threshold: number = 2
): VolumeSpikeResult[] {
  return candles.map((candle, i) => {
    const avgVol = averageVolume(candles, i, period);
    const ratio = avgVol > 0 ? candle.volume / avgVol : 0;
    const isSpike = ratio >= threshold;
    const direction: "bullish" | "bearish" = candle.close >= candle.open ? "bullish" : "bearish";

    return {
      ...candle,
      isSpike,
      volumeRatio: parseFloat(ratio.toFixed(2)),
      direction,
    };
  });
}
