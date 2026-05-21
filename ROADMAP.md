# 路线图

仓库名称：`openclaw-generic-http`

## 当前状态

`0.1.x` 阶段的最小插件发布线已经成立：

- `webhook + stream` 运行时可用
- OpenClaw 宿主接入可用
- 最小 build/test/pack/e2e 已具备

下一阶段进入 `0.2.x`：

- 富消息映射
- 多账号与配置治理
- 宿主兼容增强
- 发布工程化

## Phase 4：`0.2.x` 富消息与配置治理

- 稳定文本、图片、文件、文本+附件的协议映射
- 明确一个账号配置对应一个平台实例
- 明确多账号配置模板与错误提示
- 增加更清晰的 channel status 诊断输出

## Phase 5：`0.2.x` 兼容性与运行时健壮性

- 增强 `probe`、`resolve`、`capabilities` 的错误分类
- 增强 stream reconnect、退避和多账号并行行为
- 增加 OpenClaw 与 Node.js 的正式兼容矩阵
- 增加更完整的 CI 与发布前检查

## Phase 6：`0.2.x` 协同发布治理

- 与平台仓库持续同步协议文档、共享向量与兼容声明
- 固化双仓 release checklist
- 固化外部用户安装、升级与排障入口
