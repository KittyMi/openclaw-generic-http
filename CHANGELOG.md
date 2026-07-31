# 更新日志

本文件记录 `openclaw-generic-http` 插件的重要变更。

## [Unreleased]

## [0.1.9] - 2026-07-30

### 通信优化

- 入站消息派发从串行改为 `Promise.allSettled` 并行，吞吐提升 3-5x
- 出站 `maxRetries` 默认值从 0 调整为 2，增强抗网络抖动能力
- 流入站熔断器阈值从 5 调整为 3，更快触发熔断保护

## [0.1.8] - 2026-06-11

### OpenClaw `2026.6.5` 闭环兼容修复

- 修复 generic-http 入站消息在 OpenClaw `2026.6.5` 下缺少标准 `InboundEventKind` 上下文，导致模型已生成回复但宿主不触发正常 source reply 回发的问题
- 保持 modern runtime `runtime.inbound.dispatchReply(...)` 主线不变，补齐 direct conversation 的标准 inbound context 组装
- generic-http 出站回发成功后现在会刷新账号状态中的 `lastOutboundAt` 与 `lastTransportActivityAt`
- 补充 OpenClaw `2026.6.5 (5181e4f)` 的本机真实 `webhook -> stream -> outbound -> ack` 闭环验证记录
- 发布线升级到 `0.1.8`

## [0.1.7] - 2026-06-04

### OpenClaw `2026.5.28` 入站回复兼容修复

- 将 modern runtime 入站回复派发切到当前 OpenClaw 官方 `runtime.inbound.dispatchReply(...)` 路径
- 修复本机 OpenClaw `2026.5.28` 下 stream ingress 能拉到消息但无法稳定触发 reply delivery 的问题
- 保留 legacy runtime 分支兼容，避免旧宿主回退
- 清理 `openclaw-entry.ts` 中已无用的 gateway dist helper
- 发布线升级到 `0.1.7`

## [0.1.6] - 2026-05-25

### 运行时与发布收口

- 收入口轮询与游标 ack 语义，减少固定短轮询开销
- 补齐插件侧 runtime error 结构化上报口径
- 对齐平台侧 `waitSeconds / lastEventId` 主线能力
- 发布线升级到 `0.1.6`

## [0.1.5] - 2026-05-21

### 入站附件理解闭环

- 插件现在会把 inbound `attachments[]` 一并注入 OpenClaw runtime 上下文
- 纯附件消息不再让宿主看到空 `Body`，而是生成可读的附件摘要文本
- 文本 + 附件消息会把附件摘要拼进 `BodyForAgent`
- runtime 上下文新增 `OriginalBody`、`MessageAttachments` 和 `AttachmentCount`
- stream 回归测试已覆盖“纯 xlsx 附件无文本”进入 agent 上下文的场景

## [0.1.4] - 2026-05-21

### 配置治理与默认账号口径

- 插件运行时不再自动虚构缺失的 `default` 账号
- `defaultAccount` 现在必须指向 `accounts` 下真实存在的账号键
- OpenClaw 宿主出站在未显式指定账号时，会回落到配置里的真实默认账号，而不是硬编码 `default`
- 配置示例与本地联调样例统一改成 `online_001` / `local_001` 这类正式账号命名

### 富消息出站映射

- OpenClaw 回复链路现在支持单条消息同时携带文本和多个附件
- 宿主 `attachments[]` 与旧的 `mediaUrl/mediaUrls` 都会被统一映射到协议附件数组
- 最小 bridge e2e 回归已覆盖文本 + 文件 + 图片附件的出站请求

### 状态与诊断

- 账号状态快照新增结构化配置诊断，区分 `baseUrl`、`apiKey`、`signingSecret` 等是否已配置
- 账号状态快照现在会标出 `readyForStream`、`readyForOutbound` 和 `DEGRADED` 原因

## [0.1.3] - 2026-05-19

### 仓库独立化与发布收口

- 将插件代码、manifest、schema、联调配置和插件文档迁入独立仓库
- 修正 npm 包 `repository`、`homepage` 和 `bugs` 元数据
- 修正 `npm pack --dry-run` 在当前 Windows 环境下的执行方式
- 收口仓库文档，仅保留插件发布、安装和协作相关内容
- 增加普通 CI workflow，执行 `build + test + pack:check + test:e2e`
- 增加最小真实 bridge 回归脚本 `scripts/e2e-bridge-regression.mjs`
- 补充 OpenClaw 支持范围说明：当前声明支持 `2026.5.x`，已验证 `2026.5.12`

## [0.1.2] - 2026-05-18

### 插件协议与运行时

- 将 ingress 模式收口为单一的 `webhook + stream` 拓扑
- 保留并完善 stream 所需的 payload 校验、事件标准化和会话映射逻辑
- 使用 `accountId + conversationId + threadId` 作为稳定路由键

### 插件宿主接入与 OpenClaw 兼容

- 增加宿主侧 lifecycle 与 host adapter
- 将 `registerPlugin()` 收敛为结构化 registration object
- 补齐 `setup-entry`、manifest 与 runtime 三层元数据
- 导出 `register`、`activate` 和默认插件入口对象
- 将静态 schema 统一到 OpenClaw 当前可识别的 draft-07

### 构建、测试与发布收口

- 增加 `.npmignore`，收紧 npm 包内容
- 增加 `npm pack --dry-run` 发布检查
- 校正独立仓库发布所需的仓库元数据
- 当前验证通过：
  - `npm run build`
  - `npm test`
  - `npm run pack:check`

## [0.1.1] - 2026-05-18

- 完成 `@kittymi/openclaw-generic-http` 的首次公开包发布准备
- 建立插件基础仓库结构
- 打通签名、基础出站、最小 runtime 和文档骨架

## [0.1.0] - 开发中

### 已完成

- 增加 `openclaw-generic-http` 插件骨架
