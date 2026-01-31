# TradingArena 结果可复现性最小增强设计

日期: 2026-01-31

## 目标
在不引入 0G Compute 的前提下，增强链上结果的可复现性与验证强度，满足 MVP 的“可复算、可核对、可排名”。约束：最小改动、保持现有合约结构、避免新增依赖。

## 决策与范围
- 策略代码与执行日志：落在 0G Storage。
- 市场数据：从 `BTC_USDT-1m.feather` 规范化为 JSON 后上传 0G Storage，链上引用其 root。
- 轮次配置：每轮独立设置并锁死 `datasetVersionHash` 与 `evalWindowHash`（UTC ISO 时间段）。
- 验证：浏览器端复算（前端下载并重算）。
- 日志哈希口径：规范化 JSON + keccak256。

## 设计要点
1) **轮次锁定**：`Round` 增加 `marketDataRoot`、`datasetVersionHash`、`evalWindowHash`，创建后不可变。
2) **权限边界**：仅管理员可 `startNewRound/finalizeRound`；仅策略 NFT 持有人可提交回测结果。
3) **重复提交**：同一轮次同一策略只允许提交一次。
4) **可复现绑定**：结果记录绑定 `codeHash/paramsHash` 与轮次三元组（marketDataRoot/datasetVersionHash/evalWindowHash）。
5) **日志可追溯**：结果新增 `backtestLogRoot`（日志原文 0G Storage root）+ `executionLogHash`。
6) **排行榜排序**：基于当轮参与者列表，在 view 层按 pnl 排序输出（MVP 规模可接受）。
7) **数据规范化**：feather → JSON（UTC、字段固定、精度固定）以避免跨环境浮点偏差。

## 数据流
1) **策略注册（StrategyNFT）**
   - 0G Storage 上传策略代码/元数据，得到 `storageRoot`。
   - 铸造 NFT：写入 `codeHash/paramsHash/datasetVersion/evalWindow/storageRoot`。
2) **回合开始（TradingArena）**
   - 写入 `marketDataRoot + datasetVersionHash + evalWindowHash`。
3) **结果提交**
   - 校验 msg.sender 为策略持有人
   - 校验本轮未提交
   - 写入 `backtestLogRoot + executionLogHash`
   - 记录 `codeHash/paramsHash` 与轮次三元组
4) **验证**
   - 读取 `storageRoot/backtestLogRoot/marketDataRoot/executionLogHash`
   - 下载策略与日志，拉取市场数据切片（规范化 JSON）
   - 浏览器复算并对比 `executionLogHash`

## 日志规范（MVP）
- 日志结构：交易流水数组（entry/exit/side/size/ts/strategyHash）。
- 规范化：字段排序 + 去空白 + 数字统一字符串格式。
- 哈希：`keccak256(canonical_json)`。

## 错误处理与最小验收
- 无活跃回合/回合已结束 → revert
- 非持有人提交 → revert
- 重复提交 → revert
- 验证失败 → 返回 false

验收：同一策略在同一轮提交一次；第三方复算日志哈希后可通过 verifyResult；排行榜按 pnl 降序；可从 0G Storage/DA 复原输入。
