# 回测计算与收益排名（最小可复现链路）设计

日期：2026-01-31

## 目标
- 按 `目标.md` 的 MVP 验收要求：结果可复现、排行榜可用、链上可追溯。
- 选择最快落地路径：脚本跑通回测结果提交，前端只读链上结果（不再本地再计算 PnL）。

## 约束与配置（0G 必须项）
- Chain ID: 16602（Galileo Testnet）
- RPC: https://evmrpc-testnet.0g.ai
- Storage Indexer: https://indexer-storage-testnet-turbo.0g.ai
- EVM Version: cancun

## 当前问题
- 前端调用 `getLeaderboard`，合约实际提供 `getLeaderboardByRound`，ABI 不一致导致链上读取失败。
- 前端榜单基于样本再计算（`computeSamplePnl`），并非链上真实结果。
- 无回测结果提交入口（未调用 `submitResult`）。

## 方案概述（Option C）
- 新增最小脚本作为“结果提交入口”，调用 `TradingArena.submitResult` 上链。
- 前端修正 ABI 与调用：使用 `getLeaderboardByRound(currentRound, limit)`。
- 移除/停用样本再计算的榜单逻辑，榜单仅展示链上结果。

## 数据流
1) 管理员上传市场数据到 0G Storage，得到 `marketDataRoot`。
2) 管理员开启轮次：`startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash)`。
3) 参赛者注册策略：`StrategyNFT.registerStrategy(...)`。
4) 脚本提交回测结果：`submitResult(strategyId, pnl, totalTrades, winningTrades, backtestLogRoot, executionLogHash)`。
5) 前端读取：`currentRound` + `getLeaderboardByRound` 展示排行。

## 前端变更范围
- `frontend/src/app/page.tsx`
  - ABI 替换为 `getLeaderboardByRound`。
  - 读取 `currentRound` 后再请求排行榜。
  - 移除样本再计算排行（不再使用 `computeSamplePnl` 影响榜单）。
  - `currentRound == 0` 为空态提示。
- 测试调整：更新/替换样本再计算用例，验证切换样本不改变榜单值。

## 脚本新增
- `scripts/submit-result.ts`（或参数化 `scripts/smoke.ts`）
  - 参数校验：`strategyId/pnl/backtestLogRoot/executionLogHash` 必填，hash 长度 66。
  - 调用 `submitResult` 并输出 tx 与结果。

## 验证流程（对齐 verify-mvp.md）
- 生成并上传市场数据/策略/回测日志。
- 开启轮次并提交结果。
- 前端读取排行榜与链上哈希。
- 本地复算日志哈希，与链上 `executionLogHash` 一致则通过。

## 非目标
- 不新增 Compute/DA 复杂链路。
- 不在前端本地执行回测。
- 不修改合约逻辑（仅使用现有接口）。

## 风险与缓解
- 轮次未开启导致排行榜为空：前端空态提示；文档要求先 `startNewRound`。
- 提交结果参数错误：脚本校验并输出明确错误。

## 测试策略
- 前端单测：验证榜单不受样本切换影响；验证 `getLeaderboardByRound` 读取流程。
- 合约测试：复用既有 `getLeaderboardByRound` 用例。
