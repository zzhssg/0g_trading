# TradingArena Result Verifiability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 增强 TradingArena 结果可复现性与验证强度，并限制结果提交权限与重复提交。

**Architecture:** 在 TradingArena 中读取 StrategyNFT 的策略元数据哈希与评测窗口信息，将其与轮次市场数据哈希一起写入结果结构；验证函数同时比对多字段；排行榜在 view 层按 pnl 排序。

**Tech Stack:** Solidity 0.8.20, Hardhat, OpenZeppelin ERC-721, Chai

> 注: 按用户要求，计划中不包含 git commit/branch 步骤。

### Task 1: 结果验证与权限测试

**Files:**
- Create: `test/TradingArena.spec.ts`
- Modify: `contracts/TradingArena.sol`

**Step 1: Write the failing tests**

```ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TradingArena", function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    const TradingArena = await ethers.getContractFactory("TradingArena");
    const arena = await TradingArena.deploy(await nft.getAddress());
    await arena.waitForDeployment();

    const codeHash = ethers.keccak256(ethers.toUtf8Bytes("code"));
    const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));
    const datasetVersion = "v1";
    const evalWindow = "2025-01-01~2025-02-01";
    const storageRoot = "root";
    const tokenURI = "ipfs://token";

    await nft.registerStrategy(
      codeHash,
      paramsHash,
      datasetVersion,
      evalWindow,
      storageRoot,
      tokenURI
    );

    const marketDataHash = ethers.keccak256(ethers.toUtf8Bytes("market"));
    await arena.startNewRound(marketDataHash);

    return {
      owner,
      other,
      nft,
      arena,
      codeHash,
      paramsHash,
      datasetVersion,
      evalWindow,
      marketDataHash,
    };
  }

  it("only owner can submit and cannot resubmit in same round", async function () {
    const { other, arena } = await deployFixture();
    await expect(
      arena
        .connect(other)
        .submitResult(1, 100, 10, 6, ethers.keccak256(ethers.toUtf8Bytes("log")))
    ).to.be.revertedWith("Only strategy owner");
  });

  it("binds hashes and verifies result", async function () {
    const {
      owner,
      arena,
      codeHash,
      paramsHash,
      datasetVersion,
      evalWindow,
      marketDataHash,
    } = await deployFixture();

    const executionLogHash = ethers.keccak256(ethers.toUtf8Bytes("log"));
    await arena
      .connect(owner)
      .submitResult(1, 100, 10, 6, executionLogHash);

    const datasetVersionHash = ethers.keccak256(
      ethers.toUtf8Bytes(datasetVersion)
    );
    const evalWindowHash = ethers.keccak256(ethers.toUtf8Bytes(evalWindow));

    expect(
      await arena.verifyResult(
        1,
        1,
        executionLogHash,
        codeHash,
        paramsHash,
        datasetVersionHash,
        evalWindowHash,
        marketDataHash
      )
    ).to.equal(true);

    expect(
      await arena.verifyResult(
        1,
        1,
        ethers.keccak256(ethers.toUtf8Bytes("bad")),
        codeHash,
        paramsHash,
        datasetVersionHash,
        evalWindowHash,
        marketDataHash
      )
    ).to.equal(false);
  });

  it("blocks duplicate submissions", async function () {
    const { owner, arena } = await deployFixture();
    const executionLogHash = ethers.keccak256(ethers.toUtf8Bytes("log"));
    await arena
      .connect(owner)
      .submitResult(1, 100, 10, 6, executionLogHash);

    await expect(
      arena
        .connect(owner)
        .submitResult(1, 200, 10, 6, executionLogHash)
    ).to.be.revertedWith("Result already submitted");
  });

  it("sorts leaderboard by totalPnL", async function () {
    const [owner, other] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    const TradingArena = await ethers.getContractFactory("TradingArena");
    const arena = await TradingArena.deploy(await nft.getAddress());
    await arena.waitForDeployment();

    const codeHash = ethers.keccak256(ethers.toUtf8Bytes("code"));
    const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));
    const datasetVersion = "v1";
    const evalWindow = "2025-01-01~2025-02-01";
    const storageRoot = "root";
    const tokenURI = "ipfs://token";

    await nft.registerStrategy(
      codeHash,
      paramsHash,
      datasetVersion,
      evalWindow,
      storageRoot,
      tokenURI
    );
    await nft
      .connect(other)
      .registerStrategy(
        codeHash,
        paramsHash,
        datasetVersion,
        evalWindow,
        storageRoot,
        tokenURI
      );

    await arena.startNewRound(ethers.keccak256(ethers.toUtf8Bytes("market")));

    await arena
      .connect(owner)
      .submitResult(1, 50, 10, 6, ethers.keccak256(ethers.toUtf8Bytes("log1")));
    await arena
      .connect(other)
      .submitResult(2, 120, 10, 6, ethers.keccak256(ethers.toUtf8Bytes("log2")));

    const [ids, pnls] = await arena.getLeaderboard(2);
    expect(ids[0]).to.equal(2);
    expect(pnls[0]).to.equal(120);
    expect(ids[1]).to.equal(1);
    expect(pnls[1]).to.equal(50);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL due to missing fields, missing revert messages, and verifyResult signature mismatch.

### Task 2: Implement TradingArena verifiability and sorting

**Files:**
- Modify: `contracts/TradingArena.sol`

**Step 1: Write minimal implementation**

```solidity
// add to TradingResult
bytes32 codeHash;
bytes32 paramsHash;
bytes32 datasetVersionHash;
bytes32 evalWindowHash;
bytes32 marketDataHash;

// add storage for duplicate protection
mapping(uint256 => mapping(uint256 => bool)) public resultSubmitted;

// submitResult changes (core)
require(strategyNFT.ownerOf(_strategyId) == msg.sender, "Only strategy owner");
require(!resultSubmitted[currentRound][_strategyId], "Result already submitted");

StrategyNFT.Strategy memory strategy = strategyNFT.getStrategy(_strategyId);
bytes32 datasetVersionHash = keccak256(bytes(strategy.datasetVersion));
bytes32 evalWindowHash = keccak256(bytes(strategy.evalWindow));
bytes32 marketDataHash = rounds[currentRound].marketDataHash;

results[currentRound][_strategyId] = TradingResult({
  strategyId: _strategyId,
  pnl: _pnl,
  totalTrades: _totalTrades,
  winningTrades: _winningTrades,
  executionLogHash: _executionLogHash,
  timestamp: block.timestamp,
  roundId: currentRound,
  codeHash: strategy.codeHash,
  paramsHash: strategy.paramsHash,
  datasetVersionHash: datasetVersionHash,
  evalWindowHash: evalWindowHash,
  marketDataHash: marketDataHash
});

resultSubmitted[currentRound][_strategyId] = true;

// verifyResult signature change
function verifyResult(
  uint256 _roundId,
  uint256 _strategyId,
  bytes32 _expectedLogHash,
  bytes32 _expectedCodeHash,
  bytes32 _expectedParamsHash,
  bytes32 _expectedDatasetVersionHash,
  bytes32 _expectedEvalWindowHash,
  bytes32 _expectedMarketDataHash
) external view returns (bool) {
  TradingResult memory r = results[_roundId][_strategyId];
  return r.executionLogHash == _expectedLogHash
    && r.codeHash == _expectedCodeHash
    && r.paramsHash == _expectedParamsHash
    && r.datasetVersionHash == _expectedDatasetVersionHash
    && r.evalWindowHash == _expectedEvalWindowHash
    && r.marketDataHash == _expectedMarketDataHash;
}

// leaderboard sorting (totalPnL)
function getLeaderboard(uint256 limit)
  external
  view
  returns (uint256[] memory strategyIds, int256[] memory pnls)
{
  uint256 total = strategyNFT.totalStrategies();
  if (total == 0) {
    return (new uint256[](0), new int256[](0));
  }
  uint256 count = total < limit ? total : limit;

  uint256[] memory ids = new uint256[](total);
  int256[] memory scores = new int256[](total);
  for (uint256 i = 0; i < total; i++) {
    ids[i] = i + 1;
    scores[i] = totalPnL[i + 1];
  }

  for (uint256 i = 0; i < total; i++) {
    uint256 maxIdx = i;
    for (uint256 j = i + 1; j < total; j++) {
      if (scores[j] > scores[maxIdx]) {
        maxIdx = j;
      }
    }
    if (maxIdx != i) {
      (scores[i], scores[maxIdx]) = (scores[maxIdx], scores[i]);
      (ids[i], ids[maxIdx]) = (ids[maxIdx], ids[i]);
    }
  }

  strategyIds = new uint256[](count);
  pnls = new int256[](count);
  for (uint256 i = 0; i < count; i++) {
    strategyIds[i] = ids[i];
    pnls[i] = scores[i];
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `npm test`
Expected: PASS
