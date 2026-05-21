# 更新日志

本文件记录 `openclaw-generic-http` 插件的重要变更。

## [Unreleased]

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
