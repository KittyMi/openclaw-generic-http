# OpenClaw `2026.6.x` 兼容验证记录

## 1. 目标

本文档用于固定插件侧扩大 OpenClaw 支持声明前，必须保留的宿主验证记录。

当前用途只有一个：

- 为联合 `0.2.0` 的 Sprint A 提供 `2026.6.x` 兼容结论依据

## 2. 当前状态（2026-06-11）

当前已把 OpenClaw `2026.6.x` 升级为正式声明支持线。

当前已知事实：

1. 插件代码侧没有对 OpenClaw `2026.6.x` 做硬编码分支。
2. 当前 `openclaw` 清单仍沿用标准 channel 注册与 setup/runtime entry 结构。
3. 当前本仓库已完成 `build + test`，并补了账号级运行时状态摘要。
4. 当前 README 与兼容矩阵已正式声明 OpenClaw `2026.5.x` 与 `2026.6.x`。
5. 本机 OpenClaw 为 `2026.6.5 (5181e4f)`，已完成以下宿主验证：
   - `openclaw plugins list --json`
   - `openclaw channels status --channel generic-http --json`
   - `openclaw gateway run --verbose`
   - 基于插件 signer + serializer 的真实 `POST /webhooks/inbound/messages`
6. 当前 CLI 返回 `generic-http` channel 已加载，账号状态为 `readyForStream=true`、`readyForOutbound=true`。
7. 当前本机 OpenClaw `2026.6.5` 已重新确认 `webhook -> stream -> outbound -> ack` 真实闭环恢复正常。

因此当前结论是：

- `2026.6.x`：`support`

当前最近一次本机宿主验证记录：

| 项目 | 记录 |
| --- | --- |
| OpenClaw version | `2026.6.5 (5181e4f)` |
| Plugin version | `0.1.8` |
| Install result | 本机已加载本地 `D:\openclaw-generic-http\dist\index.js` |
| Runtime inspect | `generic-http` channel 可发现，账号配置状态为 `OK` |
| Plugin doctor | gateway 与 channel status 可正常读取 |
| Channel discover | `generic-http` 显示为 `enabled` |
| Channel status | `readyForStream=true`、`readyForOutbound=true`，回发后 `lastOutboundAt` 正常刷新 |
| Minimal loop result | `2026.6.5` 本机已完成真实 `webhook -> stream -> outbound -> ack` 闭环 |

## 3. 升级为正式支持前的最小验证项

要把 README 和兼容矩阵中的支持范围从 `2026.5.x` 扩大到 `2026.6.x`，至少要记录：

1. 具体宿主版本：
   - 例如 `2026.6.0`
   - 如可获得，补 commit / build id
2. 安装验证：
   - `openclaw plugins install @kittymi/openclaw-generic-http`
   - `openclaw channels list --all`
3. 状态验证：
   - `openclaw channels status --channel generic-http`
   - 能读到 `accountStatuses` 与基础运行时摘要
4. 最小消息闭环：
   - `webhook -> stream -> ack -> outbound`
5. 失败结论：
   - 若失败，要说明是插件实现问题、宿主 API 兼容问题，还是验证环境问题

当前已解决的关键兼容点：

1. generic-http direct conversation 入站上下文现在会补齐标准 `InboundEventKind=user_request`
2. OpenClaw `2026.6.5` 下宿主已能重新触发正常 source reply 自动回发
3. generic-http 回发成功后账号状态中的 `lastOutboundAt` 与 `lastTransportActivityAt` 会同步刷新

## 4. 记录模板

完成验证时，至少补以下内容：

| 项目 | 记录 |
| --- | --- |
| OpenClaw version | 待填写 |
| Build / commit | 待填写 |
| Node.js version | 待填写 |
| Install result | 待填写 |
| Channel load result | 待填写 |
| Status output result | 待填写 |
| Minimal loop result | 待填写 |
| Known issues | 待填写 |
| Final conclusion | `support` / `do not declare yet` |

## 5. 文档同步要求

一旦这里出现正式结论，必须同步检查并更新：

1. `README.md`
2. `docs/05-compatibility-matrix.md`
3. `docs/06-release-checklist.md`
4. `docs/07-release-notes-policy.md`
5. `D:\openclaw-http-bridge\docs\15-version-matrix.md`
