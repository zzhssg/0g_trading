# Verify User Story 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a single script that verifies User Story 2 end-to-end by uploading market data/strategy/log to 0G Storage, starting a round, registering the strategy, and submitting backtest results.

**Architecture:** A new `scripts/verify-user-story-2.ts` will parse CLI args, read `MarketData.json` + `strategy.json`, compute hashes, run the deterministic backtest (reuse `computeBacktestResult`), upload files via 0G Storage SDK, and call `StrategyNFT`/`TradingArena` contracts. Pure helpers are exported for tests.

**Tech Stack:** TypeScript, Hardhat runtime, ethers, @0glabs/0g-ts-sdk, existing `scripts/backtest-run.ts` + `scripts/lib/storageBundle.ts`.

> Note: Per AGENTS.md, this plan omits git commit steps.

### Task 1: Add failing tests for verify-user-story-2 helpers

**Files:**
- Create: `test/verify-user-story-2.spec.ts`

**Step 1: Write failing tests (arg parsing + hash helpers)**

```ts
import { expect } from "chai";
import {
  parseVerifyUserStoryArgs,
  computeDatasetHashes,
} from "../scripts/verify-user-story-2";

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
  ],
};

describe("verify-user-story-2", () => {
  it("parses required args and defaults", () => {
    const args = parseVerifyUserStoryArgs([
      "--market",
      "m.json",
      "--strategy",
      "s.json",
      "--arena",
      "0x0000000000000000000000000000000000000001",
      "--nft",
      "0x0000000000000000000000000000000000000002",
    ]);

    expect(args.marketPath).to.equal("m.json");
    expect(args.strategyPath).to.equal("s.json");
    expect(args.arenaAddress).to.equal(
      "0x0000000000000000000000000000000000000001"
    );
    expect(args.nftAddress).to.equal(
      "0x0000000000000000000000000000000000000002"
    );
    expect(args.size).to.equal(1);
    expect(args.outDir).to.equal("./data/verify");
  });

  it("computes dataset and eval window hashes", () => {
    const hashes = computeDatasetHashes(sampleMarket);
    expect(hashes.datasetVersionHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(hashes.evalWindowHash).to.match(/^0x[0-9a-f]{64}$/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx hardhat test "test/verify-user-story-2.spec.ts"`
Expected: FAIL (module not found / missing exports)

### Task 2: Implement verify-user-story-2 script

**Files:**
- Create: `scripts/verify-user-story-2.ts`

**Step 1: Implement helpers + main flow (minimal, deterministic)**

```ts
import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";
import { Indexer, ZgFile } from "@0glabs/0g-ts-sdk";
import { computeBacktestResult } from "./backtest-run";
import { hashBacktestLog } from "./lib/storageBundle";

// export parseVerifyUserStoryArgs, computeDatasetHashes for tests
// main: read files -> compute hashes -> upload -> on-chain calls -> write outputs
```

Implementation details:
- Parse args: `--market`, `--strategy`, `--arena`, `--nft`, `--outDir`, `--size`.
- Validate `rows` presence and required fields (`ts/open/close`).
- Compute:
  - `codeHash = keccak256(strategyJson)`
  - `paramsHash = keccak256(normalized strategyJson)`
  - `datasetVersionHash/evalWindowHash`
- Use `computeBacktestResult` to get `logEntries/result`, then ensure `backtestLogHash` equals `hashBacktestLog(JSON.stringify(logEntries))`.
- Upload:
  - `MarketData.json` -> `marketDataRoot`
  - `strategy.json` -> `storageRoot`
  - `backtest.log` -> `performancePointer`
- On-chain:
  - `startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash)`
  - `registerStrategy(codeHash, paramsHash, datasetVersion, evalWindow, storageRoot, performancePointer, tokenURI)`
  - `submitResult(strategyId, pnlBps, totalTrades, winningTrades, performancePointer, backtestLogHash)`
- Write output files in `outDir`:
  - `backtest.log`, `backtest-result.json`, `verify-user-story-2.json`

**Step 2: Run tests**

Run: `npx hardhat test "test/verify-user-story-2.spec.ts"`
Expected: PASS

### Task 3: Verify full test suite

**Step 1: Run full tests**

Run: `npm test`
Expected: PASS
