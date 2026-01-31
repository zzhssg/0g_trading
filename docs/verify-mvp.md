# MVP 可复现验证流程

本流程用于验证链上 `backtestLogHash` 与 0G Storage 存证一致性。

## 1. 准备环境

确保 `.env/siyao` 包含：

- `RPC_URL=https://evmrpc-testnet.0g.ai`
- `CHAIN_ID=16602`
- `INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai`
- `PRIVATE_KEY=...`

## 2. 生成并上传市场数据（0G Storage 指针）

```bash
python3 scripts/data/feather_to_market_json.py \
  --input ./data/BTC_USDT-1m.feather \
  --output ./data/MarketData.json \
  --start "2024-01-01T00:00:00Z" \
  --end "2024-01-07T00:00:00Z" \
  --dataset-version v1 \
  --price-scale 100 \
  --volume-scale 100

node scripts/storage-upload-file.ts --file ./data/MarketData.json --out ./data/market-upload.json
```

输出：
- `marketDataRoot`：`market-upload.json` 中的 `root`

## 3. 上传策略代码（0G Storage 指针）

```bash
node scripts/storage-upload-file.ts --file ./data/Strategy.js --out ./data/strategy-upload.json
```

输出：
- `strategyCodeRoot`：`strategy-upload.json` 中的 `root`

## 4. 设置本轮数据集 root（管理员）

```bash
node -e \"const hre=require('hardhat');(async()=>{const [owner]=await hre.ethers.getSigners();const arena=await hre.ethers.getContractAt('TradingArena', process.env.TRADING_ARENA_ADDRESS, owner);const datasetVersion='v1';const evalWindow='2024-01-01T00:00:00Z~2024-01-07T00:00:00Z';const datasetVersionHash=hre.ethers.keccak256(hre.ethers.toUtf8Bytes(datasetVersion));const evalWindowHash=hre.ethers.keccak256(hre.ethers.toUtf8Bytes(evalWindow));await arena.startNewRound('<marketDataRoot>', datasetVersionHash, evalWindowHash);console.log('round', (await arena.currentRound()).toString());})().catch(console.error);\" --network 0g-testnet
```

## 5. 上传回测日志与元数据（bundle）

```bash
node scripts/storage-upload.ts \
  --strategy ./data/strategy.json \
  --params ./data/params.json \
  --log ./data/backtest.log \
  --out ./data/storage-bundle.json
```

输出：
- `storageRoot`：策略 JSON 的 root（仅用于元数据）
- `performancePointer`：回测日志 root（作为 `backtestLogRoot` 使用）
- `backtestLogHash`：用于提交结果（即 executionLogHash）
- `tokenURI`：NFT 元数据 URI

链上写入（当前合约含 performancePointer 参数）：
- `StrategyNFT.registerStrategy`：`storageRoot = strategyCodeRoot`，`performancePointer = backtestLogRoot`
- `TradingArena.submitResult`：`backtestLogRoot` + `backtestLogHash`

## 6. 本地复算与对比

前端“策略工厂”中：
1) 填入 Strategy Code / Market Data JSON  
2) 点击 **Local Verify (Run Strategy)**  
3) 将本地 PnL 与链上排行榜对应策略的 PnL 对比  

## 7. 验证通过标准

- 复算结果 == 链上 `backtestLogHash`（executionLogHash）
- 轮次 `datasetVersionHash/evalWindowHash` 与本地窗口一致
- 可沿 `strategyCodeRoot` 与 `marketDataRoot` 追溯策略与数据集
