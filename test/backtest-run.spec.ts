import { expect } from "chai";
import { hashBacktestLog } from "../scripts/lib/storageBundle";
import { computeBacktestResult, parseBacktestRunArgs } from "../scripts/backtest-run";

const sampleMarket = {
  schemaVersion: "market-json-v1",
  datasetVersion: "v1",
  evalWindow: "2024-01-01T00:00:00Z~2024-01-02T00:00:00Z",
  scale: { price: 100, volume: 100 },
  rows: [
    {
      ts: "2024-01-01T00:00:00Z",
      open: 10000,
      high: 11000,
      low: 9000,
      close: 10500,
      volume: 10,
    },
    {
      ts: "2024-01-01T01:00:00Z",
      open: 10500,
      high: 12000,
      low: 10000,
      close: 11000,
      volume: 12,
    },
  ],
};

describe("backtest-run", () => {
  it("computes deterministic pnlBps and log hash", () => {
    const result = computeBacktestResult(sampleMarket, 1);
    expect(result.logEntries).to.have.length(1);
    const entry = result.logEntries[0];
    expect(entry.entryPrice).to.equal(10000);
    expect(entry.exitPrice).to.equal(11000);
    expect(entry.side).to.equal("long");
    expect(result.result.pnlBps).to.equal(1000);
    expect(result.result.totalTrades).to.equal(1);
    expect(result.result.winningTrades).to.equal(1);
    const expectedHash = hashBacktestLog(JSON.stringify(result.logEntries));
    expect(result.result.backtestLogHash).to.equal(expectedHash);
  });

  it("throws when rows are missing", () => {
    expect(() => computeBacktestResult({} as any, 1)).to.throw(
      "rows missing"
    );
  });

  it("parses cli args", () => {
    const args = parseBacktestRunArgs([
      "--market",
      "m.json",
      "--strategy",
      "s.json",
      "--outLog",
      "out.log",
      "--outResult",
      "out.json",
      "--size",
      "2",
    ]);
    expect(args.marketPath).to.equal("m.json");
    expect(args.strategyPath).to.equal("s.json");
    expect(args.outLogPath).to.equal("out.log");
    expect(args.outResultPath).to.equal("out.json");
    expect(args.size).to.equal(2);
  });
});
