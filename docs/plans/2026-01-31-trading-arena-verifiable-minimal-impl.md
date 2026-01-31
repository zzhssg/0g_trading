# Trading Arena Verifiable Round Implementation Plan

**Goal:** 在 0G Galileo 测试网实现“每轮锁定数据集 + 策略代码可验证 + 回测日志可复算”的最小闭环（KR1/KR2）。
**Scope:**
- In: TradingArena 轮次锁定与结果绑定、日志指针、按轮排名；数据集规范化脚本；验证文档更新。
- Out: 0G Compute/DA 扩展、奖励结算、复杂风控与多资产。
**Verification:**
- `npm test -- test/TradingArena.spec.ts`
- `python "/Users/rick/code/og_Trading/.worktrees/mvp-impl/scripts/data/feather_to_market_json.py" --help`
- `python -m pytest "/Users/rick/code/og_Trading/.worktrees/mvp-impl/scripts/data/test_market_normalize.py"`

---

### Task 1: 轮次锁定 marketDataRoot + datasetVersionHash + evalWindowHash（onlyOwner）

**Files:**
- Modify: `contracts/TradingArena.sol`
- Modify: `test/TradingArena.spec.ts`
- Modify: `scripts/smoke.ts`

**Step 1: Write failing test (RED)**
- 新增用例：只有 owner 可以 `startNewRound`，且 round 保存 `marketDataRoot/datasetVersionHash/evalWindowHash`。

**Step 2: Run to confirm failure**
- Run: `npm test -- test/TradingArena.spec.ts`
- Expect: FAIL（缺少字段/权限/签名不匹配）

**Step 3: Minimal implementation (GREEN)**
- `Round` 增加字段 `marketDataRoot/datasetVersionHash/evalWindowHash`
- `startNewRound(bytes32 marketDataRoot, bytes32 datasetVersionHash, bytes32 evalWindowHash)`
- `onlyOwner` 保护 + 非 0 root 校验
- `scripts/smoke.ts` 同步调用签名

**Step 4: Run to confirm pass**
- Run: `npm test -- test/TradingArena.spec.ts`
- Expect: PASS

---

### Task 2: 结果绑定与重复提交防护（backtestLogRoot + hashes）

**Files:**
- Modify: `contracts/TradingArena.sol`
- Modify: `test/TradingArena.spec.ts`

**Step 1: Write failing test (RED)**
- 新增用例：
  - 同一轮同一策略二次提交 revert
  - `TradingResult` 存在 `backtestLogRoot` 与 `codeHash/paramsHash`、轮次三元组

**Step 2: Run to confirm failure**
- Run: `npm test -- test/TradingArena.spec.ts`
- Expect: FAIL（缺字段/未限制重复提交）

**Step 3: Minimal implementation (GREEN)**
- `TradingResult` 增加 `backtestLogRoot`、`codeHash`、`paramsHash`、`datasetVersionHash`、`evalWindowHash`、`marketDataRoot`
- `resultSubmitted[roundId][strategyId]` 防重复
- `submitResult` 读取 StrategyNFT `codeHash/paramsHash`，写入结果

**Step 4: Run to confirm pass**
- Run: `npm test -- test/TradingArena.spec.ts`
- Expect: PASS

---

### Task 3: 按轮排行榜（pnl 降序）

**Files:**
- Modify: `contracts/TradingArena.sol`
- Modify: `test/TradingArena.spec.ts`

**Step 1: Write failing test (RED)**
- 新增用例：`getLeaderboardByRound(roundId, limit)` 对该轮参与者按 pnl 降序返回

**Step 2: Run to confirm failure**
- Run: `npm test -- test/TradingArena.spec.ts`
- Expect: FAIL（函数不存在或排序错误）

**Step 3: Minimal implementation (GREEN)**
- 新增 view 函数 `getLeaderboardByRound`
- 使用 `roundParticipants[roundId]` 做简单选择排序（MVP 规模）

**Step 4: Run to confirm pass**
- Run: `npm test -- test/TradingArena.spec.ts`
- Expect: PASS

---

### Task 4: Feather → 规范化 JSON 脚本（可复现输入）

**Files:**
- Create: `scripts/data/feather_to_market_json.py`
- Create: `scripts/data/test_market_normalize.py`

**Step 1: Write failing test (RED)**
- `test_market_normalize.py` 覆盖：字段顺序、UTC 时间、数值精度量化、输出 schemaVersion

**Step 2: Run to confirm failure**
- Run: `python -m pytest "scripts/data/test_market_normalize.py"`
- Expect: FAIL（函数不存在）

**Step 3: Minimal implementation (GREEN)**
- `feather_to_market_json.py` 提供：
  - `normalize_rows(rows, price_scale, volume_scale)`（纯函数，便于测试）
  - CLI：`--input` `--output` `--start` `--end` `--price-scale` `--volume-scale`
  - 输出 JSON：`{ schemaVersion, datasetVersion, evalWindow, scale, rows: [...] }`

**Step 4: Run to confirm pass**
- Run: `python -m pytest "scripts/data/test_market_normalize.py"`
- Expect: PASS

---

### Task 5: 更新验证文档

**Files:**
- Modify: `docs/verify-mvp.md`

**Step 1: Update docs**
- 明确：feather → 规范化 JSON → 0G Storage root
- 轮次锁定 `marketDataRoot/datasetVersionHash/evalWindowHash`
- 回测日志 `backtestLogRoot` 与 `executionLogHash` 复算比对

**Step 2: Verification spot-check**
- 手动执行文档命令一次，确保流程可跑

