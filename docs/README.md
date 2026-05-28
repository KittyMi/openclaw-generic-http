# openclaw-generic-http 文档目录

文档按使用者旅程组织：先了解能力边界 → 再安装配置 → 再联调验证 → 最后看规划与治理。

## 入口

**[../README.md](../README.md)** — 项目总览，包含功能矩阵、兼容性、配置参考和快速开始。

## 使用者文档

| 文档 | 说明 |
| --- | --- |
| [01-installation-guide.md](./01-installation-guide.md) | 安装前提、安装方式、最小配置与首次联调 |
| [02-faq.md](./02-faq.md) | 常见问题与故障排查 |

## 开发者文档

| 文档 | 说明 |
| --- | --- |
| [03-local-dev.md](./03-local-dev.md) | 本地开发环境搭建与联调配置 |
| [08-testing.md](./08-testing.md) | 测试分层、运行方式与新增指南 |

## 治理文档

| 文档 | 说明 |
| --- | --- |
| [04-next-phase-plan.md](./04-next-phase-plan.md) | `0.2.x` 开发路线与任务拆解 |
| [05-compatibility-matrix.md](./05-compatibility-matrix.md) | 版本兼容声明、对齐基线与升级规则 |
| [06-release-checklist.md](./06-release-checklist.md) | 发布前检查项 |
| [07-release-notes-policy.md](./07-release-notes-policy.md) | CHANGELOG 与版本发布说明策略 |

## 协议与安全

本插件遵循以下上游规范（维护在 [clawbridge-platform](https://github.com/KittyMi/openclaw-http-bridge) 仓库）：

- `generic-http protocol v1` — 协议对象模型与 HTTP 接口
- `security spec v1` — HMAC 签名、防重放、幂等规则
- `session routing spec v1` — 会话/线程路由模型
- `docs/test-vectors/` — 共享签名与协议测试向量
