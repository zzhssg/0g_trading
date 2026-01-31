# User Story 1 Implementation Plan

**Goal:** 管理员通过前端上传市场样本到 0G Storage，提交 TradingArena 新轮次 root；前端样本库通过 root 拉取并解析 K 线数据展示元信息与前 N 行。
**Scope:** 新增 Admin/Market Samples 视图、Storage 上传与 root 展示、startNewRound 调用、样本库解析展示；不做后端服务与批量管理。
**Verification:** `cd "frontend" && npm test -- --run src/lib/marketSample.test.ts src/lib/ogStorage.test.ts src/app/__tests__/market-admin.test.tsx`

---

### Task 1: 市场样本解析工具（market-json-v1）

**Files:**
- Create: `frontend/src/lib/marketSample.ts`
- Create: `frontend/src/lib/marketSample.test.ts`

**Step 1: Write failing test (RED)**
- 覆盖：缺少 `datasetVersion`/`evalWindow`/`rows` 抛错；合法样本返回 meta + rows；`datasetVersionHash`/`evalWindowHash` 计算正确；`previewRows` 限制前 N 行。

**Step 2: Run to confirm failure**
- Run: `cd "frontend" && npm test -- --run src/lib/marketSample.test.ts`
- Expect: FAIL（缺少实现）

**Step 3: Minimal implementation (GREEN)**
- 提供 `parseMarketSample(jsonText)`、`computeDatasetHashes(meta)`、`buildKlinePreview(rows, limit)`。

**Step 4: Run to confirm pass**
- Run: `cd "frontend" && npm test -- --run src/lib/marketSample.test.ts`
- Expect: PASS

**Step 5: Refactor (optional)**
- 保持逻辑简洁，复用小型校验函数。

---

### Task 2: 0G Storage 上传通用 JSON（前端）

**Files:**
- Modify: `frontend/src/lib/ogStorage.ts`
- Modify: `frontend/src/lib/ogStorage.test.ts`

**Step 1: Write failing test (RED)**
- 新增 `uploadJsonContent`（或 `uploadMarketJson`）的测试：缺少 signer 抛错；使用注入 `upload` 返回 rootHash。

**Step 2: Run to confirm failure**
- Run: `cd "frontend" && npm test -- --run src/lib/ogStorage.test.ts`
- Expect: FAIL

**Step 3: Minimal implementation (GREEN)**
- 在 `ogStorage.ts` 里实现新函数（复用 `resolveStorageConfig`），保留 `uploadStrategyJson` 兼容。

**Step 4: Run to confirm pass**
- Run: `cd "frontend" && npm test -- --run src/lib/ogStorage.test.ts`
- Expect: PASS

---

### Task 3: Admin 视图测试（权限与表单渲染）

**Files:**
- Create: `frontend/src/app/__tests__/market-admin.test.tsx`

**Step 1: Write failing test (RED)**
- mock `ethers.Contract`：`owner()` 返回 owner / non-owner；渲染后切换到 Admin 视图；断言 owner 可见“上传/提交”按钮，非 owner 不可见。

**Step 2: Run to confirm failure**
- Run: `cd "frontend" && npm test -- --run src/app/__tests__/market-admin.test.tsx`
- Expect: FAIL

**Step 3: Minimal implementation (GREEN)**
- 通过 UI 与权限状态实现可见性。

**Step 4: Run to confirm pass**
- Run: `cd "frontend" && npm test -- --run src/app/__tests__/market-admin.test.tsx`
- Expect: PASS

---

### Task 4: Admin / Market Samples 视图实现

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/lib/marketSample.ts`（如需小型调整）

**Step 1: Write failing test (RED)**
- 使用 Task 3 已写测试作为 RED 保障。

**Step 2: Run to confirm failure**
- Run: `cd "frontend" && npm test -- --run src/app/__tests__/market-admin.test.tsx`
- Expect: FAIL（权限与视图未实现）

**Step 3: Minimal implementation (GREEN)**
- 新增 `ViewId: "admin"`，侧边栏入口与标题。
- 使用 `TradingArena.owner()` 决定 owner 状态。
- 文件上传：读取 JSON，`parseMarketSample` 校验并显示元信息。
- Storage 上传：调用新 `uploadJsonContent` 返回 `marketDataRoot`。
- 提交新轮次：`startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash)`。
- 样本库：输入 root → 调用 `/api/storage-download?root=...` → 解析并展示元信息 + 前 N 行。
- 更新 ABI：增加 `owner()` / `startNewRound()` / `rounds()` 返回字段。

**Step 4: Run to confirm pass**
- Run: `cd "frontend" && npm test -- --run src/app/__tests__/market-admin.test.tsx`
- Expect: PASS

---

### Task 5: 回归与验证

**Files:**
- None (test-only)

**Step 1: Run targeted tests**
- Run: `cd "frontend" && npm test -- --run src/lib/marketSample.test.ts src/lib/ogStorage.test.ts src/app/__tests__/market-admin.test.tsx`
- Expect: PASS

**Step 2: Manual smoke (optional)**
- 前端连接 owner 钱包 → 上传 `data/MarketData-btc-1h.json` → 获得 root → startNewRound → 样本库加载 root 并展示 K 线。

