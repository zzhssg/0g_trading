# TradingArena 结果可复现性最小增强设计

日期: 2026-01-31

## 目标
在不引入 0G Compute 的前提下，增强链上结果的可复现性与验证强度，满足 MVP 的“可复算、可核对、可排名”。约束：最小改动、保持现有合约结构、避免新增依赖。

## 设计要点
1) **权限边界**：仅策略 NFT 持有人可提交回测结果。
2) **重复提交**：同一轮次同一策略只允许提交一次。
3) **可复现绑定**：结果记录绑定策略哈希（codeHash/paramsHash）、数据版本（datasetVersion）、评测窗口（evalWindow）与轮次市场数据哈希（marketDataHash）。
4) **验证升级**：验证时同时比对 executionLogHash 与上述绑定字段，保证第三方可以用相同数据切片复算并核对。
5) **排行榜排序**：基于当轮参与者列表，在 view 层按 pnl 排序输出（MVP 规模可接受）。

## 数据流
- 策略注册（StrategyNFT）保存 codeHash/paramsHash/datasetVersion/evalWindow。
- 回合开始（TradingArena）保存 marketDataHash。
- 结果提交时：
  - 校验 msg.sender 为策略持有人
  - 校验本轮未提交
  - 读取策略字段并写入结果结构
- 验证时：
  - 读取结果结构与 round.marketDataHash
  - 比对 hash 与字段一致性

## 错误处理与最小验收
- 无活跃回合/回合已结束 → revert
- 非持有人提交 → revert
- 重复提交 → revert
- 验证失败 → 返回 false

验收：同一策略在同一轮提交一次；第三方复算日志哈希后可通过 verifyResult；排行榜按 pnl 降序。
