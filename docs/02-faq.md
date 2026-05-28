# 常见问题

## 1. 当前发布状态是什么？

`@kittymi/openclaw-generic-http` 已发布 `0.1.6` 正式版本，具备以下能力：

- `webhook + stream` ingress 运行时
- `health / probe / resolve / capabilities`
- 文本、图片、文件和混合附件的入站/出站
- 构建、测试和 npm 打包检查

当前还未完成的平台级能力见 [下一阶段规划](./04-next-phase-plan.md)。

## 2. 我应该先看哪里？

1. 看 [README.md](../README.md) 了解功能矩阵、兼容性和配置参考
2. 看 [安装与配置](./01-installation-guide.md) 完成安装和最小联通
3. 看 [兼容矩阵](./05-compatibility-matrix.md) 确认版本对齐

## 3. 为什么要做 `generic-http`，而不是每个平台单独做 channel？

很多第三方系统不是标准 IM 平台，而是业务服务、客服系统、工单系统或自定义消息中心。为每个系统单独写 channel 重复成本高；通过统一 HTTP 协议，可以把接入工作收敛到 bridge/relay 一侧。

## 4. 这个插件适合什么场景？

- OpenClaw 本地或内网运行
- 第三方系统通过 bridge/relay webhook 写入事件
- 插件通过 stream 主动拉取
- 目标是文本、图片、文件和基础会话闭环

不适合需要插件自己暴露公网入口、或需要完整多版本兼容矩阵的场景。

## 5. 当前支持哪些 OpenClaw 版本？

| 范围 | 状态 |
| --- | --- |
| `2026.5.x` | 声明支持线 |
| `2026.5.12 (f066dd2)` | 实机验证 |
| `2026.4.x` 及更早 | 不承诺兼容 |
| `2026.6.x` 及更高 | 后续单独评估 |

详见 [兼容矩阵](./05-compatibility-matrix.md)。

## 6. 为什么插件不直接暴露公网 webhook？

插件默认按"本地 OpenClaw 主动出站连接"设计：

- 第三方系统写 bridge/relay
- 本地插件主动 poll/stream

而不是让本地 OpenClaw 直接暴露公网地址。

## 7. 为什么协议选择 HTTP/JSON？

- 实现门槛低，调试成本低
- 各语言生态成熟
- 对接 Webhook/REST 风格系统最自然

在第一阶段，HTTP/JSON 比 MQ、WebSocket、gRPC 更适合落地。

## 8. 为什么插件只做 transport，不做业务编排？

插件的职责是：

- 把消息接进来
- 把消息发出去
- 把路由和安全处理正确

业务逻辑应放在第三方系统或 OpenClaw agent 层，否则插件会变成不可维护的耦合点。

## 9. 为什么要定义 `conversationId` / `threadId` 这些规则？

通用 channel 的核心难点不是 HTTP 调用本身，而是消息上下文映射。如果路由规则不先统一，后续回复、线程、幂等、审计都会混乱。

## 10. 当前最主要的限制是什么？

- 正式兼容声明仅覆盖 OpenClaw Desktop `2026.5.x`
- `openclaw channels add --channel ...` 的交互式枚举不一定包含第三方 channel
- 富媒体限于图片和文件附件，不含卡片、按钮等交互组件
- 多账号并行策略和重连退避仍待优化

## 11. 为什么推荐手工写 `channels.generic-http` 配置？

OpenClaw 的 `channels add --channel ...` 交互式选项主要来自内置静态 channel catalog。第三方插件即使已安装，也可能不会自动出现在枚举中。

推荐验证路径：

- `openclaw plugins install @kittymi/openclaw-generic-http`
- 在 `openclaw.json` 中写入 `channels.generic-http`
- `openclaw channels list --all`
- `openclaw channels status --channel generic-http`

## 12. 当前支持哪些消息类型？

文本、单图片、单文件、文本+图片、文本+文件、多附件混合 — 入站和出站均支持。消息类型矩阵见 [README.md](../README.md#消息类型)。

## 13. 这个插件和平台仓库是什么关系？

`openclaw-generic-http` 是 OpenClaw 侧的 channel 插件实现。

`clawbridge-platform` 是平台侧仓库，维护共享协议文档、安全/路由规范、测试向量和平台实现。

两个仓库按同一套协议文档和共享向量保持对齐。
