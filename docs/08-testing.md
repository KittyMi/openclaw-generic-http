# 测试说明

本文档说明 `openclaw-generic-http` 的测试分层、运行方式和如何新增测试。

## 1. 测试体系概览

| 层级 | 工具 | 入口 | 覆盖范围 |
| --- | --- | --- | --- |
| 单元测试 | vitest | `npm test` | 模块级行为、边界条件、错误路径 |
| 端到端回归 | Node.js 脚本 + 本地 bridge | `npm run test:e2e` | HTTP 请求签名、stream/ack、outbound 闭环 |
| 打包检查 | npm pack | `npm run pack:check` | 发布文件完整性 |

## 2. 单元测试

### 2.1 运行

```bash
npm test
```

配置文件：[vitest.config.ts](../vitest.config.ts)，Node 环境，匹配 `src/**/*.test.ts`。

### 2.2 测试文件

```
src/
  channel/
    host-adapter.test.ts   ← HostAdapter 生命周期与事件注入
    lifecycle.test.ts      ← 插件启动/停止生命周期
    plugin.test.ts         ← ChannelPlugin 入站拉取行为
  config/
    loader.test.ts         ← 配置加载与校验
  outbound/
    http-client.test.ts    ← HTTP 出站重试与错误映射
  index.test.ts            ← 插件注册入口与 manifest
  setup-entry.test.ts      ← setup-entry 注册行为
```

### 2.3 测试覆盖要点

| 模块 | 关键测试点 |
| --- | --- |
| `host-adapter` | inbound event 注入、SSE 解析、ack 回调 |
| `lifecycle` | start/stop 状态、多 account 并行 |
| `plugin` | 长轮询 `waitSeconds`、stream 响应处理 |
| `loader` | 配置合并、默认值、非法配置拒绝 |
| `http-client` | 签名请求构造、重试退避、错误分类 |
| `index` | pluginId、channelName、configSchema 完整性 |
| `setup-entry` | registerPlugin 返回值一致性 |

### 2.4 新增测试

```typescript
import { describe, expect, it } from "vitest";

describe("功能模块名", () => {
  it("具体行为描述", () => {
    // 构造输入
    // 执行被测函数
    // 断言预期结果
    expect(actual).toEqual(expected);
  });
});
```

要求：

- 测试文件放在对应源码同级目录，命名为 `<module>.test.ts`
- 使用 `describe` 组织测试套件，`it` 描述具体行为
- 优先用 mock（`vi.fn()` / `vi.spyOn()`）隔离外部依赖，不发起真实网络请求

## 3. 端到端回归

### 3.1 运行

```bash
npm run test:e2e
```

脚本：[scripts/e2e-bridge-regression.mjs](../scripts/e2e-bridge-regression.mjs)

脚本会启动一个最小本地 HTTP bridge，使用真实 HTTP 调用验证：

1. 插件请求签名（`x-timestamp`、`x-nonce`、`x-signature`、`x-api-key`）
2. `GET /health` — 健康检查
3. `POST /probe` — 实例探测
4. `POST /resolve` — 目录解析
5. `POST /webhooks/inbound/messages` — 入站消息写入
6. `GET /stream/inbound` — SSE 事件拉取
7. `POST /stream/acks` — 事件确认
8. `POST /outbound/messages` — 出站投递

### 3.2 运行前准备

需先构建：

```bash
npm run build
```

E2E 脚本依赖 `dist/` 中的构建产物，不使用 mock。

## 4. 打包检查

```bash
npm run pack:check
```

等价于 `npm pack --dry-run`，验证 `package.json` 的 `files` 字段与实际文件一致，避免漏发或误发文件。

## 5. CI 中的测试

当前 `.github/workflows` 中固定执行：

```bash
npm ci
npm run build
npm test
npm run pack:check
npm run test:e2e
```

全部通过后才允许发布。

## 6. 测试原则

- 单元测试覆盖模块级逻辑，不依赖外部服务
- E2E 覆盖 HTTP 签名与闭环行为，使用真实网络调用
- 修改签名、协议字段或路由映射时，必须同步更新对应的 `*.test.ts` 和 E2E 断言
- 新增实现文件时，建议同时新增对应的测试文件
