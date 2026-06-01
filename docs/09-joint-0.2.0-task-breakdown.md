# 联合 `0.2.0` 任务拆解

## 1. 文档目标

本文档用于把 `openclaw-generic-http` 与平台仓库
`clawbridge-platform` 的下一阶段开发，收敛为一个可执行的联合
`0.2.0` 功能版本。

当前目标不是继续补附件映射或默认账号这类已完成事项，而是把插件端与
平台端已经具备的能力收成：

1. 清晰的版本主题
2. 稳定的兼容与发布口径
3. 可重复执行的联合验收与上线路径

平台仓库对应草案：

- `D:\openclaw-http-bridge\docs\22-joint-0.2.0-task-breakdown.md`

首个 Sprint 的执行清单见：

- [10-joint-0.2.0-sprint-a-checklist.md](./10-joint-0.2.0-sprint-a-checklist.md)

## 2. 版本主题

联合 `0.2.0` 的主题固定为：

`多实例治理 + 线上诊断闭环 + 协同发布口径`

插件侧本版本的价值不再是“能支持附件”和“能长轮询”，而是：

1. 把兼容范围说清楚
2. 把运行状态说清楚
3. 把发布说明说清楚

## 3. 版本目标

本版本结束前，插件端至少应满足：

1. OpenClaw / Node.js 兼容范围有正式矩阵
2. 每个账号的 stream / outbound / probe 状态可直接读懂
3. `pull / dispatch / ack / resolve / probe / outbound` 错误分类有固定口径
4. 发布前检查、release notes、兼容声明与平台仓库同步冻结
5. 双仓能按同一套流程完成联合验收与发布

## 4. 双仓职责拆分

### 4.1 插件仓库负责

1. 宿主兼容增强与正式兼容声明
2. 运行时状态与错误分类收口
3. 多账号并行、reconnect、backoff 口径收口
4. 插件发布工程化与双仓说明同步

### 4.2 平台仓库负责

1. 工作台诊断视图收口
2. 多实例治理与 delivery log 回放闭环
3. 平台侧线上排障与发布说明

### 4.3 双仓共同负责

1. 协议与共享样例不漂移
2. 兼容矩阵与版本说明不漂移
3. 联合回归与上线检查可重复执行

## 5. 插件端任务组

### C1. 宿主兼容与声明升级

- C1.1. 补 OpenClaw `2026.5.x` 已验证范围的证据整理
- C1.2. 实测 OpenClaw `2026.6.x`，决定是否升级正式支持声明
- C1.3. 收口 Node.js `22.x / 24.x` 的验证记录
- C1.4. 同步更新 `README.md`、`docs/05-compatibility-matrix.md` 和版本说明

### C2. 运行时状态增强

- C2.1. 收口 channel status 中每个账号的 `readyForStream / readyForOutbound / readyForProbe`
- C2.2. 明确显示账号绑定信息、`defaultAccount`、`baseUrl` 和当前运行状态
- C2.3. 补最近错误、重试状态、backoff 状态等可读摘要
- C2.4. 固化状态输出示例到 README 或 testing 文档

### C3. 健壮性与错误分类收口

- C3.1. 收口 stream reconnect 与 backoff 规则
- C3.2. 收口多账号并行拉流的状态与失败隔离规则
- C3.3. 统一 `pull / dispatch / ack / resolve / probe / outbound` 的错误分类
- C3.4. 统一错误文案、重试性字段、日志上下文和 README 示例

### C4. 发布工程化与双仓协同

- C4.1. 收口 `docs/06-release-checklist.md`
- C4.2. 收口 `docs/07-release-notes-policy.md`
- C4.3. 与平台仓库同步版本矩阵和对外兼容口径
- C4.4. 明确双仓发布顺序、回归路径和记录项

## 6. 平台端协同任务组

插件侧需要跟踪平台侧以下事项是否完成：

- P1. 工作台诊断面板、筛选、链路展示收口
- P2. 多实例治理增强与按实例排障能力
- P3. 平台版本说明、线上排障 runbook、联合验收清单

平台侧详细拆解以平台仓库文档为准：

- `D:\openclaw-http-bridge\docs\22-joint-0.2.0-task-breakdown.md`

## 7. 联合任务组

### X1. 共享矩阵与共享样例

- X1.1. 同步平台 `docs/15-version-matrix.md` 与插件 `docs/05-compatibility-matrix.md`
- X1.2. 如兼容声明升级，双仓 README 与 CHANGELOG 同步更新
- X1.3. 如果协议字段不变，则共享向量只补运行时与诊断样例，不扩破坏性字段

### X2. 联合验收

- X2.1. 插件端执行 `build + test + pack:check + test:e2e`
- X2.2. 平台端执行后端测试、前端构建和必要的本地 E2E
- X2.3. 线上至少验证一次真实 `webhook -> stream -> ack -> outbound` 最小闭环
- X2.4. 如本次涉及失败诊断，至少验证一次失败定位与回放

### X3. 联合发布

- X3.1. 先冻结双仓版本说明与兼容矩阵
- X3.2. 先发布平台端，再发布插件端
- X3.3. 发布后再次核对矩阵、README、安装说明和对外可用性

## 8. 建议执行顺序

### Sprint A：先冻结兼容与对外说明

- C1.1-C1.4
- C4.1-C4.3
- X1.1-X1.2

目标：

- 先把兼容口径、版本矩阵、release notes 说明固定

### Sprint B：补状态输出与健壮性

- C2.1-C2.4
- C3.1-C3.4

目标：

- 让插件状态从“能看日志”升级为“能看状态”

### Sprint C：联合验收与发布

- C4.4
- X2.1-X2.4
- X3.1-X3.3

目标：

- 形成一次完整、可追溯的双仓版本交付

## 9. 验收标准

联合 `0.2.0` 结束前，插件侧至少应满足：

1. OpenClaw / Node.js 兼容声明明确到具体版本范围
2. channel status 可区分账号、状态、最近错误与重试阶段
3. stream reconnect、多账号并行和错误分类规则固定
4. 双仓版本矩阵与发布说明一致
5. 插件发布检查项与平台联合回归路径一致

## 10. 非目标

联合 `0.2.0` 当前不主动覆盖：

1. 协议 `v2`
2. 超出当前实测范围的大版本兼容承诺
3. 重新设计插件配置模型
4. 把业务编排逻辑下沉回插件

## 11. 后续落地建议

当前建议按以下顺序继续推进：

1. 先完成 `2026.6.x` 兼容验证
2. 再收口 channel status 与错误分类
3. 同步平台工作台诊断细节收口
4. 最后统一改双仓矩阵、README、CHANGELOG 和发布说明
