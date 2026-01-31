"use client";

import { useEffect, useRef } from "react";
import type { CandleSeries } from "../../lib/marketSamples";

type MarketSampleChartProps = {
  data: CandleSeries[];
  height?: number;
};

export function MarketSampleChart({ data, height = 240 }: MarketSampleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<unknown>(null);
  const seriesRef = useRef<unknown>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (
        chartRef.current &&
        typeof (chartRef.current as { remove?: () => void }).remove === "function"
      ) {
        (chartRef.current as { remove: () => void }).remove();
      }
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!containerRef.current || data.length === 0) {
      return;
    }

    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") {
      return;
    }

    const setup = async () => {
      const { createChart, CandlestickSeries } = await import("lightweight-charts");
      if (cancelled || !containerRef.current) return;

      if (!chartRef.current) {
        const chart = createChart(containerRef.current, {
          height,
          width: containerRef.current.clientWidth,
          layout: {
            background: { color: "#0b0e14" },
            textColor: "#94a3b8",
          },
          grid: {
            horzLines: { color: "rgba(148,163,184,0.1)" },
            vertLines: { color: "rgba(148,163,184,0.1)" },
          },
          rightPriceScale: { borderColor: "rgba(148,163,184,0.2)" },
          timeScale: { borderColor: "rgba(148,163,184,0.2)" },
        });

        const series = chart.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#f97316",
          borderVisible: false,
          wickUpColor: "#10b981",
          wickDownColor: "#f97316",
        });

        observerRef.current = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const width = Math.floor(entry.contentRect.width);
            chart.applyOptions({ width });
          }
        });
        observerRef.current.observe(containerRef.current);

        chartRef.current = chart;
        seriesRef.current = series;
      }

      if (
        seriesRef.current &&
        typeof (seriesRef.current as { setData?: (data: CandleSeries[]) => void })
          .setData === "function"
      ) {
        (seriesRef.current as { setData: (data: CandleSeries[]) => void }).setData(
          data
        );
      }
    };

    void setup();

    return () => {
      cancelled = true;
    };
  }, [data, height]);

  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-xs text-gray-500">
        暂无数据
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[240px] w-full rounded-2xl border border-white/10 bg-black/30"
    />
  );
}
