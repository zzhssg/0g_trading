import { ethers } from "ethers";

export type MarketRow = {
  ts: string;
  open: number;
  close: number;
  high?: number;
  low?: number;
  volume?: number;
};

export type MarketSample = {
  datasetVersion: string;
  evalWindow: string;
  scale?: { price?: number; volume?: number };
  rows: MarketRow[];
};

function requireString(field: string, value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${field}`);
  }
}

function requireRows(value: unknown): MarketRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Missing rows");
  }
  return value as MarketRow[];
}

export function parseMarketSample(jsonText: string): MarketSample {
  const parsed = JSON.parse(jsonText) as Partial<MarketSample>;
  requireString("datasetVersion", parsed.datasetVersion);
  requireString("evalWindow", parsed.evalWindow);
  const rows = requireRows(parsed.rows);

  return {
    datasetVersion: parsed.datasetVersion!.trim(),
    evalWindow: parsed.evalWindow!.trim(),
    scale: parsed.scale,
    rows,
  };
}

export function computeDatasetHashes(input: {
  datasetVersion: string;
  evalWindow: string;
}) {
  return {
    datasetVersionHash: ethers.keccak256(
      ethers.toUtf8Bytes(input.datasetVersion)
    ),
    evalWindowHash: ethers.keccak256(ethers.toUtf8Bytes(input.evalWindow)),
  };
}

export function buildKlinePreview(rows: MarketRow[], limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return [] as MarketRow[];
  return rows.slice(0, limit);
}
