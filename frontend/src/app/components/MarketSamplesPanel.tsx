"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { parseMarketData, toCandleSeries } from "../../lib/marketSamples";
import { MarketSampleChart } from "./MarketSampleChart";

type LoadStatus = "idle" | "loading" | "success" | "error";

type MarketMeta = {
  evalWindow: string;
  datasetVersion: string;
};

const TRADING_ARENA_ADDRESS =
  process.env.NEXT_PUBLIC_TRADING_ARENA_ADDRESS ?? "";
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const MARKET_SAMPLES_ABI = [
  "function getMarketSampleRoots() external view returns (bytes32[] memory)",
];

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function shortenHash(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function MarketSamplesPanel() {
  const [roots, setRoots] = useState<string[]>([]);
  const [manifestStatus, setManifestStatus] = useState<LoadStatus>("idle");
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [marketMeta, setMarketMeta] = useState<MarketMeta | null>(null);
  const [candles, setCandles] = useState<ReturnType<typeof toCandleSeries>>([]);
  const requestRef = useRef(0);

  const selectedSampleIndex = useMemo(() => {
    if (!selectedRoot) return -1;
    return roots.findIndex((root) => root === selectedRoot);
  }, [roots, selectedRoot]);

  useEffect(() => {
    let cancelled = false;

    const loadRoots = async () => {
      setManifestStatus("loading");
      setManifestError(null);
      if (!TRADING_ARENA_ADDRESS) {
        setManifestStatus("error");
        setManifestError("缺少 NEXT_PUBLIC_TRADING_ARENA_ADDRESS");
        return;
      }

      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const arena = new ethers.Contract(
          TRADING_ARENA_ADDRESS,
          MARKET_SAMPLES_ABI,
          provider
        );
        const payload = (await arena.getMarketSampleRoots()) as string[];
        if (!Array.isArray(payload)) {
          throw new Error("样本 root 列表格式错误");
        }
        if (!cancelled) {
          setRoots(payload.map((root) => root.toString()));
          setManifestStatus("success");
        }
      } catch (error) {
        if (!cancelled) {
          setManifestError(getErrorMessage(error, "样本 root 列表加载失败"));
          setManifestStatus("error");
        }
      }
    };

    void loadRoots();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectSample = useCallback(async (root: string) => {
    const requestId = ++requestRef.current;
    setSelectedRoot(root);
    setLoadStatus("loading");
    setLoadError(null);
    setMarketMeta(null);
    setCandles([]);

    try {
      const res = await fetch(`/api/storage-download?root=${root}`);
      const payload = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || !payload.content) {
        throw new Error(payload.error ?? "下载市场样本失败");
      }

      const data = parseMarketData(payload.content);
      const series = toCandleSeries(data);

      if (requestRef.current !== requestId) return;

      setMarketMeta({
        evalWindow: data.evalWindow,
        datasetVersion: data.datasetVersion,
      });
      setCandles(series);
      setLoadStatus("success");
    } catch (error) {
      if (requestRef.current !== requestId) return;
      setLoadError(getErrorMessage(error, "样本加载失败"));
      setLoadStatus("error");
    }
  }, []);

  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <div className="px-6 py-5 lg:px-8 border-b border-white/5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="font-bold">市场样本库</h4>
          <p className="text-[10px] text-gray-500 uppercase font-bold mt-1">
            0G Storage Root {"->"} K 线解析
          </p>
        </div>
        <div className="text-xs text-gray-400">
          {manifestStatus === "loading" && "加载 root 列表中..."}
          {manifestStatus === "error" && "root 列表加载失败"}
        </div>
      </div>

      {manifestError && (
        <div className="px-6 py-4 text-sm text-red-400 border-b border-white/5">
          {manifestError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-12 lg:p-8">
        <div className="space-y-3 lg:col-span-4">
          {roots.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-gray-500">
              暂无样本
            </div>
          ) : (
            roots.map((root, index) => (
              <button
                key={root}
                type="button"
                onClick={() => handleSelectSample(root)}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition-all ${
                  selectedRoot === root
                    ? "border-blue-500/40 bg-blue-500/10"
                    : "border-white/10 bg-black/30 hover:bg-white/5"
                }`}
              >
                <div className="font-semibold text-white">{`样本 ${index + 1}`}</div>
                <div className="mt-1 text-[10px] uppercase text-gray-500">
                  Root: {shortenHash(root)}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="space-y-4 lg:col-span-8">
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase text-gray-500">
            <span>状态</span>
            <span className="rounded-full bg-white/5 px-3 py-1 font-bold text-gray-300">
              {loadStatus === "loading"
                ? "加载中"
                : loadStatus === "success"
                  ? "已加载"
                  : loadStatus === "error"
                    ? "加载失败"
                    : "待选择"}
            </span>
            {marketMeta?.evalWindow && (
              <span className="rounded-full bg-white/5 px-3 py-1 font-bold text-gray-300">
                {marketMeta.evalWindow}
              </span>
            )}
            {selectedSampleIndex >= 0 && (
              <span className="rounded-full bg-white/5 px-3 py-1 font-bold text-gray-300">
                {`样本 ${selectedSampleIndex + 1}`}
              </span>
            )}
          </div>

          {loadError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
              {loadError}
            </div>
          )}

          <MarketSampleChart data={candles} />
        </div>
      </div>
    </div>
  );
}
