# 路线图

仓库名称：`openclaw-generic-http`

## 当前阶段

当前目标不是继续扩功能面，而是把最小闭环收口成稳定的 `0.1.x` 插件发布线。

## Phase 1：发布线稳定化

- 稳定 `webhook + stream` ingress 运行时
- 稳定 host adapter 与 OpenClaw 注册入口
- 固化 `accountId + conversationId + threadId` 路由模型
- 收口 npm 发布元数据、README 和安装文档
- 明确当前限制与兼容性边界

## Phase 2：测试与兼容性增强

- 增强 `probe`、`resolve`、`capabilities` 的异常路径覆盖
- 补更多签名、防重放、幂等和重连测试
- 增加 OpenClaw 宿主兼容性说明与版本矩阵
- 增加 CI

## Phase 3：能力增强

- 评估更多附件与回复语义
- 评估更细的错误映射和诊断能力
- 继续完善联调与排障文档
- 评估多账号和更细粒度的 route policy
