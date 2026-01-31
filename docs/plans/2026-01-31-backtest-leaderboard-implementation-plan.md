# Backtest Leaderboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复排行榜链上读取与前端再计算问题，并提供最小“结果提交入口”脚本，满足 MVP 可复现要求。

**Architecture:** 前端只读链上 `TradingArena.getLeaderboardByRound` 的结果；样本仅用于图表展示，不再参与榜单计算。新增最小脚本调用 `submitResult` 作为结果提交入口；文档补充验证步骤。

**Tech Stack:** Next.js + React + ethers v6；Hardhat（脚本/测试）。

---

### Task 1: 前端测试（榜单不再随样本切换变化）

**Files:**
- Modify: `frontend/src/app/__tests__/sample-recalc.test.tsx`

**Step 1: Write the failing test**

将测试改为验证：样本切换不会改变榜单 PnL，且调用 `getLeaderboardByRound`。

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MARKET_HASH = `0x${"22".repeat(32)}`;
const ARENA_ADDRESS = "0x00000000000000000000000000000000000000a1";
const NFT_ADDRESS = "0x00000000000000000000000000000000000000b2";

const mockArena = {
  getLeaderboardByRound: vi.fn().mockResolvedValue([[1n, 2n], [1000n, -500n]]),
  currentRound: vi.fn().mockResolvedValue(1n),
  rounds: vi.fn().mockResolvedValue({
    startTime: 0n,
    endTime: 0n,
    marketDataHash: MARKET_HASH,
    finalized: false,
  }),
};

const mockNft = {
  getStrategy: vi.fn().mockResolvedValue({ creator: "0xcreator" }),
  tokenURI: vi.fn().mockResolvedValue(""),
};

vi.mock("ethers", async () => {
  const actual = await vi.importActual<typeof import("ethers")>("ethers");

  class MockContract {
    constructor(address: string) {
      return address === ARENA_ADDRESS ? mockArena : mockNft;
    }
  }

  class MockJsonRpcProvider {}

  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: MockContract,
      JsonRpcProvider: MockJsonRpcProvider,
    },
  };
});

describe("dashboard leaderboard", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRATEGY_NFT_ADDRESS = NFT_ADDRESS;
    process.env.NEXT_PUBLIC_TRADING_ARENA_ADDRESS = ARENA_ADDRESS;
    process.env.NEXT_PUBLIC_RPC_URL = "http://localhost:8545";
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("does not recalc pnl when switching samples", async () => {
    const { default: Home } = await import("../page");
    render(<Home />);

    const pnls = await screen.findAllByTestId("leaderboard-pnl");
    const initial = pnls.map((node) => node.textContent);

    const ethSample = screen.getByRole("button", { name: /ETH\/USDT/i });
    await userEvent.click(ethSample);

    await waitFor(() => {
      const updated = screen
        .getAllByTestId("leaderboard-pnl")
        .map((node) => node.textContent);
      expect(updated).toEqual(initial);
    });

    expect(mockArena.getLeaderboardByRound).toHaveBeenCalledWith(1n, 10);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd frontend
npm test -- --run frontend/src/app/__tests__/sample-recalc.test.tsx
```
Expected: FAIL（榜单仍会随样本切换变化，或未调用 getLeaderboardByRound）。

---

### Task 2: 前端实现（链上榜单 + 禁止样本再计算）

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Write minimal implementation**

实现点：
- ABI 增加 `getLeaderboardByRound`，替换 `getLeaderboard`。
- `loadLeaderboard` 先读 `currentRound`，再调用 `getLeaderboardByRound`。
- `sampledLeaderboard` 直接使用 `leaderboard`（不再 `computeSamplePnl`/`applySampleToLeaderboard`）。
- UI 文案改为 `getLeaderboardByRound`。

**Step 2: Run test to verify it passes**

Run:
```bash
cd frontend
npm test -- --run frontend/src/app/__tests__/sample-recalc.test.tsx
```
Expected: PASS。

---

### Task 3: 结果提交脚本（最小入口）

**Files:**
- Create: `scripts/submit-result.ts`
- Create: `test/submit-result-args.spec.ts`

**Step 1: Write the failing test**

```typescript
import { expect } from "chai";
import { parseSubmitResultArgs } from "../scripts/submit-result";

describe("submit-result args", function () {
  it("throws when required fields are missing", function () {
    expect(() => parseSubmitResultArgs(["--strategyId", "1"]))
      .to.throw("missing required");
  });

  it("throws when hash is invalid", function () {
    expect(() =>
      parseSubmitResultArgs([
        "--strategyId",
        "1",
        "--pnl",
        "100",
        "--totalTrades",
        "10",
        "--winningTrades",
        "6",
        "--backtestLogRoot",
        "0x123",
        "--executionLogHash",
        "0x456",
      ])
    ).to.throw("invalid hash");
  });

  it("parses valid args", function () {
    const args = parseSubmitResultArgs([
      "--strategyId",
      "1",
      "--pnl",
      "100",
      "--totalTrades",
      "10",
      "--winningTrades",
      "6",
      "--backtestLogRoot",
      `0x${"11".repeat(32)}`,
      "--executionLogHash",
      `0x${"22".repeat(32)}`,
    ]);
    expect(args.strategyId).to.equal(1n);
    expect(args.pnl).to.equal(100n);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- --grep "submit-result args"
```
Expected: FAIL（parseSubmitResultArgs 未实现）。

**Step 3: Write minimal implementation**

```typescript
import { ethers } from "hardhat";

const REQUIRED = [
  "strategyId",
  "pnl",
  "totalTrades",
  "winningTrades",
  "backtestLogRoot",
  "executionLogHash",
] as const;

type ParsedArgs = {
  strategyId: bigint;
  pnl: bigint;
  totalTrades: bigint;
  winningTrades: bigint;
  backtestLogRoot: string;
  executionLogHash: string;
  arenaAddress?: string;
};

export function parseSubmitResultArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (key && value) values[key] = value;
  }

  const missing = REQUIRED.filter((key) => !values[key]);
  if (missing.length > 0) {
    throw new Error(`missing required: ${missing.join(", ")}`);
  }

  const backtestLogRoot = values.backtestLogRoot!;
  const executionLogHash = values.executionLogHash!;
  if (backtestLogRoot.length !== 66 || executionLogHash.length !== 66) {
    throw new Error("invalid hash length");
  }

  return {
    strategyId: BigInt(values.strategyId!),
    pnl: BigInt(values.pnl!),
    totalTrades: BigInt(values.totalTrades!),
    winningTrades: BigInt(values.winningTrades!),
    backtestLogRoot,
    executionLogHash,
    arenaAddress: values.arena,
  };
}

async function main() {
  const args = parseSubmitResultArgs(process.argv.slice(2));
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available. Check PRIVATE_KEY in .env/siyao.");

  const arenaAddress =
    args.arenaAddress ?? process.env.TRADING_ARENA_ADDRESS ?? "";
  if (!arenaAddress) throw new Error("Missing TRADING_ARENA_ADDRESS");

  const arena = await ethers.getContractAt("TradingArena", arenaAddress, signer);
  const tx = await arena.submitResult(
    args.strategyId,
    args.pnl,
    args.totalTrades,
    args.winningTrades,
    args.backtestLogRoot,
    args.executionLogHash
  );
  const receipt = await tx.wait();
  console.log("submitResult tx:", receipt?.hash ?? tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- --grep "submit-result args"
```
Expected: PASS。

---

### Task 4: 文档更新（验证流程补充脚本入口）

**Files:**
- Modify: `docs/verify-mvp.md`

**Step 1: Update doc**

新增一段“提交结果”示例，指向脚本：

```bash
npm run --silent hardhat -- run scripts/submit-result.ts --network 0g-testnet -- \
  --strategyId 1 \
  --pnl 1245 \
  --totalTrades 12 \
  --winningTrades 7 \
  --backtestLogRoot 0x... \
  --executionLogHash 0x...
```

并说明 `pnl` 为链上 int256（basis points），前端展示会除以 100。

---

## Notes
- 不包含 git commit 步骤（按用户要求）。
- 若 root 依赖安装仍因 peer 冲突失败，需要先确定是否使用 `npm install --legacy-peer-deps`。
