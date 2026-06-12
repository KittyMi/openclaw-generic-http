# 路线图

仓库名称：`openclaw-generic-http`

## 当前状态

`0.1.x` 阶段的最小插件发布线已成立。`0.2.x` 主体能力已就绪，当前处于联合 `0.2.0` 版本收口阶段。

联合 `0.2.0` 的版本主题：**多实例治理 + 线上诊断闭环 + 协同发布口径**。

## Phase 1-3：0.1.x 最小发布线 ✅

- ✅ 插件基础仓库结构与 npm 发布管线
- ✅ webhook + stream 运行时
- ✅ OpenClaw 宿主接入可用
- ✅ 签名、验签、路由映射
- ✅ 最小 build/test/pack/e2e 已具备
- ✅ 富消息附件映射（文本、图片、文件、混合附件）

## Phase 4：0.2.x 兼容性与发布收口 ✅

- ✅ OpenClaw 与 Node.js 正式兼容矩阵（`docs/05-compatibility-matrix.md`）
- ✅ `2026.5.x` 兼容声明边界明确
- ✅ `0.1.7` 修复 `2026.5.28` modern runtime 入站回复派发兼容
- ✅ `0.1.8` 补齐 `2026.6.5` direct conversation 入站上下文兼容并恢复真实回发闭环
- ✅ 账号级运行时状态摘要（`accountStatuses`、`readyForProbe/Stream/Outbound`）
- ✅ 流运行时诊断（`streamState`、`activeRequestInFlight`、最近错误摘要）
- ✅ README、版本矩阵与 release checklist 固化
- ✅ 与平台仓库兼容声明 + 共享样例对齐

## Phase 5：0.2.x 运行时健壮性 ✅

- ✅ `probe`、`resolve`、`capabilities` 错误分类
- ✅ 结构化错误上报（`errorCode`、`retryable`）
- ✅ channel status 诊断输出增强
- ✅ npm 发布前检查与 CI 回归入口
- ✅ 多账号并行 stream 拉流

## Phase 6：0.2.x 协同发布治理 🔄

- ✅ 与平台仓库协议文档、共享向量、兼容声明持续同步
- ✅ 双仓 release checklist 固化
- 🔄 联合 `0.2.0` 版本说明与对外文档收口（Sprint A 进行中）
- ✅ OpenClaw `2026.6.x` 兼容验证
- 🔄 外部用户安装、升级与排障入口

## 下一阶段展望

联合 `0.2.0` 发布后，后续方向可能包括：

- `2026.7.x` 正式兼容声明
- stream reconnect 退避策略优化
- 多账号并行隔离加固
- OpenClaw 更多版本的兼容矩阵扩展
- 协议 v2 预研（取决于平台侧和社区反馈）

当前不应提前展开上述工作，优先完成联合 `0.2.0` 的收口与发布。
