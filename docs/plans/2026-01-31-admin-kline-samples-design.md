# 管理员上传 K 线样本（MVP 方案）设计稿

日期：2026-01-31

## 背景
核心用户故事要求：管理员上传 3 个 K 线样本 JSON 到 0G Storage，前端读取 3 个样本并用 lightweight-charts 展示。

## 目标
- 管理员在本地完成样本生成与上传，得到 3 个 root。
- 前端自动读取样本清单并从 0G Storage 下载样本，完成图表展示。
- 数据可追溯：root 可复用下载，样本包含版本、时间窗口、缩放信息。

## 非目标（MVP）
- 不做前端上传页面（管理员仅通过脚本/CLI）。
- 不接入 0G Compute/DA。
- 不在合约侧管理多样本集合（可选后续扩展）。

## 方案对比
- 方案 A：仅脚本上传，手动把 root 写进前端常量。快，但不可扩展、难维护。
- 方案 B（推荐）：脚本上传 + 生成样本清单 JSON，前端读取清单并下载样本。可追溯、可扩展。
- 方案 C：前端直接接入 0G Storage Web Starter Kit 上传。依赖重，超出 MVP。

## 推荐方案（B）架构与数据流
1) 管理员运行脚本把 .feather 转为规范 JSON。
2) 上传 3 个 JSON 到 0G Storage，得到 rootHash。
3) 生成 `market-samples.json` 清单（包含 root 与展示元信息）。
4) 前端启动时拉取清单，点击样本时通过 API route 下载 JSON。
5) 前端按 scale 还原数值，并渲染 K 线。

## 文件与脚本落点
- `scripts/data/feather_to_market_json.py`（已存在）：生成规范 JSON。
- `scripts/storage-upload-file.ts`（新增）：上传文件到 0G Storage，输出 rootHash。
- `scripts/market-samples-build.ts`（新增）：批量上传 3 个样本并生成清单。
- `frontend/public/market-samples.json`（生成产物）：前端静态读取清单。
- `frontend/src/app/api/storage/download/route.ts`（新增）：下载代理，输入 root 返回 JSON。

## 样本 JSON 结构（已由脚本生成）
- `schemaVersion`: 固定 `market-json-v1`
- `datasetVersion`: e.g. `v1`
- `evalWindow`: `start~end`（UTC ISO）
- `scale`: `{ price: number, volume: number }`
- `rows`: `[{ ts, open, high, low, close, volume }]`（整数缩放）

## 规范与数据校验
- 结构规范来源：`docs/market-data-schema.md`。
- 必须校验：`schemaVersion` 固定、`scale` 为正整数、`rows` 字段顺序固定。
- 时间规范：`ts` 必须为 UTC ISO 且以 `Z` 结尾。
- 解析失败或字段缺失：前端拒绝渲染并提示重试。

## 样本清单结构（market-samples.json）
示例字段：
- `id`, `symbol`, `title`, `range`, `interval`
- `rootHash`
- `datasetVersion`, `evalWindow`, `scale`

## 0G 配置（必须显式）
- `RPC_URL=https://evmrpc-testnet.0g.ai`
- `CHAIN_ID=16602`
- `INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai`
- `EVM Version=cancun`（Hardhat）

## 错误处理
- 上传脚本：缺失 env 或上传失败直接退出并显示错误。
- 下载 API：root 无效或下载失败返回 4xx/5xx。
- 前端：清单/样本解析失败时提示并允许重试。
- 数据校验：缺少必需字段即拒绝渲染。

## 验证步骤（最小）
1) 生成样本 JSON：
   - `python3 scripts/data/feather_to_market_json.py --input ... --output ...`
2) 上传并生成清单：
   - `node scripts/market-samples-build.ts`
3) 前端运行：
   - `npm --prefix frontend run dev`
4) 页面应显示 3 个样本卡片并可切换渲染 K 线。

## MVP 验收清单
- 3 个样本 JSON 成功上传到 0G Storage 并得到 root。
- 前端读取清单展示 3 个样本。
- 通过 root 可复用下载并渲染 K 线。

## 风险与扩展
- 风险：前端直连 Storage SDK 复杂，故使用 API route 代理。
- 扩展：后续可接入 Storage Web Starter Kit 做管理员前端上传。
