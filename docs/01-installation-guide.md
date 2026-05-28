# 安装与配置

本文档提供插件安装、配置和首次联调的详细步骤。功能和兼容性总览见 [README.md](../README.md)。

## 1. 安装前提

- 已安装 OpenClaw
- OpenClaw 能加载第三方插件
- 运行环境可访问目标 bridge/relay
- Node.js >= 22.16.0

## 2. 安装方式

### 推荐：从 npm 安装

```bash
openclaw plugins install @kittymi/openclaw-generic-http
```

### 本地目录安装

```bash
openclaw plugins install /path/to/openclaw-generic-http
```

### 本地 link（开发调试）

```bash
openclaw plugins link /path/to/openclaw-generic-http
```

开发环境搭建详见 [本地联调文档](./03-local-dev.md)。

## 3. 最小配置

```json
{
  "channels": {
    "generic-http": {
      "enabled": true,
      "defaultAccount": "online_001",
      "accounts": {
        "online_001": {
          "baseUrl": "https://bridge.example.com",
          "apiKey": "test-api-key",
          "signingSecret": "test-signing-secret"
        }
      }
    }
  }
}
```

**配置约束：**

- `defaultAccount` 必须指向 `accounts` 里真实存在的账号键
- 一个账号配置对应一个平台 `accountId`
- 不建议多个 OpenClaw 节点复用同一个账号配置
- 不要使用 `default` 等占位名作为正式账号键

配置字段的完整说明见 [README.md](../README.md#配置参考)。

## 4. 启用流程

1. 安装插件
2. 在 `openclaw.json` 中写入 `channels.generic-http` 配置
3. 重启或 reload OpenClaw
4. 执行 `openclaw channels list --all` 确认插件已加载
5. 执行 `openclaw channels status --channel generic-http` 查看状态

**注意：** `openclaw channels add --channel ...` 依赖内置静态 catalog，第三方 channel 插件不一定会出现在交互式枚举里。当前推荐手工写配置。

## 5. 首次联调顺序

按以下顺序逐步验证链路：

```
1. GET  /health                 → 确认 bridge 正常运行
2. POST /probe                  → 确认实例可达
3. POST /outbound/messages      → 确认出站链路
4. POST /webhooks/inbound/messages → 第三方写入入站消息
5. GET  /stream/inbound         → 插件拉取
6. POST /stream/acks            → 插件确认
```

也可用插件自带的 E2E 回归脚本一键验证：

```bash
npm run test:e2e
```

## 6. 故障排查

**插件未显示：**
- 检查插件是否已安装：`openclaw plugins list`
- 检查 `openclaw.plugin.json` 和 `dist/` 是否存在
- 检查 OpenClaw 是否已 reload

**状态异常：**
- 检查 `baseUrl` 是否可访问
- 检查 `apiKey` / `signingSecret` 与 bridge 一致
- 检查 bridge 是否已实现 `/probe`

**消息无法送达：**
- 检查 `conversationId` 和 `threadId` 是否正确
- 检查 `stream/inbound` 与 `stream/acks` 是否正常
- 检查 `outbound/messages` 返回是否为 `DELIVERED`
