# 下一阶段开发规划（`0.2.x`）

## 1. 文档目标

本文档用于把 `openclaw-generic-http` 从当前 `0.1.x` 的可联调插件，
推进到 `0.2.x` 的稳定扩展阶段。

这份规划直接面向开发执行。

## 2. 下一阶段范围

本阶段必须同时覆盖：

1. 宿主兼容增强
2. 运行时健壮性
3. 发布工程化
4. 与平台仓库的协同发布治理

## 3. 必须冻结的正式规则

### 3.1 账号绑定规则

插件侧按以下口径实现：

1. 一个插件账号配置对应一个平台 `accountId`
2. 不建议多个 OpenClaw 节点复用同一个账号配置
3. `defaultAccount` 必须指向一个真实存在的账号键
4. 文档、README、状态输出都要明确展示当前绑定账号

### 3.2 富消息最小支持矩阵

下一阶段最小必须支持：

1. 纯文本
2. 单图片
3. 单文件
4. 文本 + 图片
5. 文本 + 文件
6. 多附件混合

## 4. 任务分组

### C3. 宿主兼容增强

- C3.1. 扩 OpenClaw `2026.5.x` 实测覆盖
- C3.2. 明确 `2026.6.x` 是否兼容
- C3.3. 补 Node `22.x / 24.x` 兼容结果
- C3.4. 增加正式兼容矩阵文档

### C4. 运行时健壮性

- C4.1. 优化 stream reconnect 退避
- C4.2. 优化多账号并行拉流行为
- C4.3. 优化 probe / resolve / outbound 错误分类
- C4.4. 增加更明确的 channel status 诊断信息

### C5. 发布工程化

- C5.1. 固化 npm 发布前检查
- C5.2. 收口 release checklist
- C5.3. 收口版本发布说明
- C5.4. 与平台仓库同步版本矩阵与共享样例

## 5. 建议开发顺序

### Sprint A：先收口兼容与文档

- C3.1-C3.4
- C5.2-C5.4

目标：

- 插件兼容口径、版本矩阵与发布说明不再漂移

### Sprint B：补运行时健壮性

- C4.1-C4.4
- C5.1

目标：

- 插件从“可装可用”进入“可持续发布、可定位问题”

## 6. 验收标准

下一阶段结束前，至少应满足：

1. OpenClaw / Node.js 兼容范围有正式矩阵
2. `probe`、`resolve`、stream 失败时能给出更明确诊断
3. stream reconnect、退避与多账号并行策略有固定口径
4. npm 发布前检查和 release checklist 有正式说明

## 6.1 当前进展补充（2026-05-25）

当前插件仓库进展已明显超过本文初始版本：

1. `C1` 已完成并进入 `0.1.4` / `0.1.5` 基线：
   - 已支持图片、文件、文本 + 附件、多附件混合映射
   - inbound `attachments[]` 已注入 OpenClaw runtime 上下文
   - `scripts/e2e-bridge-regression.mjs` 已覆盖最小真实 bridge 回归
2. `C2` 已完成第一版正式收口：
   - `defaultAccount` 必须指向真实账号键
   - 文档和样例已统一到 `online_001` / `local_001` 这类账号命名
   - 状态输出已展示账号、`baseUrl`、`readyForStream`、`readyForOutbound`
3. `C5` 已部分完成：
   - 已有普通 CI workflow，执行 `build + test + pack:check + test:e2e`
   - 已有手动触发的 npm 发布 workflow
4. 当前真正未完成的主线已经转为：
   - `C3` 宿主兼容矩阵与正式兼容声明
   - `C4` stream / probe / resolve / outbound 的运行时健壮性
   - `C5` release checklist、版本发布说明和双仓协同口径

因此当前主线不再是“继续补附件映射或默认账号规则”，而是：

1. 补正式兼容矩阵文档
2. 收口发布说明与 release checklist
3. 视需要增强 stream reconnect、多账号并行和错误分类

## 7. 与平台仓库的协同要求

插件侧任何涉及以下事项的变更，都必须同步检查平台仓库：

- 协议字段
- 附件结构
- 账号命名
- 共享测试向量
- 兼容矩阵

平台仓库参考：

- `D:\openclaw-http-bridge\docs\16-next-phase-plan.md`
