# 常见问题

## 1. 这个插件现在能直接发布吗？

可以作为 `0.1.x` 预览版公开发布。

当前已经具备：

- 独立 npm 包元数据
- manifest / schema / setup entry
- 构建、测试和打包检查
- 最小 `webhook + stream` 闭环能力
- 本地真实 bridge 回归脚本

但它还不是“所有场景都已收口”的生产级成品。当前仍缺：

- 更正式的 OpenClaw 兼容矩阵
- 更完整的 CI / 发布策略
- 更完整的真实 bridge 标准端到端样例集

## 2. 为什么要做 `openclaw-generic-http`，而不是每个平台单独做 channel？

因为很多第三方系统并不是标准 IM 平台，而是业务服务、客服系统、工单系统或自定义消息中心。  
为每个系统单独写 channel，重复成本高；通过统一 HTTP 协议，可以把重复工作收敛掉。

## 3. 这个插件现在最适合什么场景？

- OpenClaw 本地或内网运行
- 第三方系统通过公网 bridge / relay webhook 写入事件
- 插件通过 stream 主动拉取事件
- 先做文本消息和基础会话闭环

## 4. 当前支持哪些 OpenClaw 版本？

当前声明支持：

- OpenClaw Desktop `2026.5.x`

当前已验证：

- OpenClaw `2026.5.12 (f066dd2)`

这意味着当前 `0.1.2` 版本线只对 `2026.5.x` 给出兼容承诺；更低或更高版本暂不承诺兼容。

## 5. 为什么插件不直接暴露公网 webhook？

因为这个插件默认按“本地 OpenClaw 主动出站连接”设计。  
它更适合：

- 第三方系统写 bridge / relay
- 本地插件主动 poll / stream

而不是让本地 OpenClaw 直接暴露公网地址。

## 6. 为什么协议选择 HTTP/JSON？

- 实现门槛低
- 调试成本低
- 各语言生态都成熟
- 对接 Webhook / REST 风格系统最自然

在第一阶段，HTTP/JSON 比 MQ、WebSocket、gRPC 更适合落地。

## 7. 为什么插件只做 transport，不做业务编排？

因为插件的职责应该是：

- 把消息接进来
- 把消息发出去
- 把路由和安全处理正确

业务逻辑应放在第三方系统或 OpenClaw agent 层，否则插件会变成不可维护的耦合点。

## 8. 为什么要定义 `conversationId` / `threadId` / `messageId` 这些规则？

因为通用 channel 的核心难点不是 HTTP 调用本身，而是消息上下文映射。  
如果路由规则不先统一，后续回复、线程、幂等、审计都会混乱。

## 9. 当前最主要的限制是什么？

- `openclaw channels add --channel ...` 不一定能直接枚举到这个第三方插件
- 当前只正式声明支持 `2026.5.x`
- 更多是最小闭环能力，不是全量平台能力

## 10. 为什么还建议手工写 `channels.generic-http` 配置？

因为当前 OpenClaw 的 `channels add --channel ...` 交互式选项主要来自内置静态 channel catalog。第三方插件即使已经成功安装并加载，也可能不会自动出现在这个枚举中。

这不代表插件不可用。当前推荐的验证路径是：

- `openclaw plugins install @kittymi/openclaw-generic-http`
- 在 `openclaw.json` 中写入 `channels.generic-http`
- 使用 `openclaw channels list --all`
- 使用 `openclaw channels status --channel generic-http`

## 11. 第一阶段为什么只支持文本、单账号、基础会话？

因为最小闭环最重要。  
先跑通入站、出站、签名、路由、状态探测，才能在这个基础上继续扩附件、线程、多账号和富媒体。
