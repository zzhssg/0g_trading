# 市场数据 JSON 格式规范（字段表）

> 本文仅给出字段表与约束，供前后端与合约验证逻辑对齐。

## 顶层字段

| 字段 | 类型 | 必填 | 说明 | 约束/示例 |
| --- | --- | --- | --- | --- |
| schemaVersion | string | 是 | 格式版本 | 固定 `market-json-v1` |
| datasetVersion | string | 是 | 数据集版本标识 | 例如 `v1` |
| evalWindow | string | 是 | 评测时间窗 | `起始UTC~结束UTC`，ISO 8601（如 `2024-01-01T00:00:00Z~2024-01-07T00:00:00Z`） |
| scale | object | 是 | 数值缩放因子 | 见下表 |
| rows | array | 是 | K 线列表 | 见下表 |

### scale 字段

| 字段 | 类型 | 必填 | 说明 | 约束/示例 |
| --- | --- | --- | --- | --- |
| price | integer | 是 | 价格缩放倍数 | 例如 `100` 表示价格保留 2 位小数 |
| volume | integer | 是 | 成交量缩放倍数 | 例如 `100` 表示成交量保留 2 位小数 |

## rows 列表元素

> `rows` 中每条记录字段顺序由生成脚本固定为：`ts, open, high, low, close, volume`。

| 字段 | 类型 | 必填 | 说明 | 约束/示例 |
| --- | --- | --- | --- | --- |
| ts | string | 是 | K 线时间戳（UTC） | ISO 8601，必须以 `Z` 结尾 |
| open | integer | 是 | 开盘价 | 已乘以 `scale.price` |
| high | integer | 是 | 最高价 | 已乘以 `scale.price` |
| low | integer | 是 | 最低价 | 已乘以 `scale.price` |
| close | integer | 是 | 收盘价 | 已乘以 `scale.price` |
| volume | integer | 是 | 成交量 | 已乘以 `scale.volume` |
