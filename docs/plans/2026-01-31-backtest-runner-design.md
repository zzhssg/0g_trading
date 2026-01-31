# 回测计算 CLI（规则引擎最小闭环）设计

日期：2026-01-31

## Goal
- 补全“回测计算 → 日志哈希 → 结果提交”主流程闭环。
- 维持 KISS/YAGNI：仅支持最小策略规则与单仓位回测。
- 结果可复现：日志哈希与前端验证一致。

## Scope
- 新增 CLI：读取 `strategy.json` 与 `MarketData.json`，生成交易日志与统计结果。
- 最小规则引擎：`logic.type = "indicator-threshold"` + `rsi(14)`。
- 产物可直接用于 `scripts/submit-result.ts`。

## Out of Scope
- 多指标/复杂表达式、跨标的、复杂撮合与滑点模型。
- 0G Compute/DA 接入、后端服务化。
- 前端本地回测替换。

## Data Flow
1) 市场数据：`scripts/data/feather_to_market_json.py` 规范化为 `MarketData.json`。
2) 回测 CLI：解析策略与市场数据 → 生成 `backtest.log`。
3) 计算 `executionLogHash`（复用 `scripts/lib/storageBundle.hashBacktestLog`）。
4) 提交：`scripts/submit-result.ts` 上链写入 `pnl/totalTrades/winningTrades/backtestLogRoot/executionLogHash`。

## CLI & Interfaces
新增脚本（建议）：
- `scripts/backtest-runner.ts`

参数：
- `--strategy ./data/strategy.json`
- `--market ./data/MarketData.json`
- `--out ./data/backtest.log`
- `--meta ./data/backtest.meta.json`
- `--size 1`（默认仓位）
- `--submit`（可选：生成结果后调用 `submit-result`）

输出：
- `backtest.log`：交易流水数组
- `backtest.meta.json`：`pnl/totalTrades/winningTrades/executionLogHash`

## Rule Engine（最小规则）
仅支持：
- `logic.type = "indicator-threshold"`
- `logic.indicators = ["rsi(14)"]`
- `logic.rules` 动作：`entry_long/entry_short/exit_long/exit_short`

执行模型：
- 单仓位：`flat` / `long` / `short`
- 触发时机：每根 K 线收盘价
- 价格：使用 `close`
- 冲突规则：同一根 K 线 `exit` 优先于 `entry`

## Log Format（与前端验证一致）
```
[
  { "entryPrice": 100, "exitPrice": 110, "side": "long", "size": 1, "ts": "2026-01-01T00:00:00Z" }
]
```

## Hash & PnL
- `executionLogHash` 使用 `hashBacktestLog`（canonical JSON）。
- PnL 公式与前端一致：`long: exit-entry`，`short: entry-exit`。
- 若价格为缩放整数，PnL 亦保持缩放单位，保持一致即可。

## Error Handling
- 策略/市场数据缺字段直接报错。
- 数据不足（<14 根）跳过 RSI 评估。
- 无交易：输出空日志、`pnl=0`。

## Tests（最小）
- 单测：`rule_engine` RSI 触发与日志条数、PnL 计算。
- 单测：`market_json` 校验必填字段。
- CLI 冒烟：生成 `backtest.log` 与 meta。

## Risks
- 规则口径与策略期望不一致。
- 缩放单位导致 PnL 误读（需文档明确）。
