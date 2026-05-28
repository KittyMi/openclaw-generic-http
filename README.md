# @kittymi/openclaw-generic-http

[![npm version](https://img.shields.io/npm/v/@kittymi/openclaw-generic-http)](https://www.npmjs.com/package/@kittymi/openclaw-generic-http)
[![license](https://img.shields.io/npm/l/@kittymi/openclaw-generic-http)](./LICENSE)
[![node](https://img.shields.io/node/v/@kittymi/openclaw-generic-http)](https://nodejs.org/)

> [English](./README-en.md)

OpenClaw 的 `generic-http` channel 插件。通过 HTTP bridge/relay 将第三方系统接入 OpenClaw，采用 webhook ingress + stream pull 拓扑。

## 功能特性

### Channel 能力

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| `health` | 已支持 | 桥接健康检查 |
| `probe` | 已支持 | 实例可达性与配置诊断 |
| `resolve` | 已支持 | 会话/用户/群组目录解析 |
| `capabilities` | 已支持 | 能力声明与协商 |
| 入站消息 (webhook + stream) | 已支持 | 第三方 webhook 写入 → 插件 stream 拉取 |
| 出站消息 | 已支持 | OpenClaw 回复 → 插件发往 bridge |
| 流式长轮询 | 已支持 | `waitSeconds` 长轮询 + `lastEventId` cursor ack |

### 消息类型

| 类型 | 入站 | 出站 |
| --- | --- | --- |
| 纯文本 | 支持 | 支持 |
| 单图片附件 | 支持 | 支持 |
| 单文件附件 | 支持 | 支持 |
| 文本 + 图片 | 支持 | 支持 |
| 文本 + 文件 | 支持 | 支持 |
| 多附件混合 | 支持 | 支持 |

### 安全

| 机制 | 状态 | 说明 |
| --- | --- | --- |
| HMAC-SHA256 签名 | 已支持 | 出站请求签名 + 入站 webhook 验签 |
| Nonce 防重放 | 已支持 | 基于内存/LRU 的 nonce 去重 |
| API Key 认证 | 已支持 | 共享凭据，可选独立 inbound/outbound secret |
| 幂等键 | 已支持 | `idempotencyKey` 防重复投递 |

### 运行时

| 特性 | 状态 | 说明 |
| --- | --- | --- |
| 多账号并行 | 已支持 | 多 `accountId` 独立 stream 连接 |
| 自动重连 | 已支持 | stream 断开后退避重试 |
| 结构化错误上报 | 已支持 | plugin pull/dispatch/ack 异常带 `errorCode` |
| 配置诊断 | 已支持 | `readyForStream` / `readyForOutbound` 状态暴露 |

## 架构定位

```
第三方系统                Bridge/Relay              本插件                  OpenClaw
─────────                ────────────              ──────                  ────────
webhook ──→ POST /webhooks/inbound/messages ──→ GET /stream/inbound ──→ channel event
                                              ←── POST /stream/acks  ←──
         ←── POST /outbound/messages         ←── outbound send       ←── agent reply
```

- 本插件**不暴露公网端口**，入站通过 stream pull 主动拉取
- 第三方系统**不直连 OpenClaw**，通过 bridge/relay 写入 webhook
- 签名、验签、路由映射均在插件侧完成，**不依赖 OpenClaw 内部实现**

## 兼容性

| 维度 | 基线 | 状态 |
| --- | --- | --- |
| 插件版本 | `0.1.6` | 当前发布 |
| OpenClaw | `2026.5.x` | 声明支持线 |
| OpenClaw | `2026.5.12 (f066dd2)` | 实机验证 |
| Node.js | `>=22.16.0` | 引擎要求 |
| Node.js | `22.x` / `24.x` | CI + 本地验证 |
| 协议 | `generic-http protocol v1` | 对齐基线 |
| 平台 | `clawbridge-platform 0.1.2` | 共享联调基线 |

不兼容范围：
- OpenClaw `2026.4.x` 及更早版本 — 未验证，不承诺兼容
- OpenClaw `2026.6.x` 及更高版本 — 未验证，后续单独评估

详见 [兼容矩阵文档](./docs/05-compatibility-matrix.md)。

## 快速开始

```bash
# 1. 安装
openclaw plugins install @kittymi/openclaw-generic-http

# 2. 在 openclaw.json 中添加配置（参见下方配置参考）

# 3. 验证
openclaw channels list --all
openclaw channels status --channel generic-http
```

### 最小验证路径

```bash
# 确认插件与 bridge 互通
1. bridge GET /health
2. bridge POST /probe
3. 插件 POST /outbound/messages
4. 第三方写入 POST /webhooks/inbound/messages
5. 插件 stream 消费并 ack
```

也可直接运行插件自带的 E2E 回归脚本：

```bash
npm run test:e2e
```

## 安装

**推荐：OpenClaw 插件机制**

```bash
openclaw plugins install @kittymi/openclaw-generic-http
```

**本地调试：**

```bash
openclaw plugins link /path/to/openclaw-generic-http
```

**全局安装（备用，非首选）：**

```bash
npm install -g @kittymi/openclaw-generic-http
```

详细说明见 [安装与配置文档](./docs/01-installation-guide.md)。

## 配置参考

### 最小配置

```json
{
  "channels": {
    "generic-http": {
      "enabled": true,
      "defaultAccount": "online_001",
      "accounts": {
        "online_001": {
          "baseUrl": "https://bridge.example.com",
          "apiKey": "replace-me",
          "signingSecret": "replace-me"
        }
      }
    }
  }
}
```

### 完整字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | 是 | `false` | 是否启用 channel |
| `defaultAccount` | string | 是 | — | 默认账号，必须存在于 `accounts` |
| `accounts` | object | 是 | — | 按 `accountId` 索引的账号配置 |

### 账号配置字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `baseUrl` | string (URI) | 是 | — | bridge/relay 根地址 |
| `apiKey` | string | 否 | — | 共享 API 认证凭据 |
| `signingSecret` | string | 否 | — | stream/probe/outbound 签名密钥 |
| `inboundSecret` | string | 否 | — | 专用入站 webhook 签名密钥 |
| `outboundSecret` | string | 否 | — | 专用出站签名密钥 |
| `connectTimeoutMillis` | number | 否 | `5000` | HTTP 连接超时（毫秒） |
| `readTimeoutMillis` | number | 否 | `10000` | HTTP 读取超时（毫秒） |
| `maxRetries` | number | 否 | `0` | 可重试出站失败的最大重试次数 |

### 配置约束

- `defaultAccount` 必须指向 `accounts` 里的真实键名
- 一个账号配置对应一个平台 `accountId`
- 不建议多个 OpenClaw 节点复用同一个账号配置
- 不要使用 `default` 等占位名作为正式账号键

## 对接的 Bridge API

插件对接遵循 `generic-http protocol v1` 的 bridge/relay，使用以下端点：

| 端点 | 方法 | 用途 | 调用方 |
| --- | --- | --- | --- |
| `/health` | GET | 健康检查 | 插件 |
| `/probe` | POST | 实例可达性与配置诊断 | 插件 |
| `/resolve` | POST | 会话/用户/群组目录查询 | 插件 |
| `/capabilities` | POST | 能力声明与协商 | 插件 |
| `/webhooks/inbound/messages` | POST | 入站消息写入 | 第三方系统 |
| `/stream/inbound` | GET | 入站事件流式拉取 (SSE) | 插件 |
| `/stream/acks` | POST | 入站事件确认 | 插件 |
| `/outbound/messages` | POST | 出站消息投递 | 插件 |

## 本地开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行单元测试
npm test

# 打包前检查
npm run pack:check

# 端到端回归（需本地 bridge）
npm run test:e2e
```

详细说明见 [本地联调文档](./docs/03-local-dev.md)。

## 已知限制

- 正式声明兼容仅覆盖 OpenClaw Desktop `2026.5.x`
- 实机验证仅针对 `2026.5.12 (f066dd2)` 完成
- `openclaw channels add --channel ...` 依赖静态 catalog，第三方 channel 不一定出现在交互式枚举中
- 尚未覆盖多 OpenClaw 版本的兼容矩阵
- 富媒体仅限于图片和文件附件，不含卡片、按钮等交互组件
- 多账号并行策略和重连退避仍待进一步优化（见 [下一阶段规划](./docs/04-next-phase-plan.md)）

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [安装与配置](./docs/01-installation-guide.md) | 安装方式、最小配置、首次联调 |
| [常见问题](./docs/02-faq.md) | FAQ 与故障排查 |
| [本地联调](./docs/03-local-dev.md) | 本地开发与联调环境搭建 |
| [下一阶段规划](./docs/04-next-phase-plan.md) | `0.2.x` 开发路线 |
| [兼容矩阵](./docs/05-compatibility-matrix.md) | 版本兼容声明与对齐基线 |
| [发布 Checklist](./docs/06-release-checklist.md) | 发布前检查项 |
| [版本发布说明策略](./docs/07-release-notes-policy.md) | CHANGELOG 与发布说明规范 |

上游协作仓库：
- [clawbridge-platform](https://github.com/KittyMi/openclaw-http-bridge) — 平台协议文档与共享测试向量

## 开源协作

- [MIT License](./LICENSE)
- [贡献说明](./CONTRIBUTING.md)
- [行为准则](./CODE_OF_CONDUCT.md)
- [安全上报](./SECURITY.md)

提交改动前请执行 `npm run build && npm test && npm run pack:check && npm run test:e2e`。
