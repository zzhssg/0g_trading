import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addSeries = vi.fn(() => ({ setData: vi.fn() }));
const createChart = vi.fn(() => ({
  addSeries,
  applyOptions: vi.fn(),
  remove: vi.fn(),
}));
const CandlestickSeries = Symbol("CandlestickSeries");

vi.mock("lightweight-charts", () => ({
  createChart,
  CandlestickSeries,
}));

import { MarketSampleChart } from "../MarketSampleChart";

describe("MarketSampleChart", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 420,
    });

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("使用 v5 API 创建蜡烛图 series", async () => {
    const data = [
      {
        time: 1710000000,
        open: 100,
        high: 110,
        low: 95,
        close: 105,
      },
    ];

    render(<MarketSampleChart data={data} />);

    await waitFor(() => {
      expect(addSeries).toHaveBeenCalledTimes(1);
    });

    expect(addSeries).toHaveBeenCalledWith(
      CandlestickSeries,
      expect.objectContaining({
        upColor: "#10b981",
        downColor: "#f97316",
      })
    );
  });
});
