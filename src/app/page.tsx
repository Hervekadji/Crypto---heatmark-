"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries, HistogramSeries, createSeriesMarkers} from "lightweight-charts";
import { fetchOrderBook, fetchOpenInterest, fetchFundingRate } from "@/lib/binance";
import { computeLiquidityZones, computeLiquidationClusters, computeSignal, Signal, Candle } from "@/lib/signal";
import { fetchGoldCandles } from "@/lib/gold";
import { computeGoldSignal } from "@/lib/gold-signal";
import { computeVolumeZoneSignal, VolumeZoneSignal } from "@/lib/volumeZoneSignal";
import { detectVolumeSpikes } from "@/lib/volumeSpike";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"];
const ASSETS = [
  { label: "BTC", value: "BTCUSDT", type: "crypto" as const },
  { label: "ETH", value: "ETHUSDT", type: "crypto" as const },
  { label: "SOL", value: "SOLUSDT", type: "crypto" as const },
  { label: "BNB", value: "BNBUSDT", type: "crypto" as const },
  { label: "XRP", value: "XRPUSDT", type: "crypto" as const },
  { label: "ADA", value: "ADAUSDT", type: "crypto" as const },
  { label: "DOGE", value: "DOGEUSDT", type: "crypto" as const },
  { label: "AVAX", value: "AVAXUSDT", type: "crypto" as const },
  { label: "DOT", value: "DOTUSDT", type: "crypto" as const },
  { label: "LINK", value: "LINKUSDT", type: "crypto" as const },
  { label: "LTC", value: "LTCUSDT", type: "crypto" as const },
  { label: "TRX", value: "TRXUSDT", type: "crypto" as const },
  { label: "TON", value: "TONUSDT", type: "crypto" as const },
  { label: "SHIB", value: "SHIBUSDT", type: "crypto" as const },
  { label: "SUI", value: "SUIUSDT", type: "crypto" as const },
  { label: "UNI", value: "UNIUSDT", type: "crypto" as const },
  { label: "XLM", value: "XLMUSDT", type: "crypto" as const },
  { label: "FARTCOIN", value: "FARTCOINUSDT", type: "crypto" as const },
  { label: "TAO", value: "TAOUSDT", type: "crypto" as const },
  { label: "GOLD", value: "GOLD", type: "commodity" as const },
];

export default function Home() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const recentCandlesRef = useRef<Candle[]>([]);
  const [assetValue, setAssetValue] = useState("BTCUSDT");
  const [notifStatus, setNotifStatus] = useState<"default" | "granted" | "denied">(
    typeof Notification !== "undefined" ? (Notification.permission as any) : "default"
  );
  const lastNotifKey = useRef<string>("");
  const [timeframe, setTimeframe] = useState("15m");
  const [loading, setLoading] = useState(true);
  const [signal, setSignal] = useState<{ signal: Signal; reason: string } | null>(null);
  const [volumeSignal, setVolumeSignal] = useState<VolumeZoneSignal | null>(null);
  const [multiSignals, setMultiSignals] = useState<Record<string, Signal>>({});

  const asset = ASSETS.find((a) => a.value === assetValue)!;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#09090b" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 420,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    setLoading(true);
    setSignal(null);

    if (asset.type === "crypto") {
      fetch(
        `https://api.binance.com/api/v3/klines?symbol=${asset.value}&interval=${timeframe}&limit=200`
      )
        .then((res) => res.json())
        .then(async (data) => {
          const candles = data.map((d: any) => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
          }));
          const volumes = data.map((d: any) => ({
            time: d[0] / 1000,
            value: parseFloat(d[5]),
            color: parseFloat(d[4]) >= parseFloat(d[1]) ? "#22c55e55" : "#ef444455",
          }));
          candleSeries.setData(candles);
          volumeSeries.setData(volumes);
          chart.timeScale().fitContent();
          setLoading(false);

          recentCandlesRef.current = data.slice(-50).map((d: any) => ({
        time: d[0] / 1000,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));
          const currentPrice = candles[candles.length - 1].close;
          await refreshSignal(currentPrice);
        });
    } else {
      fetchGoldCandles(timeframe).then(async (candles) => {
        const candleData = candles.map((c) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        const volumeData = candles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? "#22c55e55" : "#ef444455",
        }));
        candleSeries.setData(candleData);
        volumeSeries.setData(volumeData);
        chart.timeScale().fitContent();
        setLoading(false);

        const recent = candleData.slice(-20).map((c) => ({ high: c.high, low: c.low }));
        recentCandlesRef.current = recent;
        const currentPrice = candleData[candleData.length - 1]?.close;
        if (currentPrice) await refreshGoldSignal(currentPrice, recent);
      });
    }

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    const interval = setInterval(async () => {
      const price = candleSeriesRef.current?.data?.().slice(-1)[0]?.close;
      if (!price) return;
      if (asset.type === "crypto") {
        await refreshSignal(price);
      } else {
        await refreshGoldSignal(price, recentCandlesRef.current);
      }
    }, asset.type === "crypto" ? 30000 : 15 * 60000);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearInterval(interval);
      chart.remove();
    };
  }, [assetValue, timeframe]);

  async function refreshGoldSignal(currentPrice: number, recent: Candle[]) {
    try {
      const res = await fetch("/api/gold-sentiment");
      const outlook = await res.json();
      if (outlook?.error) {
        setSignal({ signal: "neutre", reason: "Positionnement indisponible : " + outlook.error });
        return;
      }
      const result = computeGoldSignal(currentPrice, recent, {
        longPercentage: outlook.longPercentage,
        shortPercentage: outlook.shortPercentage,
      });
      setSignal(result);
    } catch (e) {
      console.error("Erreur signal or:", e);
    }
  }

  async function refreshSignal(currentPrice: number) {
    try {
      const [{ bids, asks }, oi, funding] = await Promise.all([
        fetchOrderBook(assetValue),
        fetchOpenInterest(assetValue),
        fetchFundingRate(assetValue),
      ]);

      const zones = computeLiquidityZones(bids, asks, currentPrice);
      const clusters = computeLiquidationClusters(currentPrice, oi, funding.fundingRate);
      const result = computeSignal(currentPrice, zones, clusters, recentCandlesRef.current);
      setSignal(result);
      let vzResultForNotif: VolumeZoneSignal | null = null;
      try {
        const vz = computeVolumeZoneSignal(recentCandlesRef.current as any);
        setVolumeSignal(vz);
        vzResultForNotif = vz;

        // Marqueurs visuels des pics de volume sur le graphique
        const spikes = detectVolumeSpikes(recentCandlesRef.current as any, 20, 2);
        const spikeMarkers = spikes
          .filter((s) => s.isSpike)
          .map((s) => ({
            time: s.time as any,
            position: s.direction === "bullish" ? "belowBar" : "aboveBar",
            color: s.direction === "bullish" ? "#22c55e" : "#ef4444",
            shape: s.direction === "bullish" ? "arrowUp" : "arrowDown",
            text: `PIC VOL x${s.volumeRatio}`,
          }));
        if (candleSeriesRef.current) {
          createSeriesMarkers(candleSeriesRef.current, spikeMarkers as any);
        }
      } catch (vzError) {
        console.error("Erreur volumeSignal:", vzError);
        setVolumeSignal(null);
      }

      // Notification de confirmation croisée
      if (
        notifStatus === "granted" &&
        result.signal !== "neutre" &&
        vzResultForNotif &&
        vzResultForNotif.signal === result.signal &&
        vzResultForNotif.confidence >= 60
      ) {
        const key = `${assetValue}-${result.signal}-${Math.round(vzResultForNotif.confidence / 10)}`;
        if (lastNotifKey.current !== key) {
          lastNotifKey.current = key;
          new Notification(`Signal ${result.signal.toUpperCase()} confirmé — ${assetValue}`, {
            body: `Liquidation + Volume/Zone d'accord (confiance ${vzResultForNotif.confidence}%)`,
          });
        }
      }

      priceLinesRef.current.forEach((line) => candleSeriesRef.current?.removePriceLine(line));
      priceLinesRef.current = [];

      zones.slice(0, 5).forEach((z) => {
        const line = candleSeriesRef.current?.createPriceLine({
          price: z.price,
          color: z.side === "resistance" ? "#facc15" : "#38bdf8",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: z.side === "resistance" ? "Liquidité vente" : "Liquidité achat",
        });
        if (line) priceLinesRef.current.push(line);
      });

      await refreshMultiTimeframe(currentPrice, zones, clusters);
    } catch (e) {
      console.error("Erreur signal:", e);
    }
  }

  async function refreshMultiTimeframe(currentPrice: number, zones: any[], clusters: any[]) {
    const results: Record<string, Signal> = {};
    await Promise.all(
      TIMEFRAMES.map(async (tf) => {
        try {
          const res = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${assetValue}&interval=${tf}&limit=10`
          );
          const data = await res.json();
          const candles = data.map((d: any) => ({
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
          }));
          const r = computeSignal(currentPrice, zones, clusters, candles);
          results[tf] = r.signal;
        } catch {
          results[tf] = "neutre";
        }
      })
    );
    setMultiSignals(results);
  }

  const signalColor =
    signal?.signal === "achat" ? "#22c55e" : signal?.signal === "vente" ? "#ef4444" : "#71717a";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <h1 className="text-xl font-bold mb-4">Crypto Signal — Heatmap</h1>

      {notifStatus !== "granted" && (
        <button
          onClick={() => {
            Notification.requestPermission().then((perm) => setNotifStatus(perm as any));
          }}
          className="mb-3 px-3 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 bg-zinc-900"
        >
          🔔 Autoriser les notifications
        </button>
      )}

      <div className="flex gap-2 mb-3">
        {ASSETS.map((a) => (
          <button
            key={a.value}
            onClick={() => setAssetValue(a.value)}
            className={`px-3 py-1 rounded text-sm ${
              assetValue === a.value ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800"
            }`}
          >
            {a.label}
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

      {loading && <p className="text-xs text-zinc-500 mb-2">Chargement...</p>}

      <div ref={chartContainerRef} className="rounded-lg overflow-hidden border border-zinc-800" />

      {asset.type === "crypto" && signal && (
        <div
          className="mt-4 p-3 rounded-lg border"
          style={{ borderColor: signalColor, backgroundColor: `${signalColor}15` }}
        >
          <div className="text-lg font-bold uppercase" style={{ color: signalColor }}>
            {signal.signal}
          </div>
          <div className="text-xs text-zinc-400 mt-1">{signal.reason}</div>
        </div>
      )}

      {asset.type === "crypto" && volumeSignal && (
        <div className="mt-3 p-3 rounded-lg border border-zinc-700 bg-zinc-900">
          <div className="text-xs uppercase text-zinc-400 mb-1">Volume / Zone</div>
          <div className="text-sm font-bold uppercase">
            {volumeSignal.signal} ({volumeSignal.confidence}%)
          </div>
          <div className="text-xs text-zinc-400 mt-1">{volumeSignal.reason}</div>
        </div>
      )}

      {asset.type === "crypto" && Object.keys(multiSignals).length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {TIMEFRAMES.map((tf) => {
            const s = multiSignals[tf];
            const c = s === "achat" ? "#22c55e" : s === "vente" ? "#ef4444" : "#52525b";
            return (
              <div
                key={tf}
                className="px-2 py-1 rounded text-[10px] font-medium border"
                style={{ borderColor: c, color: c }}
              >
                {tf}: {s || "…"}
              </div>
            );
          })}
        </div>
      )}

      {asset.type === "commodity" && signal && (
        <div
          className="mt-4 p-3 rounded-lg border"
          style={{ borderColor: signalColor, backgroundColor: `${signalColor}15` }}
        >
          <div className="text-lg font-bold uppercase" style={{ color: signalColor }}>
            {signal.signal}
          </div>
          <div className="text-xs text-zinc-400 mt-1">{signal.reason}</div>
          <div className="text-[10px] text-zinc-600 mt-2">
            Basé sur le positionnement communautaire (Myfxbook), pas un carnet d'ordres réel
          </div>
        </div>
      )}

      <footer className="mt-4 text-xs text-zinc-600">
        Données Binance / Yahoo Finance • Signal calculé, pas une donnée Coinglass • Non conseil financier
      </footer>
    </div>
  );
}
