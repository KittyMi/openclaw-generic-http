# 路线图

仓库名称：`openclaw-generic-http`

## 当前状态

`0.1.x` 阶段的最小插件发布线已经成立：

- `webhook + stream` 运行时可用
- OpenClaw 宿主接入可用
- 最小 build/test/pack/e2e 已具备

下一阶段进入 `0.2.x`：

- 宿主兼容增强
- 运行时健壮性
- 发布工程化
- 协同发布治理

## Phase 4：`0.2.x` 兼容性与发布收口

- 增加 OpenClaw 与 Node.js 的正式兼容矩阵
- 明确 `2026.5.x` 与 `2026.6.x` 的兼容声明边界
- 固化 README、版本矩阵与 release checklist
- 与平台仓库同步兼容声明与共享样例

## Phase 5：`0.2.x` 运行时健壮性

- 增强 `probe`、`resolve`、`capabilities` 的错误分类
- 增强 stream reconnect、退避和多账号并行行为
- 增加更清晰的 channel status 诊断输出
- 固化 npm 发布前检查与回归入口

## Phase 6：`0.2.x` 协同发布治理

- 与平台仓库持续同步协议文档、共享向量与兼容声明
- 固化双仓 release checklist
- 固化外部用户安装、升级与排障入口
