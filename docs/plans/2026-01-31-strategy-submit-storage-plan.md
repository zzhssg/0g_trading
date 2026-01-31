# Strategy Submit + 0G Storage Upload Implementation Plan

**Goal:** 前端提交策略时校验策略 JSON 必填字段，上传 JSON 到 0G Storage，并把 `storageRoot` 写入 `StrategyNFT.registerStrategy`。
**Scope:** 新增策略 JSON 结构校验、0G Storage 上传（仅策略 JSON）、前端提交流程接入与状态提示、必要的前端环境变量。**不做**：回测日志 bundle 上传、Compute/DA 接入、复杂 schema 版本管理。
**Verification:**
- `cd "frontend" && npm test -- "src/lib/strategyPayload.test.ts"`
- `cd "frontend" && npm test -- "src/lib/ogStorage.test.ts"`
- `cd "frontend" && npm run lint`

### Task 1: 必填字段校验（RED → GREEN）

**Files:**
- Modify: `frontend/src/lib/strategyPayload.test.ts`
- Modify: `frontend/src/lib/strategyPayload.ts`

**Step 1: Write failing test (RED)**
- 在 `strategyPayload.test.ts` 增加用例：缺少 `strategy.name` / `instrument.symbol` / `logic.rules`（非数组）/ `verification.backtestLogHash` 时抛错。
- 错误信息要求可读（例如“缺少 strategy.name”）。

**Step 2: Run to confirm failure**
- Run: `cd "frontend" && npm test -- "src/lib/strategyPayload.test.ts"`
- Expect: FAIL（错误原因是缺少校验逻辑）

**Step 3: Minimal implementation (GREEN)**
- 在 `strategyPayload.ts` 增加 `validateStrategyJson(parsed)`：只做存在性与基础类型校验（KISS/YAGNI）。
- 在 `buildStrategyRegistrationPayload` 中解析 JSON 后调用校验。

**Step 4: Run to confirm pass**
- Run: `cd "frontend" && npm test -- "src/lib/strategyPayload.test.ts"`
- Expect: PASS

**Step 5: Refactor (optional)**
- 若重复检查较多，抽成小型 `requireString(path, value)` 帮助函数，保持 DRY。

### Task 2: 支持 storageRoot 覆盖（RED → GREEN）

**Files:**
- Modify: `frontend/src/lib/strategyPayload.test.ts`
- Modify: `frontend/src/lib/strategyPayload.ts`

**Step 1: Write failing test (RED)**
- 增加用例：当输入提供 `storageRootOverride` 时，payload 使用该值而非 `codeHash`。

**Step 2: Run to confirm failure**
- Run: `cd "frontend" && npm test -- "src/lib/strategyPayload.test.ts"`
- Expect: FAIL（未支持覆盖）

**Step 3: Minimal implementation (GREEN)**
- 给 `StrategyRegistrationInput` 增加可选字段 `storageRootOverride?: string`。
- `buildStrategyRegistrationPayload` 优先使用 `storageRootOverride?.trim()`，为空才回退到 `codeHash`。

**Step 4: Run to confirm pass**
- Run: `cd "frontend" && npm test -- "src/lib/strategyPayload.test.ts"`
- Expect: PASS

### Task 3: 0G Storage 上传工具（RED → GREEN）

**Files:**
- Create: `frontend/src/lib/ogStorage.ts`
- Create: `frontend/src/lib/ogStorage.test.ts`
- Modify: `frontend/package.json`

**Step 1: Write failing test (RED)**
- 在 `ogStorage.test.ts` 增加用例：
  - 缺少 `NEXT_PUBLIC_STORAGE_INDEXER` 或 `NEXT_PUBLIC_FLOW_CONTRACT` 时抛错。
  - 传入依赖注入的 fake uploader 时，返回预期 `rootHash`。

**Step 2: Run to confirm failure**
- Run: `cd "frontend" && npm test -- "src/lib/ogStorage.test.ts"`
- Expect: FAIL（无实现）

**Step 3: Minimal implementation (GREEN)**
- 增加 `resolveStorageConfig()`：读取 `NEXT_PUBLIC_STORAGE_INDEXER` / `NEXT_PUBLIC_FLOW_CONTRACT`，并提供默认值（来自 0G Galileo 测试网）。
- 增加 `uploadStrategyJson(content, signer, deps?)`：  
  - 校验配置  
  - 使用 `@0g-ai/0g-ts-sdk` 的 `Indexer`/`ZgFile`/`getFlowContract` 上传  
  - 返回 `rootHash`  
  - 允许通过 `deps` 注入 fake（用于测试，避免真实网络）
- 在 `frontend/package.json` 加入依赖 `@0g-ai/0g-ts-sdk`。

**Step 4: Run to confirm pass**
- Run: `cd "frontend" && npm test -- "src/lib/ogStorage.test.ts"`
- Expect: PASS

### Task 4: 前端接入上传与提交流程（GREEN）

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Step 1: Minimal implementation (GREEN)**
- 增加状态：`storageRootInput`、`storageUploadStatus`、`storageUploadError`。
- 添加“上传到 0G Storage”按钮与状态文案（参考 `pd2.html` 文案）。
- 调用 `uploadStrategyJson(strategyJson, signer)`，成功后写入 `storageRootInput`。
- `handleMint` 调用 `buildStrategyRegistrationPayload` 时传入 `storageRootOverride: storageRootInput`。

**Step 2: Run to confirm pass**
- Run: `cd "frontend" && npm run lint"`
- Expect: PASS（无 TS/ESLint 错误）

### Task 5: 文档/环境变量提示（可选）

**Files:**
- Modify: `frontend/README.md` 或 `docs/verify-mvp.md`

**Step 1: Minimal update**
- 说明新增环境变量：`NEXT_PUBLIC_STORAGE_INDEXER` / `NEXT_PUBLIC_FLOW_CONTRACT`，并给出默认值。

**Step 2: Run to confirm pass**
- Run: `cd "frontend" && npm run lint"`
- Expect: PASS
