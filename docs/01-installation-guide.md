# 安装与配置

本文档只说明插件安装、配置和最小验证流程。

## 1. 安装前提

- 已安装 OpenClaw
- OpenClaw 能加载第三方插件
- 运行环境可访问目标 bridge / relay
- Node.js 版本满足 `>=22.16.0`

当前支持范围：

- OpenClaw Desktop `2026.5.x`

当前已验证版本：

- OpenClaw `2026.5.12 (f066dd2)`

对更早或更高的 OpenClaw 版本，当前不承诺兼容。

## 2. 安装方式

从 npm 安装：

```bash
openclaw plugins install @kittymi/openclaw-generic-http
```

本地目录安装：

```bash
openclaw plugins install /path/to/openclaw-generic-http
```

本地联调也可以用：

```bash
openclaw plugins link /path/to/openclaw-generic-http
```

## 3. 最小配置

```json
{
  "channels": {
    "generic-http": {
      "enabled": true,
      "defaultAccount": "default",
      "accounts": {
        "default": {
          "baseUrl": "https://bridge.example.com",
          "apiKey": "test-api-key",
          "signingSecret": "test-signing-secret"
        }
      }
    }
  }
}
```

字段说明：

- `baseUrl`: bridge / relay 根地址
- `apiKey`: 可选共享认证凭据
- `signingSecret`: stream、probe、resolve、outbound 请求签名密钥
- `inboundSecret`: 可选专用入站密钥
- `outboundSecret`: 可选专用出站密钥
- `connectTimeoutMillis`: 连接超时
- `readTimeoutMillis`: 读取超时
- `maxRetries`: 可重试出站请求的最大重试次数

## 4. 推荐启用流程

1. 安装插件。
2. 手工写入 `channels.generic-http` 配置。
3. 重启或 reload OpenClaw。
4. 执行 `openclaw channels list --all`。
5. 执行 `openclaw channels status --channel generic-http`。
6. 验证 `GET /health` 和 `POST /probe`。

当前要注意的宿主限制：

- `openclaw channels add --channel ...` 仍主要依赖内置静态 catalog
- 第三方 channel 插件不一定会自动出现在交互式枚举里

因此对 `openclaw-generic-http`，当前更可靠的方式仍然是手工写配置。

## 5. 首次联调顺序

建议按这个顺序联调：

1. 先打通 `GET /health`
2. 再打通 `POST /probe`
3. 再打通 `POST /outbound/messages`
4. 最后让第三方系统把入站事件写到 `POST /webhooks/inbound/messages`
5. 由插件通过 `GET /stream/inbound` 和 `POST /stream/acks` 消费与确认

如果你在本地维护插件源码，也可以执行：

```bash
npm run test:e2e
```

这个脚本会启动一个最小本地 bridge，并用真实 HTTP 请求验证 `health`、`probe`、`resolve`、`stream/inbound`、`stream/acks` 和 `outbound/messages`。

## 6. 故障排查

插件未显示：

- 检查插件是否已安装
- 检查 `openclaw.plugin.json` 和 `dist/` 是否存在
- 检查 OpenClaw 是否已 reload

状态异常：

- 检查 `baseUrl` 是否可访问
- 检查 `apiKey` / `signingSecret` 是否与 bridge 一致
- 检查 `/probe` 是否已实现

消息无法送达：

- 检查 `conversationId` 和 `threadId`
- 检查 `stream/inbound` 与 `stream/acks`
- 检查 `outbound/messages` 返回是否是 `DELIVERED`
