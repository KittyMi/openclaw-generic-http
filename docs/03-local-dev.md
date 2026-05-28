# 本地联调

本文档说明如何在本地搭建插件开发与联调环境。

## 1. 前提

- Node.js >= 22.16.0
- 已安装 OpenClaw（用于加载插件）
- 本地或可访问的 bridge/relay 实例（可使用平台仓库的 [local-e2e.ps1](https://github.com/KittyMi/openclaw-http-bridge) 启动）

## 2. 源码构建

```bash
cd /path/to/openclaw-generic-http
npm install
npm run build
npm test
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run build` | TypeScript 编译到 `dist/` |
| `npm test` | 运行单元测试 (vitest) |
| `npm run pack:check` | 验证 npm 打包内容 |
| `npm run test:e2e` | 端到端回归（需本地 bridge） |

## 3. 插件 link 到 OpenClaw

将本地源码目录 link 到 OpenClaw，修改源码后重新 build 即可生效：

```bash
openclaw plugins link /path/to/openclaw-generic-http
```

如果之前已安装过 npm 版本，建议先解除再 link：

```bash
openclaw plugins uninstall @kittymi/openclaw-generic-http
openclaw plugins link /path/to/openclaw-generic-http
```

link 后每次修改源码，需要重新 build 才能被 OpenClaw 加载：

```bash
npm run build
```

## 4. 联调配置

样例配置位于 [dev-config/openclaw-generic-http.local.json](../dev-config/openclaw-generic-http.local.json)，说明见 [dev-config/README.md](../dev-config/README.md)。

最小配置模板：

```json
{
  "channels": {
    "generic-http": {
      "enabled": true,
      "defaultAccount": "local_001",
      "accounts": {
        "local_001": {
          "baseUrl": "http://127.0.0.1:18082",
          "apiKey": "test-api-key",
          "signingSecret": "test-signing-secret"
        }
      }
    }
  }
}
```

联调前确认 `baseUrl`、`apiKey`、`signingSecret` 与本地 bridge 一致。

## 5. 验证流程

### 5.1 确认插件加载

```bash
openclaw channels list --all
openclaw channels status --channel generic-http
```

### 5.2 验证 bridge 连通

```bash
# 健康检查
curl http://127.0.0.1:18082/health

# 探针诊断
curl -X POST http://127.0.0.1:18082/probe \
  -H "Content-Type: application/json" \
  -d '{"accountId":"local_001"}'
```

### 5.3 最小闭环验证

建议按顺序验证：

1. bridge `GET /health` — 确认 bridge 正常运行
2. bridge `POST /probe` — 确认实例可达
3. 插件 `POST /outbound/messages` — 确认出站链路
4. 第三方写 `POST /webhooks/inbound/messages` — 写入入站消息
5. 插件 `GET /stream/inbound` + `POST /stream/acks` — 消费与确认

### 5.4 一键回归

```bash
npm run test:e2e
```

脚本会启动最小本地 bridge 并验证 health、probe、resolve、stream 和 outbound 闭环。

## 6. 常见问题

**插件未显示：**

- 确认已 link 或 install
- 确认 `npm run build` 已执行
- 检查 `dist/` 和 `openclaw.plugin.json` 是否存在
- 尝试 `openclaw plugins list` 查看已安装插件

**状态异常：**

- 检查 `baseUrl` 是否可访问（bridge 是否已启动）
- 检查 `apiKey` / `signingSecret` 与 bridge 配置一致
- bridge 端 Swagger 可做快速验证：`http://127.0.0.1:18082/swagger-ui/index.html`

**stream 无数据：**

- 确认已有入站消息写入 `POST /webhooks/inbound/messages`
- 确认 `defaultAccount` 与入站消息的 `accountId` 一致
- 检查 bridge 日志中的 stream 连接状态

**本地 bridge 快速启动（需平台仓库）：**

```powershell
cd D:\openclaw-http-bridge
powershell -ExecutionPolicy Bypass -File .\scripts\local-e2e.ps1
```
