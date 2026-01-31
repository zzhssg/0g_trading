# 极简回测执行链路设计（MVP）

日期：2026-01-31

## 目标
- 提供可复现的“回测执行”最小链路，输出 `backtest.log` 与 `pnlBps` 等指标。
- 结果可用 `hashBacktestLog` 复算一致，并与 `submit-result.ts` 对齐。

## 约束与配置（0G MVP）
- Chain ID: 16602（Galileo Testnet）
- RPC: https://evmrpc-testnet.0g.ai
- Storage Indexer: https://indexer-storage-testnet-turbo.0g.ai
- EVM Version: cancun

## 方案概述
新增脚本 `scripts/backtest-run.ts`：
- 输入：`MarketData.json`（含 rows）+ `strategy.json`
- 输出：`backtest.log` + `backtest-result.json`
- 复用 `scripts/lib/storageBundle.ts` 的 `hashBacktestLog` 保持哈希一致
- 不自动上链，仅产出指标供 `submit-result.ts` 使用

## 数据流
1) 读取 `MarketData.json` 的 `rows`（OHLCV）
2) 读取 `strategy.json`（仅做基本存在性检查，不解析复杂规则）
3) 极简回测：第一根开多、最后一根平仓
4) 生成 `backtest.log` 与 `backtestLogHash`
5) 生成 `backtest-result.json`（pnlBps/totalTrades/winningTrades/backtestLogHash/marketMeta）

## 回测逻辑（确定性）
- 取 `rows[0].open` 为 `entryPrice`，`rows[last].close` 为 `exitPrice`
- `side = "long"`，`size = --size`（默认 1）
- `pnlBps = round(((exit-entry)/entry) * 10000 * size)`
- `totalTrades = 1`
- `winningTrades = pnlBps > 0 ? 1 : 0`
- 日志 `ts` 取第一根时间

## CLI 设计
- `--market`：市场数据 JSON 路径
- `--strategy`：策略 JSON 路径
- `--outLog`：输出日志路径（默认 `./data/backtest.log`）
- `--outResult`：输出结果路径（默认 `./data/backtest-result.json`）
- `--size`：仓位规模（默认 1）

## 错误处理
- 缺少文件 / JSON 解析失败 → 报错退出
- `rows` 缺失或为空 → 报错退出
- `rows` 缺少 open/close/ts → 报错退出

## 测试策略（TDD）
- 新增 `test/backtest-run.spec.ts`：
  - 最小 market 数据（2 根 K）+ 任意 strategy
  - 校验 `backtest.log` 结构、`pnlBps` 计算与 `backtestLogHash` 稳定
  - 缺少 rows 时抛错

## 非目标
- 不实现复杂策略规则解析
- 不自动提交链上
- 不引入 Compute/DA
