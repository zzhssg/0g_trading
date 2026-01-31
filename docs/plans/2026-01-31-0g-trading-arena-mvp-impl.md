# 0G Trading Arena MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 0G Galileo 测试网实现“策略上链 + 0G Storage/DA 存证 + 浏览器可复算”的最小闭环。

**Architecture:** StrategyNFT 承载 INFT 三元组（codeHash/storageRoot/performancePointer），TradingArena 记录结果哈希与市场数据哈希；策略与执行日志存 0G Storage，市场数据以 0G DA 根哈希入链；前端通过 API 路由下载存证并在浏览器复算。

**Tech Stack:** Hardhat + TypeScript, @0glabs/0g-ts-sdk, ethers v6, Next.js (App Router) + Vitest。

---

### Task 1: StrategyNFT 增加 performancePointer（三元组）

**Files:**
- Modify: `contracts/StrategyNFT.sol`
- Modify: `test/StrategyNFT.spec.ts`
- Modify: `scripts/smoke.ts`

**Step 1: Write the failing test**

```ts
it("stores performancePointer", async () => {
  const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
  const nft = await StrategyNFT.deploy();
  const pointer = "perf-root";

  await nft.registerStrategy(
    ethers.keccak256(ethers.toUtf8Bytes("code")),
    ethers.keccak256(ethers.toUtf8Bytes("params")),
    "v1",
    "window",
    "storage-root",
    pointer,
    "token-uri"
  );

  const strategy = await nft.getStrategy(1);
  expect(strategy.performancePointer).to.equal(pointer);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/StrategyNFT.spec.ts`
Expected: FAIL with argument mismatch or missing field.

**Step 3: Write minimal implementation**

```solidity
struct Strategy {
    bytes32 codeHash;
    bytes32 paramsHash;
    string datasetVersion;
    string evalWindow;
    string storageRoot;
    string performancePointer;
    uint256 createdAt;
    address creator;
    bool isActive;
}

event StrategyRegistered(
    uint256 indexed tokenId,
    address indexed creator,
    bytes32 codeHash,
    bytes32 paramsHash,
    string datasetVersion,
    string evalWindow,
    string storageRoot,
    string performancePointer
);

function registerStrategy(
    bytes32 _codeHash,
    bytes32 _paramsHash,
    string memory _datasetVersion,
    string memory _evalWindow,
    string memory _storageRoot,
    string memory _performancePointer,
    string memory _tokenURI
) external returns (uint256) {
   // store performancePointer + emit event
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/StrategyNFT.spec.ts`
Expected: PASS

**Step 5: Commit**

Skip (per user instruction: do not run git commit unless explicitly requested).

---

### Task 2: TradingArena 提交约束（可复算边界）

**Files:**
- Modify: `contracts/TradingArena.sol`
- Create: `test/TradingArena.spec.ts`

**Step 1: Write the failing test**

```ts
describe("TradingArena submit", () => {
  it("only owner can submit once per round", async () => {
    const [owner, other] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    const Arena = await ethers.getContractFactory("TradingArena");
    const arena = await Arena.deploy(await nft.getAddress());

    await nft.registerStrategy(
      ethers.keccak256(ethers.toUtf8Bytes("code")),
      ethers.keccak256(ethers.toUtf8Bytes("params")),
      "v1",
      "window",
      "storage-root",
      "perf-root",
      "token-uri"
    );

    await arena.startNewRound(ethers.keccak256(ethers.toUtf8Bytes("market")));

    await expect(
      arena.connect(other).submitResult(1, 1, 1, 1, ethers.ZeroHash)
    ).to.be.reverted;

    await arena.submitResult(1, 1, 1, 1, ethers.ZeroHash);

    await expect(
      arena.submitResult(1, 1, 1, 1, ethers.ZeroHash)
    ).to.be.reverted;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/TradingArena.spec.ts`
Expected: FAIL with missing checks.

**Step 3: Write minimal implementation**

```solidity
mapping(uint256 => mapping(uint256 => bool)) public submittedInRound;

require(strategyNFT.ownerOf(_strategyId) == msg.sender, "Not strategy owner");
require(!submittedInRound[currentRound][_strategyId], "Already submitted");
submittedInRound[currentRound][_strategyId] = true;
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/TradingArena.spec.ts`
Expected: PASS

**Step 5: Commit**

Skip (per user instruction).

---

### Task 3: 日志规范化与哈希（脚本侧基准实现）

**Files:**
- Modify: `scripts/lib/storageBundle.ts`
- Modify: `test/storageBundle.test.ts`

**Step 1: Write the failing test**

```ts
it("canonicalizes JSON before hashing", () => {
  const log = JSON.stringify([{ side: "long", price: 1.2, ts: 1 }]);
  const shuffled = JSON.stringify([{ ts: 1, price: 1.2, side: "long" }]);
  expect(hashBacktestLog(log)).to.equal(hashBacktestLog(shuffled));
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/storageBundle.test.ts`
Expected: FAIL with hash mismatch.

**Step 3: Write minimal implementation**

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

function normalizeNumber(value: number) {
  return Number.isFinite(value) ? value.toString() : value;
}

export function canonicalizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]);
    return Object.fromEntries(entries);
  }
  if (typeof value === "number") return normalizeNumber(value);
  return value;
}

export function hashBacktestLog(log: string): string {
  const parsed = JSON.parse(log) as JsonValue;
  const canonical = JSON.stringify(canonicalizeJson(parsed));
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/storageBundle.test.ts`
Expected: PASS

**Step 5: Commit**

Skip (per user instruction).

---

### Task 4: 0G Storage 上传与元数据输出（双 root）

**Files:**
- Modify: `scripts/storage-upload.ts`
- Modify: `scripts/storage-download.ts`
- Modify: `docs/verify-mvp.md`

**Step 1: Write the failing test (CLI 输出结构)**

```ts
it("builds upload outputs with strategy/log roots", () => {
  const outputs = buildUploadOutputs({
    strategyRoot: "0xaaa",
    logRoot: "0xbbb",
    metadataRoot: "0xccc",
  });
  expect(outputs.performancePointer).to.equal("0xbbb");
  expect(outputs.storageRoot).to.equal("0xaaa");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/storageBundle.test.ts`
Expected: FAIL with missing function.

**Step 3: Write minimal implementation**

```ts
export function buildUploadOutputs(input: {
  strategyRoot: string;
  logRoot: string;
  metadataRoot: string;
}) {
  return {
    storageRoot: input.strategyRoot,
    performancePointer: input.logRoot,
    tokenURI: input.metadataRoot,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/storageBundle.test.ts`
Expected: PASS

**Step 5: Update scripts (no network test)**

- `storage-upload.ts`：分别上传策略 JSON 与执行日志 JSON，输出 `storageRoot/performancePointer/tokenURI` 到 stdout 与文件。
- `storage-download.ts`：支持 `--root <hash>` 与 `--out <path>`，下载后在 stdout 打印首 200 字符用于检查。

**Step 6: Commit**

Skip (per user instruction).

---

### Task 5: 前端注册 payload + ABI 对齐

**Files:**
- Modify: `frontend/src/lib/strategyPayload.ts`
- Modify: `frontend/src/lib/strategyPayload.test.ts`
- Modify: `frontend/src/app/page.tsx`

**Step 1: Write the failing test**

```ts
it("accepts performancePointer and tokenURI", () => {
  const payload = buildStrategyRegistrationPayload({
    strategyName: "s",
    strategyJson: "{\"logic\":{}}",
    datasetVersion: "v1",
    evalWindow: "w",
    storageRoot: "0x" + "11".repeat(32),
    performancePointer: "0x" + "22".repeat(32),
    tokenURI: "0x" + "33".repeat(32),
  });
  expect(payload.performancePointer).toBe("0x" + "22".repeat(32));
  expect(payload.tokenURI).toBe("0x" + "33".repeat(32));
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/strategyPayload.test.ts`
Expected: FAIL with missing fields.

**Step 3: Write minimal implementation**

- `StrategyRegistrationInput` 新增 `storageRoot/performancePointer/tokenURI` 可选字段
- `buildStrategyRegistrationPayload` 优先使用输入值，不再强制 base64
- 元数据 attributes 加入 `Performance Pointer`

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/lib/strategyPayload.test.ts`
Expected: PASS

**Step 5: Commit**

Skip (per user instruction).

---

### Task 6: 浏览器验证（Storage 下载 + 复算）

**Files:**
- Create: `frontend/src/app/api/storage-download/route.ts`
- Create: `frontend/src/lib/verify.ts`
- Modify: `frontend/src/app/page.tsx`

**Step 1: Write the failing test (verify util)**

```ts
import { describe, expect, it } from "vitest";
import { computePnlFromLog, hashLog } from "./verify";

it("computes pnl from log entries", () => {
  const log = [{ entryPrice: 100, exitPrice: 110, side: "long", size: 1 }];
  expect(computePnlFromLog(log)).toBe(10);
});

it("hashes log deterministically", () => {
  const log = [{ side: "long", entryPrice: 100, exitPrice: 110, size: 1, ts: 1 }];
  const a = hashLog(log);
  const b = hashLog([{ ts: 1, size: 1, exitPrice: 110, entryPrice: 100, side: "long" }]);
  expect(a).toBe(b);
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/lib/verify.test.ts`
Expected: FAIL with missing module.

**Step 3: Write minimal implementation**

```ts
export type LogEntry = {
  entryPrice: number;
  exitPrice: number;
  side: "long" | "short";
  size: number;
  ts?: number;
};

export function computePnlFromLog(entries: LogEntry[]) {
  return entries.reduce((sum, entry) => {
    const diff = entry.exitPrice - entry.entryPrice;
    return sum + (entry.side === "long" ? diff : -diff) * entry.size;
  }, 0);
}

export function hashLog(entries: LogEntry[]) {
  return keccak256(canonicalJson(entries));
}
```

**Step 4: Implement API route (no network test)**

- `GET /api/storage-download?root=<hash>`
- 使用 `Indexer` 下载到临时文件并返回 JSON（错误时返回 4xx）

**Step 5: 接入 UI 验证**

- 表单输入：`strategyId` + `roundId`
- 读取链上 `getStrategy/getResult/rounds`
- 通过 API 拉取日志 JSON，计算哈希与 pnl
- 对比 `executionLogHash` 与链上 `pnl`，显示 Verified

**Step 6: Run tests**

Run: `cd frontend && npm test`
Expected: PASS

**Step 7: Commit**

Skip (per user instruction).

---

## Manual Verification Checklist
- 合约重新部署后，StrategyNFT 事件包含 performancePointer
- 0G Storage 上传后得到 strategyRoot/logRoot/metadataRoot
- 前端注册使用 tokenURI=metadataRoot
- 提交结果后 verify 页面显示 Verified ✅

