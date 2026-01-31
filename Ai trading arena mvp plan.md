# 🏆 Verifiable AI Trading Arena - MVP 规划方案

## 📋 项目概述

**项目名称**: Verifiable AI Trading Arena (可验证AI交易竞技场)

**核心理念**: 让 AI 交易从"概率"变成"科学" — 实现策略、执行、结果的全流程透明与可验证

**比赛要求**: 5小时内完成MVP，成功部署至0G Galileo测试网

---

## 🎯 产品终态设计

### 完整产品愿景

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Trading Arena 架构                         │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: 前端界面                                               │
│  ├── 策略注册/提交页面                                            │
│  ├── 实时排行榜 Dashboard                                        │
│  ├── 策略详情/可验证记录查看                                       │
│  └── 钱包连接 & 用户中心                                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: 核心智能合约 (0G Chain)                                 │
│  ├── StrategyRegistry.sol (策略注册，基于ERC-7857 INFT)            │
│  ├── TradingArena.sol (竞技场核心逻辑)                            │
│  ├── ResultVerifier.sol (结果验证)                               │
│  └── Leaderboard.sol (排名与奖励分配)                             │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: 数据层 (0G DA + Storage)                               │
│  ├── 统一市场数据输入 (DA层)                                       │
│  ├── 策略元数据存储 (0G Storage)                                  │
│  ├── 执行日志存储 (0G Storage)                                    │
│  └── 历史记录 & 可验证证明                                         │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: 执行层 (0G Compute)                                    │
│  ├── 可信执行环境 (TEE)                                           │
│  ├── 回测引擎                                                    │
│  └── 实时模拟交易执行                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 核心功能模块

| 模块 | 功能描述 | 0G技术 |
|------|----------|--------|
| 策略注册 | 用户提交AI交易策略，铸造为INFT | ERC-7857 + 0G Storage |
| 数据输入 | 统一的市场数据源，确保公平竞争 | 0G DA |
| 可信执行 | 策略在可信环境中执行/回测 | 0G Compute |
| 结果记录 | 所有交易结果上链，不可篡改 | 0G DA + Log |
| 排名系统 | 自动计算排名，智能合约结算 | 0G Chain |
| 可验证性 | 任何人可复现和验证策略表现 | 全栈0G |

---

## 🚀 MVP 功能范围 (5小时可完成)

### MVP 核心功能 ✅

1. **策略注册系统**
   - 简化版ERC-721合约（不用完整ERC-7857）
   - 策略元数据Hash上链
   - 策略文件上传到0G Storage

2. **模拟交易竞技场**
   - 简化的价格模拟器
   - 基础交易记录
   - 结果Hash上链

3. **排行榜展示**
   - 实时排名计算
   - 收益率展示
   - 策略详情查看

4. **前端界面**
   - 钱包连接
   - 策略提交表单
   - 排行榜页面

### MVP 简化决策

| 完整版功能 | MVP简化版 |
|-----------|----------|
| ERC-7857 完整实现 | 简化版ERC-721 + metadata hash |
| 0G Compute可信执行 | 链下模拟 + 结果hash上链 |
| 实时市场数据 | 模拟价格数据 |
| 复杂策略执行 | 简单买卖信号 |

---

## 🧩 策略 INFT 设计（MVP 规则驱动）

### 目标与边界
- 规则驱动策略，参考 freqtrade 的“信号-执行”分层
- 单一固定标的、分钟级 K 线、合约双向
- 全仓进出 + 固定止损/止盈百分比
- 可复算为第一原则（无未来函数、seed ≡ incremental）

### 链上最小可验证字段
- `codeHash`：策略代码哈希
- `paramsHash`：参数哈希
- `datasetVersion`：分钟级数据版本
- `evalWindow`：评测窗口（起止时间）
- `backtestLogHash`：回测日志哈希
- `strategyId`、`creator`、`createdAt`

### 链下存证材料
- 策略文件与参数 JSON
- 数据切片索引与回测日志原文

### 验证与排名口径
- 验证流程: 复算回测日志 → 对比 `backtestLogHash`
- 排名口径: MVP 仅使用单一指标（如累计收益或净值收益率）
- 固定假设: 手续费、滑点、杠杆上限固定
- 结果无效条件: 日志中断、数据缺失、哈希不一致

---

## 🧪 最小策略样例 JSON + 哈希流程

### 样例（链下元数据 JSON）
```json
{
  "strategy": { "name": "rsi-threshold-v1", "version": "1.0.0", "author": "anon", "description": "RSI 阈值多空" },
  "instrument": { "symbol": "BTC/USDT", "timeframe": "1m", "market": "perp" },
  "logic": {
    "type": "indicator-threshold",
    "indicators": ["rsi(14)"],
    "rules": [
      { "if": "rsi < 30", "then": "entry_long" },
      { "if": "rsi > 70", "then": "entry_short" },
      { "if": "rsi > 50", "then": "exit_long" },
      { "if": "rsi < 50", "then": "exit_short" }
    ],
    "slPct": 0.02,
    "tpPct": 0.04
  },
  "execution": { "position": "all-in", "direction": "long+short", "feeBps": 4, "slippageBps": 6, "leverage": 2 },
  "verification": { "datasetVersion": "v1", "evalWindow": "2025-01-01~2025-02-01", "backtestLogHash": "0x..." }
}
```

### 哈希计算流程（建议）
1) 规范化 JSON（字段排序、去空白）  
2) `codeHash = keccak256(strategy_code_bytes)`  
3) `paramsHash = keccak256(canonical_json_bytes)`  
4) 执行回测生成 `backtestLog`，计算 `backtestLogHash`  
5) 将 `codeHash/paramsHash/datasetVersion/evalWindow/backtestLogHash` 上链

---

## 📁 项目结构

```
ai-trading-arena/
├── contracts/                    # 智能合约
│   ├── StrategyNFT.sol          # 策略NFT合约
│   ├── TradingArena.sol         # 竞技场核心合约
│   └── interfaces/
│       └── IStrategyNFT.sol
├── frontend/                     # 前端应用
│   ├── src/
│   │   ├── components/
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── StrategySubmit.tsx
│   │   │   ├── Leaderboard.tsx
│   │   │   └── StrategyDetail.tsx
│   │   ├── hooks/
│   │   │   ├── useContract.ts
│   │   │   └── useStorage.ts
│   │   ├── utils/
│   │   │   ├── 0g-storage.ts
│   │   │   └── contracts.ts
│   │   └── App.tsx
│   └── package.json
├── scripts/
│   ├── deploy.ts                # 部署脚本
│   └── simulate.ts              # 模拟交易脚本
├── test/
│   └── TradingArena.test.ts
├── hardhat.config.ts
└── README.md
```

---

## ⏰ 5小时开发时间表

### Phase 1: 环境搭建 (30分钟)

```bash
# 1. 初始化项目
mkdir ai-trading-arena && cd ai-trading-arena
npm init -y

# 2. 安装依赖
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox typescript
npm install ethers @0glabs/0g-ts-sdk dotenv
npm install @openzeppelin/contracts

# 3. 初始化Hardhat
npx hardhat init

# 4. 配置环境变量
# .env 文件
PRIVATE_KEY=your_private_key
RPC_URL=https://evmrpc-testnet.0g.ai
STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
```

**hardhat.config.ts 配置:**
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    "0g-testnet": {
      url: "https://evmrpc-testnet.0g.ai",
      chainId: 16602,
      accounts: [process.env.PRIVATE_KEY || ""]
    }
  }
};
export default config;
```

### Phase 2: 智能合约开发 (1.5小时)

**contracts/StrategyNFT.sol:**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract StrategyNFT is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
    
    // 策略元数据
    struct Strategy {
        bytes32 codeHash;        // 策略代码的hash
        bytes32 paramsHash;      // 参数hash
        string datasetVersion;   // 数据集版本
        string evalWindow;       // 评测窗口
        string storageRoot;      // 0G Storage root hash
        uint256 createdAt;
        address creator;
        bool isActive;
    }
    
    mapping(uint256 => Strategy) public strategies;
    
    event StrategyRegistered(
        uint256 indexed tokenId, 
        address indexed creator, 
        bytes32 codeHash,
        bytes32 paramsHash,
        string datasetVersion,
        string evalWindow,
        string storageRoot
    );
    
    constructor() ERC721("AI Trading Strategy", "AITS") {}
    
    function registerStrategy(
        bytes32 _codeHash,
        bytes32 _paramsHash,
        string memory _datasetVersion,
        string memory _evalWindow,
        string memory _storageRoot,
        string memory _tokenURI
    ) external returns (uint256) {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);
        
        strategies[newTokenId] = Strategy({
            codeHash: _codeHash,
            paramsHash: _paramsHash,
            datasetVersion: _datasetVersion,
            evalWindow: _evalWindow,
            storageRoot: _storageRoot,
            createdAt: block.timestamp,
            creator: msg.sender,
            isActive: true
        });
        
        emit StrategyRegistered(
            newTokenId,
            msg.sender,
            _codeHash,
            _paramsHash,
            _datasetVersion,
            _evalWindow,
            _storageRoot
        );
        return newTokenId;
    }
    
    function getStrategy(uint256 tokenId) external view returns (Strategy memory) {
        require(_exists(tokenId), "Strategy does not exist");
        return strategies[tokenId];
    }
    
    function totalStrategies() external view returns (uint256) {
        return _tokenIds.current();
    }
    
    // Override required functions
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
```

**contracts/TradingArena.sol:**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./StrategyNFT.sol";

contract TradingArena {
    StrategyNFT public strategyNFT;
    
    struct TradingResult {
        uint256 strategyId;
        int256 pnl;              // 盈亏 (basis points, 10000 = 100%)
        uint256 totalTrades;
        uint256 winningTrades;
        bytes32 executionLogHash; // 执行日志的hash (存储在0G Storage)
        uint256 timestamp;
        uint256 roundId;
    }
    
    struct Round {
        uint256 startTime;
        uint256 endTime;
        bytes32 marketDataHash;  // 该轮次使用的市场数据hash
        bool finalized;
    }
    
    uint256 public currentRound;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint256 => TradingResult)) public results; // roundId => strategyId => result
    mapping(uint256 => uint256[]) public roundParticipants; // roundId => strategyIds
    
    // 排行榜
    mapping(uint256 => int256) public totalPnL; // strategyId => cumulative PnL
    
    event RoundStarted(uint256 indexed roundId, bytes32 marketDataHash);
    event ResultSubmitted(uint256 indexed roundId, uint256 indexed strategyId, int256 pnl);
    event RoundFinalized(uint256 indexed roundId);
    
    constructor(address _strategyNFT) {
        strategyNFT = StrategyNFT(_strategyNFT);
    }
    
    // 开始新一轮竞赛
    function startNewRound(bytes32 _marketDataHash) external {
        currentRound++;
        rounds[currentRound] = Round({
            startTime: block.timestamp,
            endTime: 0,
            marketDataHash: _marketDataHash,
            finalized: false
        });
        
        emit RoundStarted(currentRound, _marketDataHash);
    }
    
    // 提交交易结果 (由可信执行者调用，MVP阶段简化为任何人可提交)
    function submitResult(
        uint256 _strategyId,
        int256 _pnl,
        uint256 _totalTrades,
        uint256 _winningTrades,
        bytes32 _executionLogHash
    ) external {
        require(rounds[currentRound].startTime > 0, "No active round");
        require(!rounds[currentRound].finalized, "Round finalized");
        require(strategyNFT.ownerOf(_strategyId) != address(0), "Invalid strategy");
        
        results[currentRound][_strategyId] = TradingResult({
            strategyId: _strategyId,
            pnl: _pnl,
            totalTrades: _totalTrades,
            winningTrades: _winningTrades,
            executionLogHash: _executionLogHash,
            timestamp: block.timestamp,
            roundId: currentRound
        });
        
        roundParticipants[currentRound].push(_strategyId);
        totalPnL[_strategyId] += _pnl;
        
        emit ResultSubmitted(currentRound, _strategyId, _pnl);
    }
    
    // 结束当前轮次
    function finalizeRound() external {
        require(rounds[currentRound].startTime > 0, "No active round");
        require(!rounds[currentRound].finalized, "Already finalized");
        
        rounds[currentRound].endTime = block.timestamp;
        rounds[currentRound].finalized = true;
        
        emit RoundFinalized(currentRound);
    }
    
    // 获取排行榜
    function getLeaderboard(uint256 limit) external view returns (
        uint256[] memory strategyIds,
        int256[] memory pnls
    ) {
        uint256 total = strategyNFT.totalStrategies();
        uint256 count = total < limit ? total : limit;
        
        strategyIds = new uint256[](count);
        pnls = new int256[](count);
        
        // 简化版：直接返回前N个策略的PnL
        // 完整版应该实现排序
        for (uint256 i = 1; i <= count; i++) {
            strategyIds[i-1] = i;
            pnls[i-1] = totalPnL[i];
        }
        
        return (strategyIds, pnls);
    }
    
    // 获取某策略在特定轮次的结果
    function getResult(uint256 _roundId, uint256 _strategyId) 
        external view returns (TradingResult memory) 
    {
        return results[_roundId][_strategyId];
    }
    
    // 验证结果的可复现性
    function verifyResult(
        uint256 _roundId,
        uint256 _strategyId,
        bytes32 _expectedLogHash
    ) external view returns (bool) {
        return results[_roundId][_strategyId].executionLogHash == _expectedLogHash;
    }
}
```

### Phase 3: 部署脚本 (30分钟)

**scripts/deploy.ts:**
```typescript
import { ethers } from "hardhat";

async function main() {
  console.log("Deploying to 0G Galileo Testnet...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  // 部署 StrategyNFT
  const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
  const strategyNFT = await StrategyNFT.deploy();
  await strategyNFT.waitForDeployment();
  console.log("StrategyNFT deployed to:", await strategyNFT.getAddress());
  
  // 部署 TradingArena
  const TradingArena = await ethers.getContractFactory("TradingArena");
  const tradingArena = await TradingArena.deploy(await strategyNFT.getAddress());
  await tradingArena.waitForDeployment();
  console.log("TradingArena deployed to:", await tradingArena.getAddress());
  
  // 保存合约地址
  console.log("\n--- Deployment Summary ---");
  console.log(`STRATEGY_NFT_ADDRESS=${await strategyNFT.getAddress()}`);
  console.log(`TRADING_ARENA_ADDRESS=${await tradingArena.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

**部署命令:**
```bash
npx hardhat run scripts/deploy.ts --network 0g-testnet
```

### Phase 4: 前端开发 (2小时)

**前端技术栈:**
- Next.js 14 / React
- ethers.js v6
- @0glabs/0g-ts-sdk
- TailwindCSS
- wagmi + viem (钱包连接)

**关键组件实现:**

```typescript
// hooks/useContract.ts
import { ethers } from 'ethers';
import { useCallback } from 'react';
import StrategyNFTABI from '../abi/StrategyNFT.json';
import TradingArenaABI from '../abi/TradingArena.json';

const STRATEGY_NFT_ADDRESS = process.env.NEXT_PUBLIC_STRATEGY_NFT_ADDRESS!;
const TRADING_ARENA_ADDRESS = process.env.NEXT_PUBLIC_TRADING_ARENA_ADDRESS!;

export function useContracts() {
  const getProvider = useCallback(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      return new ethers.BrowserProvider(window.ethereum);
    }
    return new ethers.JsonRpcProvider('https://evmrpc-testnet.0g.ai');
  }, []);

  const getStrategyNFT = useCallback(async (withSigner = false) => {
    const provider = getProvider();
    const signerOrProvider = withSigner 
      ? await provider.getSigner() 
      : provider;
    return new ethers.Contract(STRATEGY_NFT_ADDRESS, StrategyNFTABI, signerOrProvider);
  }, [getProvider]);

  const getTradingArena = useCallback(async (withSigner = false) => {
    const provider = getProvider();
    const signerOrProvider = withSigner 
      ? await provider.getSigner() 
      : provider;
    return new ethers.Contract(TRADING_ARENA_ADDRESS, TradingArenaABI, signerOrProvider);
  }, [getProvider]);

  return { getStrategyNFT, getTradingArena, getProvider };
}
```

```typescript
// utils/0g-storage.ts
import { Indexer, ZgFile } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';

const INDEXER_RPC = 'https://indexer-storage-testnet-turbo.0g.ai';
const EVM_RPC = 'https://evmrpc-testnet.0g.ai';

export async function uploadStrategyToStorage(
  strategyCode: string,
  privateKey: string
): Promise<{ rootHash: string; txHash: string }> {
  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  const signer = new ethers.Wallet(privateKey, provider);
  const indexer = new Indexer(INDEXER_RPC);
  
  // 创建临时文件
  const blob = new Blob([strategyCode], { type: 'application/json' });
  const file = await ZgFile.fromBlob(blob);
  
  // 获取merkle tree
  const [tree, err] = await file.merkleTree();
  if (err) throw new Error('Failed to create merkle tree');
  
  // 上传到0G Storage
  const [tx, uploadErr] = await indexer.upload(file, EVM_RPC, signer);
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr}`);
  
  await file.close();
  
  return {
    rootHash: tree!.rootHash(),
    txHash: tx!
  };
}

export async function downloadFromStorage(rootHash: string): Promise<string> {
  const indexer = new Indexer(INDEXER_RPC);
  
  // 下载文件内容
  const content = await indexer.download(rootHash);
  return content;
}
```

```tsx
// components/StrategySubmit.tsx
'use client';
import { useState } from 'react';
import { ethers } from 'ethers';
import { useContracts } from '../hooks/useContract';
import { uploadStrategyToStorage } from '../utils/0g-storage';

export function StrategySubmit() {
  const [strategyCode, setStrategyCode] = useState('');
  const [strategyName, setStrategyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tokenId: string; storageRoot: string } | null>(null);
  const { getStrategyNFT } = useContracts();

  const handleSubmit = async () => {
    if (!strategyCode || !strategyName) return;
    
    setLoading(true);
    try {
      // 1. 计算策略代码hash
      const codeHash = ethers.keccak256(ethers.toUtf8Bytes(strategyCode));
      const paramsHash = ethers.keccak256(ethers.toUtf8Bytes(strategyCode));
      const datasetVersion = 'v1';
      const evalWindow = '2025-01-01~2025-02-01';
      
      // 2. 上传到0G Storage (简化版：直接使用hash)
      // const { rootHash } = await uploadStrategyToStorage(strategyCode, privateKey);
      const storageRoot = codeHash; // MVP简化
      
      // 3. 创建NFT元数据
      const metadata = {
        name: strategyName,
        description: 'AI Trading Strategy',
        attributes: [
          { trait_type: 'Code Hash', value: codeHash },
          { trait_type: 'Params Hash', value: paramsHash },
          { trait_type: 'Dataset Version', value: datasetVersion },
          { trait_type: 'Eval Window', value: evalWindow },
          { trait_type: 'Created At', value: new Date().toISOString() }
        ]
      };
      const tokenURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;
      
      // 4. 调用合约注册策略
      const contract = await getStrategyNFT(true);
      const tx = await contract.registerStrategy(
        codeHash,
        paramsHash,
        datasetVersion,
        evalWindow,
        storageRoot,
        tokenURI
      );
      const receipt = await tx.wait();
      
      // 5. 获取tokenId
      const event = receipt.logs.find((log: any) => 
        log.fragment?.name === 'StrategyRegistered'
      );
      const tokenId = event?.args?.[0]?.toString() || 'Unknown';
      
      setResult({ tokenId, storageRoot });
    } catch (error) {
      console.error('Submit failed:', error);
      alert('提交失败，请检查钱包连接');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4">📝 注册交易策略</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-2">策略名称</label>
          <input
            type="text"
            value={strategyName}
            onChange={(e) => setStrategyName(e.target.value)}
            className="w-full bg-gray-700 rounded px-4 py-2"
            placeholder="My Awesome Strategy"
          />
        </div>
        
        <div>
          <label className="block text-sm mb-2">策略代码 (JSON格式)</label>
          <textarea
            value={strategyCode}
            onChange={(e) => setStrategyCode(e.target.value)}
            className="w-full bg-gray-700 rounded px-4 py-2 h-40 font-mono text-sm"
            placeholder={`{
  "type": "momentum",
  "params": {
    "lookback": 20,
    "threshold": 0.02
  }
}`}
          />
        </div>
        
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 
                     rounded py-3 font-bold transition-colors"
        >
          {loading ? '提交中...' : '🚀 注册策略 (铸造NFT)'}
        </button>
        
        {result && (
          <div className="mt-4 p-4 bg-green-900/50 rounded">
            <p>✅ 策略注册成功!</p>
            <p className="text-sm text-gray-400 mt-2">
              Token ID: {result.tokenId}
            </p>
            <p className="text-sm text-gray-400 truncate">
              Storage Root: {result.storageRoot}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

```tsx
// components/Leaderboard.tsx
'use client';
import { useEffect, useState } from 'react';
import { useContracts } from '../hooks/useContract';

interface LeaderboardEntry {
  rank: number;
  strategyId: string;
  pnl: number;
  creator: string;
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { getStrategyNFT, getTradingArena } = useContracts();

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const arena = await getTradingArena();
      const nft = await getStrategyNFT();
      
      const [strategyIds, pnls] = await arena.getLeaderboard(10);
      
      const entriesData = await Promise.all(
        strategyIds.map(async (id: bigint, index: number) => {
          const strategy = await nft.getStrategy(id);
          return {
            rank: index + 1,
            strategyId: id.toString(),
            pnl: Number(pnls[index]) / 100, // basis points to percentage
            creator: strategy.creator
          };
        })
      );
      
      // 按PnL排序
      entriesData.sort((a, b) => b.pnl - a.pnl);
      entriesData.forEach((entry, i) => entry.rank = i + 1);
      
      setEntries(entriesData);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4">🏆 策略排行榜</h2>
      
      {loading ? (
        <p className="text-center py-8">加载中...</p>
      ) : entries.length === 0 ? (
        <p className="text-center py-8 text-gray-400">暂无策略参赛</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2">排名</th>
              <th className="text-left py-2">策略ID</th>
              <th className="text-right py-2">累计收益</th>
              <th className="text-left py-2">创建者</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.strategyId} className="border-b border-gray-700/50">
                <td className="py-3">
                  {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                </td>
                <td className="py-3">
                  <span className="font-mono">#{entry.strategyId}</span>
                </td>
                <td className={`py-3 text-right font-bold ${entry.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {entry.pnl >= 0 ? '+' : ''}{entry.pnl.toFixed(2)}%
                </td>
                <td className="py-3 text-gray-400 truncate max-w-[150px]">
                  {entry.creator.slice(0, 6)}...{entry.creator.slice(-4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      
      <button
        onClick={loadLeaderboard}
        className="mt-4 w-full bg-gray-700 hover:bg-gray-600 rounded py-2 transition-colors"
      >
        🔄 刷新排行榜
      </button>
    </div>
  );
}
```

### Phase 5: 测试与部署 (30分钟)

```bash
# 1. 编译合约
npx hardhat compile

# 2. 获取测试代币
# 访问 https://faucet.0g.ai/ 获取0.1 OG

# 3. 部署到测试网
npx hardhat run scripts/deploy.ts --network 0g-testnet

# 4. 验证合约 (可选)
npx hardhat verify --network 0g-testnet <CONTRACT_ADDRESS>

# 5. 前端构建
cd frontend && npm run build

# 6. 部署前端 (Vercel/Netlify)
vercel deploy
```

---

## ✅ MVP 交付清单（最小合约 + 最小前端）

### MVP 验收清单（与比赛目标对齐）
- 部署到 0G Galileo 测试网（chainId=16602）
- 策略注册链上留痕（codeHash/paramsHash/datasetVersion/evalWindow）
- 回测/模拟结果可复算，`backtestLogHash` 可对比一致
- 存证材料可复核（策略文件、参数 JSON、回测日志原文）
- 排行榜/结果展示可用（单一指标如收益率）

### 链上最小可验证字段
- `codeHash`、`paramsHash`
- `datasetVersion`、`evalWindow`
- `backtestLogHash`
- `strategyId`、`creator`、`createdAt`

### 部署配置（最小必要）
- RPC: `https://evmrpc-testnet.0g.ai`
- Chain ID: `16602`
- Storage Indexer: `https://indexer-storage-testnet-turbo.0g.ai`
- EVM Version: `cancun`（Hardhat/Foundry 必设）

### 验证步骤（可复现性）
1. 读取链上字段与 `backtestLogHash`
2. 从 0G Storage 下载策略/参数/日志
3. 本地复算日志并重算哈希
4. 对比链上哈希一致即通过

### 扩展路径（可选）
- Compute：接入 `@0glabs/0g-serving-broker` 完成推理与响应验证
- DA：仅在需要可用性证明/rollup 时引入

---

## 🔑 关键配置信息

### 0G Galileo Testnet 配置

| 配置项 | 值 |
|--------|-----|
| Network Name | 0G Galileo Testnet |
| Chain ID | 16602 |
| RPC URL | https://evmrpc-testnet.0g.ai |
| Currency Symbol | OG |
| Block Explorer | https://chainscan-galileo.0g.ai |
| Faucet | https://faucet.0g.ai |

### 0G Storage 配置

| 服务 | URL |
|------|-----|
| Indexer RPC | https://indexer-storage-testnet-turbo.0g.ai |
| Flow Contract | 0x22E03a6A89B950F1c82ec5e74F8eCa321a105296 |

### 0G DA 配置

| 服务 | 地址 |
|------|------|
| DAEntrance | 0xE75A073dA5bb7b0eC622170Fd268f35E675a957B |

---

## 🎪 Demo 演示流程

1. **连接钱包** → MetaMask 连接到 0G 测试网
2. **注册策略** → 提交策略代码，铸造 NFT
3. **开始竞赛** → 管理员启动新一轮竞赛
4. **提交结果** → 模拟执行后提交结果
5. **查看排名** → 排行榜实时更新
6. **验证结果** → 展示结果可验证性

---

## 🔮 后续扩展方向

### 短期 (比赛后1周)
- [ ] 集成真实 0G Storage 上传
- [ ] 实现 0G Compute 可信执行
- [ ] 添加更多交易策略模板

### 中期 (1个月)
- [ ] 完整 ERC-7857 INFT 实现
- [ ] 真实市场数据接入
- [ ] 策略回测引擎

### 长期
- [ ] 去中心化策略执行网络
- [ ] 质押与奖励机制
- [ ] 跨链策略支持

---

## 📚 参考资料

- [0G Documentation](https://docs.0g.ai/)
- [0G Builder Hub](https://build.0g.ai/)
- [0G TypeScript SDK](https://github.com/0gfoundation/0g-ts-sdk)
- [ERC-7857 Standard](https://docs.0g.ai/developer-hub/building-on-0g/inft/erc7857)
- [Hardhat Documentation](https://hardhat.org/docs)

---

**祝比赛顺利！🚀**
