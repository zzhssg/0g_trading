# User Story 2 端到端验证脚本设计

日期：2026-01-31

## 目标
- 新增脚本 `scripts/verify-user-story-2.ts`，串联 Storage 上传、回测产出、策略注册、结果提交。
- 保证样本匹配与可复现：链上存 root/hash，链下可复算 `backtestLogHash` 与 `pnlBps`。

## 0G 配置（固定）
- Chain ID: 16602（Galileo Testnet）
- RPC: https://evmrpc-testnet.0g.ai
- Storage Indexer: https://indexer-storage-testnet-turbo.0g.ai
- EVM Version: cancun

## 数据流（轮次固定样本）
1) 上传 `MarketData.json` → `marketDataRoot`。
2) 读取 `datasetVersion/evalWindow`，计算 `datasetVersionHash/evalWindowHash`。
3) `TradingArena.startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash)`。
4) 读取 `strategy.json`，在脚本内计算 `codeHash/paramsHash`。
5) 运行回测逻辑（复用 `scripts/backtest-run.ts` 的计算方式）生成 `backtest.log` 与 `backtest-result.json`。
6) 上传 `strategy.json` → `storageRoot`；上传 `backtest.log` → `performancePointer`。
7) `StrategyNFT.registerStrategy(..., storageRoot, performancePointer, tokenURI)`。
8) `TradingArena.submitResult(strategyId, pnlBps, totalTrades, winningTrades, backtestLogRoot=performancePointer, executionLogHash=backtestLogHash)`。
9) 输出验证摘要（roots、hashes、tokenId、roundId、txHash）。

## CLI 设计
- 必填：`--market`、`--strategy`、`--arena`、`--nft`
- 可选：`--outDir`（默认 `./data/verify`）、`--size`（默认 1）

## 输出产物
- `backtest.log`
- `backtest-result.json`
- `verify-user-story-2.json`（记录 roots、hashes、tokenId、roundId、txHash）

## 错误处理
- 参数缺失或 JSON 解析失败
- `rows` 为空或缺少 `ts/open/close`
- Storage 上传失败 / 合约调用失败

## 验证与复算
- 使用 `hashBacktestLog` 复算 `executionLogHash`。
- `pnlBps` 与链上 `pnl` 一致。

## 非目标
- Compute/DA 集成
- 多策略批量提交
- 复杂策略解析
