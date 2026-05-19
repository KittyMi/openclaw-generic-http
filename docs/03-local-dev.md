# 本地联调

本地联调用到的样例配置位于：

- [dev-config/openclaw-generic-http.local.json](../dev-config/openclaw-generic-http.local.json)

对应说明见：

- [dev-config/README.md](../dev-config/README.md)

建议最小验证顺序：

1. 安装或 link 当前插件目录。
2. 写入 `channels.generic-http` 配置。
3. 确认 `baseUrl`、`apiKey`、`signingSecret` 与测试 bridge 一致。
4. 执行 `openclaw channels list --all`。
5. 执行 `openclaw channels status --channel generic-http`。
6. 验证 `health`、`probe`、`stream/inbound`、`stream/acks` 和 `outbound/messages`。

如果只想快速验证插件和一个最小 bridge 是否能真实互通，可以直接运行：

```bash
npm run test:e2e
```
