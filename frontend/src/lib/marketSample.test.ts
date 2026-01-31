import { describe, expect, it } from "vitest";
import { ethers } from "ethers";
import {
  buildKlinePreview,
  computeDatasetHashes,
  parseMarketSample,
} from "./marketSample";

describe("marketSample", () => {
  it("throws when datasetVersion is missing", () => {
    const payload = JSON.stringify({
      evalWindow: "2025-01-01~2025-01-02",
      rows: [{ ts: "2025-01-01T00:00:00Z", open: 1, close: 2 }],
    });
    expect(() => parseMarketSample(payload)).toThrow(/datasetVersion/i);
  });

  it("throws when evalWindow is missing", () => {
    const payload = JSON.stringify({
      datasetVersion: "v1",
      rows: [{ ts: "2025-01-01T00:00:00Z", open: 1, close: 2 }],
    });
    expect(() => parseMarketSample(payload)).toThrow(/evalWindow/i);
  });

  it("throws when rows are missing", () => {
    const payload = JSON.stringify({ datasetVersion: "v1", evalWindow: "x" });
    expect(() => parseMarketSample(payload)).toThrow(/rows/i);
  });

  it("parses meta and rows", () => {
    const payload = JSON.stringify({
      datasetVersion: "v1",
      evalWindow: "2025-01-01~2025-01-02",
      scale: { price: 100, volume: 100 },
      rows: [
        {
          ts: "2025-01-01T00:00:00Z",
          open: 1,
          high: 2,
          low: 1,
          close: 2,
          volume: 10,
        },
      ],
    });

    const sample = parseMarketSample(payload);
    expect(sample.datasetVersion).toBe("v1");
    expect(sample.evalWindow).toBe("2025-01-01~2025-01-02");
    expect(sample.scale?.price).toBe(100);
    expect(sample.rows).toHaveLength(1);
  });

  it("computes dataset hashes", () => {
    const hashes = computeDatasetHashes({
      datasetVersion: "v1",
      evalWindow: "2025-01-01~2025-01-02",
    });

    expect(hashes.datasetVersionHash).toBe(
      ethers.keccak256(ethers.toUtf8Bytes("v1"))
    );
    expect(hashes.evalWindowHash).toBe(
      ethers.keccak256(ethers.toUtf8Bytes("2025-01-01~2025-01-02"))
    );
  });

  it("builds kline preview with limit", () => {
    const rows = [
      { ts: "t1", open: 1, close: 2 },
      { ts: "t2", open: 2, close: 3 },
      { ts: "t3", open: 3, close: 4 },
    ];

    expect(buildKlinePreview(rows, 2)).toEqual(rows.slice(0, 2));
    expect(buildKlinePreview(rows, 0)).toEqual([]);
  });
});
