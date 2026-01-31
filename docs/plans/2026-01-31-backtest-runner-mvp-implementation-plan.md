# Backtest Runner MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimal deterministic backtest CLI that produces `backtest.log` and `backtest-result.json` aligned with on-chain submission and verification.

**Architecture:** A new `scripts/backtest-run.ts` reads `MarketData.json` + `strategy.json`, validates required fields, computes a single-trade PnL in basis points, writes a log and result JSON, and hashes the log via `hashBacktestLog` to keep verification consistent with on-chain `executionLogHash`.

**Tech Stack:** Node.js, TypeScript, Hardhat test runner, Chai, `scripts/lib/storageBundle.ts`.

> Note: Per AGENTS.md, this plan omits git commit steps.

### Task 1: Add failing tests for backtest runner behavior

**Files:**
- Create: `test/backtest-run.spec.ts`

**Step 1: Write failing tests (happy path + error cases)**

```ts
import { expect } from "chai";
import { hashBacktestLog } from "../scripts/lib/storageBundle";
import { computeBacktestResult, parseBacktestRunArgs } from "../scripts/backtest-run";

const sampleMarket = {
  schemaVersion: "market-json-v1",
  datasetVersion: "v1",
  evalWindow: "2024-01-01T00:00:00Z~2024-01-02T00:00:00Z",
  scale: { price: 100, volume: 100 },
  rows: [
    { ts: "2024-01-01T00:00:00Z", open: 10000, high: 11000, low: 9000, close: 10500, volume: 10 },
    { ts: "2024-01-01T01:00:00Z", open: 10500, high: 12000, low: 10000, close: 11000, volume: 12 }
  ]
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
    expect(() => computeBacktestResult({} as any, 1)).to.throw("rows missing");
  });

  it("parses cli args", () => {
    const args = parseBacktestRunArgs([
      "--market", "m.json",
      "--strategy", "s.json",
      "--outLog", "out.log",
      "--outResult", "out.json",
      "--size", "2"
    ]);
    expect(args.marketPath).to.equal("m.json");
    expect(args.strategyPath).to.equal("s.json");
    expect(args.outLogPath).to.equal("out.log");
    expect(args.outResultPath).to.equal("out.json");
    expect(args.size).to.equal(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx hardhat test "test/backtest-run.spec.ts"`
Expected: FAIL (module not found / missing exports)

### Task 2: Implement backtest runner script

**Files:**
- Create: `scripts/backtest-run.ts`

**Step 1: Implement minimal parsing + validation + computation**

```ts
import fs from "node:fs";
import path from "node:path";
import { hashBacktestLog } from "./lib/storageBundle";

type MarketRow = {
  ts: string;
  open: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

type MarketData = {
  rows?: MarketRow[];
  datasetVersion?: string;
  evalWindow?: string;
  scale?: { price?: number; volume?: number };
};

type BacktestLogEntry = {
  entryPrice: number;
  exitPrice: number;
  side: "long" | "short";
  size: number;
  ts?: string;
};

type BacktestResult = {
  pnlBps: number;
  totalTrades: number;
  winningTrades: number;
  backtestLogHash: string;
  marketMeta: {
    datasetVersion?: string;
    evalWindow?: string;
    scale?: { price?: number; volume?: number };
  };
};

type BacktestRunArgs = {
  marketPath: string;
  strategyPath: string;
  outLogPath: string;
  outResultPath: string;
  size: number;
};

export function parseBacktestRunArgs(argv: string[]): BacktestRunArgs {
  const pick = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };

  const marketPath = pick("--market");
  const strategyPath = pick("--strategy");
  const outLogPath = pick("--outLog") ?? "./data/backtest.log";
  const outResultPath = pick("--outResult") ?? "./data/backtest-result.json";
  const sizeRaw = pick("--size") ?? "1";
  const size = Number(sizeRaw);

  if (!marketPath || !strategyPath) {
    throw new Error("Missing required args: --market --strategy");
  }
  if (!Number.isFinite(size)) {
    throw new Error("Invalid --size");
  }

  return { marketPath, strategyPath, outLogPath, outResultPath, size };
}

export function computeBacktestResult(market: MarketData, size: number) {
  if (!Array.isArray(market.rows) || market.rows.length === 0) {
    throw new Error("rows missing");
  }
  const first = market.rows[0];
  const last = market.rows[market.rows.length - 1];
  if (!first || !last || first.open == null || last.close == null || !first.ts) {
    throw new Error("rows missing fields");
  }

  const entryPrice = Number(first.open);
  const exitPrice = Number(last.close);
  const pnlBps = Math.round(((exitPrice - entryPrice) / entryPrice) * 10000 * size);

  const logEntries: BacktestLogEntry[] = [
    {
      entryPrice,
      exitPrice,
      side: "long",
      size,
      ts: first.ts,
    },
  ];

  const backtestLogHash = hashBacktestLog(JSON.stringify(logEntries));

  const result: BacktestResult = {
    pnlBps,
    totalTrades: 1,
    winningTrades: pnlBps > 0 ? 1 : 0,
    backtestLogHash,
    marketMeta: {
      datasetVersion: market.datasetVersion,
      evalWindow: market.evalWindow,
      scale: market.scale,
    },
  };

  return { logEntries, result };
}

function main() {
  const args = parseBacktestRunArgs(process.argv.slice(2));
  const marketRaw = fs.readFileSync(args.marketPath, "utf8");
  fs.readFileSync(args.strategyPath, "utf8");
  const market = JSON.parse(marketRaw) as MarketData;

  const { logEntries, result } = computeBacktestResult(market, args.size);

  const logPath = path.resolve(args.outLogPath);
  const resultPath = path.resolve(args.outResultPath);
  fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2));
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

  console.log("backtestLogPath:", logPath);
  console.log("backtestResultPath:", resultPath);
  console.log("backtestLogHash:", result.backtestLogHash);
  console.log("pnlBps:", result.pnlBps);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
```

**Step 2: Run tests**

Run: `npx hardhat test "test/backtest-run.spec.ts"`
Expected: PASS

### Task 3: Verify full test suite (baseline + new test)

**Step 1: Run full tests**

Run: `npm test`
Expected: PASS

