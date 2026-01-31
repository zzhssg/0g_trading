# Backtest Run Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增极简回测脚本 `backtest-run.ts`，生成可复现 `backtest.log` 与 `pnlBps` 等指标，供 `submit-result.ts` 使用。

**Architecture:** 脚本读取 market/strategy JSON，执行“第一根开多、最后一根平仓”的确定性逻辑，生成日志并复用 `hashBacktestLog` 计算哈希；输出日志与结果文件。

**Tech Stack:** Node.js + TypeScript + Hardhat 脚本；现有 `scripts/lib/storageBundle.ts`。

---

### Task 1: 写入回测脚本测试（TDD）

**Files:**
- Create: `test/backtest-run.spec.ts`

**Step 1: Write the failing test**

```typescript
import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runBacktest } from "../scripts/backtest-run";
import { hashBacktestLog } from "../scripts/lib/storageBundle";

describe("backtest-run", function () {
  it("generates backtest log and result", async function () {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backtest-run-"));
    const marketPath = path.join(tempDir, "market.json");
    const strategyPath = path.join(tempDir, "strategy.json");
    const outLog = path.join(tempDir, "backtest.log");
    const outResult = path.join(tempDir, "backtest-result.json");

    fs.writeFileSync(
      marketPath,
      JSON.stringify({
        rows: [
          { ts: "2024-01-01T00:00:00Z", open: 100, close: 110 },
          { ts: "2024-01-01T00:05:00Z", open: 110, close: 120 },
        ],
      })
    );
    fs.writeFileSync(strategyPath, JSON.stringify({ strategy: { name: "demo" } }));

    await runBacktest({ marketPath, strategyPath, outLog, outResult, size: 1 });

    const log = fs.readFileSync(outLog, "utf8");
    const result = JSON.parse(fs.readFileSync(outResult, "utf8"));
    expect(JSON.parse(log)).to.have.length(1);
    expect(result.pnlBps).to.equal(2000);
    expect(result.backtestLogHash).to.equal(hashBacktestLog(log));
  });

  it("throws when rows missing", async function () {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backtest-run-"));
    const marketPath = path.join(tempDir, "market.json");
    const strategyPath = path.join(tempDir, "strategy.json");

    fs.writeFileSync(marketPath, JSON.stringify({}));
    fs.writeFileSync(strategyPath, JSON.stringify({ strategy: { name: "demo" } }));

    await expect(
      runBacktest({ marketPath, strategyPath })
    ).to.be.rejectedWith("missing market rows");
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- --grep "backtest-run"
```
Expected: FAIL（`runBacktest` 未实现）。

---

### Task 2: 实现 `backtest-run.ts`

**Files:**
- Create: `scripts/backtest-run.ts`

**Step 1: Write minimal implementation**

```typescript
import fs from "node:fs";
import path from "node:path";
import { hashBacktestLog } from "./lib/storageBundle";

export type BacktestOptions = {
  marketPath: string;
  strategyPath: string;
  outLog?: string;
  outResult?: string;
  size?: number;
};

type MarketRow = {
  ts: string;
  open: number;
  close: number;
};

export async function runBacktest(options: Partial<BacktestOptions>) {
  const marketPath = options.marketPath;
  const strategyPath = options.strategyPath;
  if (!marketPath || !strategyPath) {
    throw new Error("missing required args: marketPath, strategyPath");
  }

  const outLog = options.outLog ?? path.resolve("./data/backtest.log");
  const outResult = options.outResult ?? path.resolve("./data/backtest-result.json");
  const size = options.size ?? 1;

  const marketRaw = fs.readFileSync(marketPath, "utf8");
  const strategyRaw = fs.readFileSync(strategyPath, "utf8");
  JSON.parse(strategyRaw);

  const market = JSON.parse(marketRaw) as { rows?: MarketRow[] };
  if (!Array.isArray(market.rows) || market.rows.length === 0) {
    throw new Error("missing market rows");
  }

  const first = market.rows[0];
  const last = market.rows[market.rows.length - 1];
  if (!first || !last || !first.open || !last.close || !first.ts) {
    throw new Error("invalid market rows");
  }

  const entryPrice = Number(first.open);
  const exitPrice = Number(last.close);
  const pnlBps = Math.round(((exitPrice - entryPrice) / entryPrice) * 10000 * size);

  const logEntries = [
    {
      entryPrice,
      exitPrice,
      side: "long" as const,
      size,
      ts: first.ts,
    },
  ];

  const backtestLog = JSON.stringify(logEntries);
  const backtestLogHash = hashBacktestLog(backtestLog);

  fs.writeFileSync(outLog, backtestLog);
  fs.writeFileSync(
    outResult,
    JSON.stringify(
      {
        pnlBps,
        totalTrades: 1,
        winningTrades: pnlBps > 0 ? 1 : 0,
        backtestLogHash,
        marketMeta: { start: first.ts, end: last.ts },
      },
      null,
      2
    )
  );

  return { outLog, outResult, pnlBps, backtestLogHash };
}

function parseArgs(argv: string[]) {
  const pick = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const marketPath = pick("--market");
  const strategyPath = pick("--strategy");
  const outLog = pick("--outLog");
  const outResult = pick("--outResult");
  const size = pick("--size");

  return {
    marketPath,
    strategyPath,
    outLog,
    outResult,
    size: size ? Number(size) : undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runBacktest(args);
  console.log("backtestLog:", result.outLog);
  console.log("backtestResult:", result.outResult);
  console.log("pnlBps:", result.pnlBps);
  console.log("backtestLogHash:", result.backtestLogHash);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

**Step 2: Run test to verify it passes**

Run:
```bash
npm test -- --grep "backtest-run"
```
Expected: PASS。

---

### Task 3: 文档补充

**Files:**
- Modify: `docs/verify-mvp.md`

**Step 1: Update doc**

新增“回测执行”步骤：

```bash
npm run --silent hardhat -- run scripts/backtest-run.ts -- \
  --market ./data/MarketData.json \
  --strategy ./data/strategy.json \
  --outLog ./data/backtest.log \
  --outResult ./data/backtest-result.json \
  --size 1
```

说明产物字段与后续 `submit-result.ts` 对接。

---

## Notes
- 不包含 git commit 步骤（按用户要求）。
- 若依赖安装冲突，使用 `npm install --legacy-peer-deps`。
