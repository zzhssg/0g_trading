# Verifiable AI Trading Arena MVP 设计稿

日期: 2026-01-31

## 背景与目标
本项目面向 0G 黑客松，目标是在 5 小时内交付可验证 AI 交易 MVP，并成功部署至 0G 测试网。核心价值是“可复现”而非“收益截图”，强调策略、数据、执行与结果的全流程可追溯。

## 产品终态（蓝图）
终态产品由四层组成：
1) 前端层: 策略注册、排行榜、策略详情与验证视图。
2) 合约层: 策略注册与轮次管理、结果提交与排名索引。
3) 存证层: 0G Storage/DA 保存策略文件、市场数据与执行日志；链上仅保存 hash 指针。
4) 执行层: 可信执行与回测（MVP 暂用链下模拟，保留字段位）。

## MVP 范围（收敛版）
仅保留 INFT 最小闭环能力:
- INFT 注册: 生成 dataHash 与 tokenURI，链上登记并可查询。
- 使用授权: owner 授权 executor 使用权（authorizeUsage）。
- 转移/克隆: 保留 ERC-7857 形态接口（Mock Oracle 通过）。

不做项:
- 0G Compute 真实集成（仅保留接口位）。
- 真实市场数据接入（使用固定样例数据）。
- 复杂策略与排序优化。

## 架构与模块
合约采用最小 ERC-7857 语义并继承 ERC-721，核心由 5 个组件组成:
1) INFT 主合约: 铸造/转移/克隆/授权，保存 tokenURI 与 dataHash。
2) IERC7857: 约束 transfer/transferFrom/clone/authorizeUsage 接口形态。
3) IERC7857Metadata: 暴露 intelligentDataOf（dataDescription + dataHash）。
4) MockOracle: 验证器桩，MVP 阶段总是通过。
5) IDataVerifier: 验证器抽象接口，后续可替换真实验证器。

前端仅做调用与展示，不接入真实 Compute/Storage，保留字段位即可。

## 数据流与错误处理（INFT MVP）
数据流闭环: 策略元数据 JSON -> dataHash -> tokenURI/存证指针 -> 链上 mint -> authorizeUsage -> transfer/clone（Mock Oracle）。链下复算 dataHash 与链上对齐，即完成最小可验证性证明。

错误处理最小覆盖三类:
- 数据完整性失败: dataHash/tokenURI 为空直接拒绝 mint。
- 转移/克隆失败: sealedKey/proof 为空直接 revert（保留接口位）。
- 授权失败: 非 owner 调用 authorizeUsage 直接 revert。

## 测试与验收（MVP）
目标是“接口形态对齐 ERC-7857、最小可验证性成立”。最小验收如下:
1) Mint 与元数据一致性: 链上读取 dataHash/tokenURI 与输入一致，空值直接 revert。
2) 授权与权限边界: 只有 owner 可 authorizeUsage，事件参数正确。
3) 转移/克隆形态: sealedKey/proof 参数必填，Mock Oracle 允许通过。

前端验收:
- 提交策略元数据完成 mint，页面展示 tokenId / dataHash / tokenURI。
- 执行一次 authorizeUsage，记录交易 hash。

## 5 小时实现路径
- 第 1 小时: 合约与部署脚本，链上可查
- 第 2 小时: 前端基础交互（钱包、注册、榜单）
- 第 3 小时: 模拟执行脚本与结果提交
- 第 4 小时: 接入 Storage 上传策略与日志
- 第 5 小时: Demo 流程与文档收口

## 交付物
- 合约地址与部署脚本
- 前端可访问页面
- 策略样例与日志样例
- 演示步骤文档

## 关键约束
- 测试网 RPC/ChainId 以官方文档为准，部署前核对配置
- 以可复现性为唯一价值主线，避免引入重度依赖
