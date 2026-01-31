# 回测执行链路与存证绑定（MVP 设计）

日期：2026-01-31

## 目标
- 提供可复现的最小回测链路，输出 `backtest.log` 与 `backtest-result.json`。
- 策略/样本/结果与链上字段严格对齐，可复算哈希与 PnL。

## 0G 配置（固定）
- Chain ID: 16602（Galileo Testnet）
- RPC: https://evmrpc-testnet.0g.ai
- Storage Indexer: https://indexer-storage-testnet-turbo.0g.ai
- EVM Version: cancun

## 架构与数据流（轮次固定样本）
1) 管理员 `startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash)` 固定本轮样本。
2) 用户准备 `strategy.json`（含参数）与 `MarketData.json`（含 rows）。
3) 本地运行 `scripts/backtest-run.ts` 生成：
   - `backtest.log`（数组日志）
   - `backtest-result.json`（pnlBps/totalTrades/winningTrades/backtestLogHash/marketMeta）
4) 上传 `strategy.json` → 得到 `storageRoot`；上传 `backtest.log` → 得到 `performancePointer`。
5) 链上注册策略：`StrategyNFT.registerStrategy(..., storageRoot, performancePointer, tokenURI)`。
6) 链上提交结果：`submitResult(strategyId, pnlBps, totalTrades, winningTrades, backtestLogRoot, executionLogHash)`，其中
   - `backtestLogRoot = performancePointer`
   - `executionLogHash = backtestLogHash`

## 回测逻辑（确定性）
- `entryPrice = rows[0].open`
- `exitPrice = rows[last].close`
- `side = "long"`
- `size = --size`（默认 1）
- `pnlBps = round(((exit-entry)/entry) * 10000 * size)`
- `totalTrades = 1`
- `winningTrades = pnlBps > 0 ? 1 : 0`
- `ts` 取第一根 K 线时间

## backtest.log 格式
数组条目：`{ entryPrice, exitPrice, side, size, ts }`
- 价格为 **已乘 `scale.price` 的整数**（与 `MarketData.json` 一致）
- 与前端验证逻辑保持一致

## CLI 设计（scripts/backtest-run.ts）
- `--market`：市场数据 JSON 路径
- `--strategy`：策略 JSON 路径
- `--outLog`：输出日志路径（默认 `./data/backtest.log`）
- `--outResult`：输出结果路径（默认 `./data/backtest-result.json`）
- `--size`：仓位规模（默认 1）

## 错误处理
- 缺少文件 / JSON 解析失败 → 报错退出
- `rows` 缺失或为空 → 报错退出
- `rows` 缺少 `ts/open/close` → 报错退出

## 可复现验证
1) 读取链上 `executionLogHash` 与 `performancePointer`。
2) 从 0G Storage 下载 `backtest.log`。
3) 使用 `hashBacktestLog` 复算哈希并对比。
4) 使用同一逻辑复算 `pnlBps` 并对比链上 `pnl`。

## 验收标准（MVP）
- 结果可上链：`submit-result.ts` 使用生成的 `backtest-result.json` 成功提交。
- 哈希可复算：`executionLogHash` 一致。
- PnL 可复算：链上 `pnl` 与本地计算一致。
- 存证可读取：`storageRoot/performancePointer` 在 0G Storage 可下载。

## 非目标
- 复杂策略规则解析
- Compute/DA 集成
- 自动化批量提交
