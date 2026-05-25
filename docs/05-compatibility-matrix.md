# 兼容矩阵

## 1. 目标

本文档定义 `openclaw-generic-http` 当前对外声明的兼容范围，以及它与
`clawbridge-platform`、共享协议文档、共享测试向量之间的对齐基线。

当前原则：

- 先冻结已验证的兼容口径
- 再扩展新的 OpenClaw / Node.js / 平台版本支持范围
- 避免 README、发布说明和平台仓库矩阵出现漂移

## 2. 当前正式兼容基线（2026-05-25）

| 项目 | 当前基线 | 说明 |
| --- | --- | --- |
| 插件版本 | `openclaw-generic-http 0.1.5` | 当前 `package.json` 发布号 |
| OpenClaw 声明支持范围 | `2026.5.x` | 当前 README 正式声明 |
| OpenClaw 已验证版本 | `2026.5.12 (f066dd2)` | 当前本机验证记录 |
| Node.js 引擎要求 | `>=22.16.0` | 当前 `package.json` `engines.node` |
| Node.js 已验证版本 | `22.x`、`24.x` | 当前 CI 与本地开发记录 |
| 平台对齐版本 | `clawbridge-platform 0.1.2` | 当前共享联调基线 |
| 协议版本 | `generic-http protocol v1` | 以平台仓库协议文档为准 |
| 安全规范 | `security spec v1` | 以平台仓库安全文档为准 |
| 路由规范 | `session routing spec v1` | 以平台仓库路由文档为准 |
| 共享签名向量 | `signature-v1.json` | 平台与插件都必须保持一致 |
| 共享协议向量 | `protocol-v1-platform.json` | 覆盖 probe / resolve / stream / outbound |

## 3. 当前兼容矩阵

| 维度 | 版本 / 范围 | 状态 | 说明 |
| --- | --- | --- | --- |
| OpenClaw Desktop | `2026.5.12` | Verified locally | 当前唯一明确实机验证版本 |
| OpenClaw Desktop | `2026.5.x` | Supported release line | 当前正式声明支持线 |
| OpenClaw Desktop | `2026.4.x` 及更早 | Not supported | 当前未验证，也未承诺兼容 |
| OpenClaw Desktop | `2026.6.x` 及更高 | Not yet declared | 后续需单独验证后再声明 |
| Node.js | `22.x` | Verified in local/dev and CI | 当前推荐主线 |
| Node.js | `24.x` | Verified in local/dev and CI | 当前已纳入 CI |
| `clawbridge-platform` | `0.1.2` | Aligned baseline | 当前共享文档与向量对齐版本 |

## 4. 对齐要求

要与当前平台基线稳定联通，插件侧至少应满足：

1. 使用 `webhook + stream` 正式拓扑：
   - `GET /stream/inbound`
   - `POST /stream/acks`
   - `POST /outbound/messages`
2. 签名行为必须与 `D:\openclaw-http-bridge\docs\06-security-spec.md` 一致。
3. 路由模型必须保持 `accountId + conversationId + threadId`。
4. `resolve` 必须接受“无命中返回空结果”的正式行为。
5. `probe` 必须接受 `DEGRADED` 结果，而不是假定永远 `OK`。
6. 未 ack 的 inbound event 在重复拉流时可能再次投递，插件必须按幂等方式处理。

## 5. 本次基线的验证依据

当前基线以以下事实为准：

1. `npm run build` 可通过。
2. `npm test` 可通过。
3. `npm run pack:check` 已纳入 CI / 发布前检查。
4. `npm run test:e2e` 作为最小真实 bridge 回归入口已存在。
5. README、CHANGELOG 与平台仓库 `docs/15-version-matrix.md` 已对齐到同一发布线。

## 6. 升级规则

出现以下情况时，必须同步更新本文档、README 和平台仓库矩阵：

1. OpenClaw 声明支持范围变化。
2. Node.js 最低版本或已验证版本变化。
3. 平台共享版本、协议文档或测试向量变化。
4. 插件公开发布号变化，且兼容声明随之调整。

## 7. 当前结论

当前最稳妥的对外口径是：

- 插件正式发布基线为 `openclaw-generic-http 0.1.5`
- 当前声明支持 OpenClaw Desktop `2026.5.x`
- 当前明确实机验证版本为 `2026.5.12 (f066dd2)`
- 当前已验证 Node.js `22.x` 与 `24.x`
- 当前与 `clawbridge-platform 0.1.2` 保持共享协议与向量对齐

在补完 `2026.6.x` 实测和更正式的 release checklist 之前，不应扩大兼容声明范围。
