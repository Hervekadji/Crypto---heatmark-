import { Candle, Signal } from "./signal";

export type GoldOutlook = {
  longPercentage: number;
  shortPercentage: number;
} | null;

// Pas de carnet d'ordres public pour l'or : on utilise les plus hauts/bas
// récents comme zones (équivalent simplifié), combinés au positionnement
// de la foule (Myfxbook) comme proxy du funding rate crypto
export function computeGoldSignal(
  currentPrice: number,
  recentCandles: Candle[],
  outlook: GoldOutlook
): { signal: Signal; reason: string } {
  if (!outlook) {
    return { signal: "neutre", reason: "Données de positionnement indisponibles pour le moment" };
  }
  if (recentCandles.length === 0) {
    return { signal: "neutre", reason: "Historique de prix insuffisant" };
  }

  const pseudoResistance = Math.max(...recentCandles.map((c) => c.high));
  const pseudoSupport = Math.min(...recentCandles.map((c) => c.low));

  const closeThreshold = 0.002;
  const distToResistance = (pseudoResistance - currentPrice) / currentPrice;
  const distToSupport = (currentPrice - pseudoSupport) / currentPrice;

  const { longPercentage, shortPercentage } = outlook;
  const crowdedLong = longPercentage > 65;
  const crowdedShort = shortPercentage > 65;

  // Logique contrarienne : quand la foule est trop d'un côté près d'un extrême,
  // c'est souvent le signe d'un retournement (comme un funding rate extrême)
  if (crowdedLong && Math.abs(distToResistance) < closeThreshold) {
    return {
      signal: "vente",
      reason: `${longPercentage}% des traders sont positionnés à l'achat près d'un sommet récent — risque de retournement baissier`,
    };
  }
  if (crowdedShort && Math.abs(distToSupport) < closeThreshold) {
    return {
      signal: "achat",
      reason: `${shortPercentage}% des traders sont positionnés à la vente près d'un plus bas récent — risque de retournement haussier`,
    };
  }

  return {
    signal: "neutre",
    reason: `Positionnement : ${longPercentage}% achat / ${shortPercentage}% vente — pas de zone extrême à proximité`,
  };
}
