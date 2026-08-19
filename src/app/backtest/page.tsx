"use client";

import { useState } from "react";
import {
  fetchHistoricalKlines,
  fetchHistoricalFunding,
  runBacktest,
  BacktestResult,
} from "@/lib/backtest";

const ASSETS = ["BTCUSDT", "ETHUSDT"];
const TIMEFRAMES = ["5m", "15m", "1h", "4h"];

export default function BacktestPage() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("15m");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const [candles, funding] = await Promise.all([
        fetchHistoricalKlines(symbol, timeframe, 500),
        fetchHistoricalFunding(symbol, 200),
      ]);
      const res = runBacktest(candles, funding);
      setResult(res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <h1 className="text-xl font-bold mb-2">Backtest simplifié</h1>
      <p className="text-xs text-zinc-500 mb-4">
        Basé sur funding rate + niveaux swing high/low (pas le vrai carnet d'ordres,
        indisponible historiquement gratuitement). Résultat indicatif uniquement.
      </p>

      <div className="flex gap-2 mb-3">
        {ASSETS.map((s) => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className={`px-3 py-1 rounded text-sm ${
              symbol === s ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800"
            }`}
          >
            {s.replace("USDT", "")}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-3 py-1 rounded text-sm ${
              timeframe === tf ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Calcul en cours..." : "Lancer le backtest (500 dernières bougies)"}
      </button>

      {result && (
        <div className="mt-6 space-y-3">
          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900">
            <div className="text-sm text-zinc-400">Signaux générés</div>
            <div className="text-2xl font-bold">{result.totalSignals}</div>
            <div className="text-xs text-zinc-600">
              + {result.neutreCount} bougies neutres (ignorées)
            </div>
          </div>

          <div className="p-3 rounded-lg border border-green-800 bg-green-950/30">
            <div className="text-sm text-green-400">Signaux ACHAT</div>
            <div className="text-2xl font-bold text-green-400">
              {result.achatWinRate}% de réussite
            </div>
            <div className="text-xs text-zinc-500">
              sur {result.achatCount} signaux ({result.achatCount > 0 ? Math.round(result.achatWinRate * result.achatCount / 100) : 0} gagnants)
            </div>
          </div>

          <div className="p-3 rounded-lg border border-red-800 bg-red-950/30">
            <div className="text-sm text-red-400">Signaux VENTE</div>
            <div className="text-2xl font-bold text-red-400">
              {result.venteWinRate}% de réussite
            </div>
            <div className="text-xs text-zinc-500">
              sur {result.venteCount} signaux ({result.venteCount > 0 ? Math.round(result.venteWinRate * result.venteCount / 100) : 0} gagnants)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
