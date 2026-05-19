# 插件本地联调配置

这里存放 `openclaw-generic-http` 的本地联调配置样例。

## 文件

- `openclaw-generic-http.local.json`
  对应最小 `webhook + stream` 联调配置

## 用途

适合本地开发时快速验证：

- 插件能否被 OpenClaw 正确加载
- `baseUrl`、`apiKey`、`signingSecret` 是否能打通
- 与本地或测试 bridge 的最小闭环是否成立

更适合用户直接阅读的入口见：

- [docs/03-local-dev.md](../docs/03-local-dev.md)
