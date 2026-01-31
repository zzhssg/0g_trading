# 端到端 MVP 设计（Storage + Chain + Web + 回测）

日期：2026-01-31

## 目标
- 在 0G 测试网上完成“策略提交 → 回测 → 结果上链 → 可复现验证”的最小闭环。
- 回测逻辑确定性、可复算；链上存证字段最小但足够复现。

## 约束与配置（0G MVP）
- Chain ID: 16602（Galileo Testnet）
- RPC: https://evmrpc-testnet.0g.ai
- Storage Indexer: https://indexer-storage-testnet-turbo.0g.ai
- EVM Version: cancun
- 排除 Compute/DA（后续扩展）

## 方案选项（推荐）
- 方案 A（不改合约）：将“样本 manifest root”直接写入 `marketDataRoot`，靠链下约定解释。
- 方案 B（推荐，最小改动）：明确 `marketDataRoot` 语义为样本 manifest root，并将 `backtestLogRoot` 纳入 `verifyResult`。
- 方案 C（重改）：链上保存样本列表结构，成本与复杂度高。

## 架构与数据流
1) 管理员用 `scripts/data/feather_to_market_json.py` 生成 3 份样本 JSON（符合 `docs/market-data-schema.md`）。
2) 上传样本到 0G Storage，生成 manifest（包含 3 个样本的 storage root 与元信息），计算 manifest root。
3) 管理员调用 `TradingArena.startNewRound` 写入 `marketDataRoot`（manifest root）、`datasetVersionHash`、`evalWindowHash`。
4) 选手提交策略：前端生成 `codeHash/paramsHash`，通过 `StrategyNFT.registerStrategy` 上链，同时上传策略与元数据到 Storage。
5) 回测脚本读取 manifest → 下载样本与策略 → 产出 `backtest.log` 与 `backtest-result.json`。
6) 通过 `scripts/submit-result.ts` 提交结果，链上记录 PnL 与日志哈希。
7) 用户从 Storage 拉取样本与日志复算哈希，调用 `verifyResult` 校验一致。

## 链上字段与存证（最小可复现）
- StrategyNFT：`codeHash`、`paramsHash`、`storageRoot`、`performancePointer`。
- TradingArena：`marketDataRoot`（样本 manifest root）、`datasetVersionHash`、`evalWindowHash`、`backtestLogRoot`、`executionLogHash`、`pnl/totalTrades/winningTrades`。
- 关键校验：`verifyResult` 至少校验 `executionLogHash/codeHash/paramsHash/datasetVersionHash/evalWindowHash/marketDataRoot/backtestLogRoot`。

## 哈希规范（链下约定）
- `codeHash`：策略代码文件内容 hash。
- `paramsHash`：策略参数 JSON 规范化后 hash。
- `backtestLogRoot`：`backtest.log` 内容 hash（与 `hashBacktestLog` 一致）。
- `executionLogHash`：回测结果 JSON 的 hash。
- `marketDataRoot`：样本 manifest root（包含 3 个样本 root 与元信息）。

## 组件职责
- Storage：样本/策略/日志上传下载，产出 rootHash 与 manifest。
- Chain：策略与结果存证，提供可验证字段。
- Backtest：确定性极简回测执行与日志生成。
- Web：最小 UI，完成样本展示、策略提交、结果排名展示。

## 错误处理
- 缺失必填字段（rows/策略字段/log/root）即失败。
- 哈希不一致即判定“不可复现”。
- 轮次非 active 时拒绝提交结果。

## 测试与验证
- 脚本单测：市场数据规范化、回测输出与哈希稳定性。
- 集成验证：固定样本+策略→生成日志→提交→`verifyResult` 通过。
- 复算验证：从 Storage 下载样本/日志，复算哈希并与链上匹配。

## MVP 交付清单
- 合约最小改动（若采用方案 B）。
- 样本规范化与上传 + manifest 生成脚本。
- 回测执行脚本 + 结果提交脚本。
- 前端最小展示与提交。
- 可复现验证演示。

## 5 小时内切片
- 0.5h：环境 + 0G 配置核对
- 1.5h：合约小改与部署
- 1h：Storage 上传与 manifest
- 1h：回测脚本 + 结果提交
- 1h：前端展示 + 验证演示

## 非目标
- 不实现复杂策略规则解析
- 不引入 Compute/DA
- 不做链上回测
