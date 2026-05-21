# openclaw-generic-http

`openclaw-generic-http` 是 OpenClaw 的 `generic-http` channel 插件。

它负责把 OpenClaw 接到一个遵循 `generic-http protocol v1` 的 bridge / relay / platform 上：

- 通过 `GET /stream/inbound` 消费入站事件
- 通过 `POST /stream/acks` 确认已处理事件
- 通过 `POST /outbound/messages` 发送 OpenClaw 出站消息
- 处理配置、安全签名、会话路由和宿主生命周期适配

## 这个插件适不适合你

适合：

- OpenClaw 运行在本地或内网
- 第三方系统通过 webhook 把事件写入 bridge / relay
- OpenClaw 通过 stream 主动拉取入站事件
- 当前目标是先打通文本、图片、文件和基础会话闭环

不适合：

- 需要插件自己直接暴露公网入站地址
- 一开始就要求复杂卡片、多租户工作台、重型消息总线
- 需要已经覆盖完整 OpenClaw 多版本兼容矩阵的成品插件

## 发布定位

当前版本已经具备 `0.1.x` 首次独立发布所需的最小闭环：

- `webhook + stream` ingress 运行时
- OpenClaw 宿主注册入口与 host adapter
- `health / probe / resolve / capabilities`
- 文本、图片、文件与文本+附件混合消息规范化
- 构建、测试与 npm 打包检查

当前仍未完成的平台级能力：

- 还没有覆盖多个 OpenClaw 版本的兼容矩阵
- 只有基础 CI 和手动发布流程，尚未形成完整发布自动化
- 只有最小真实 bridge 回归脚本，尚未形成更完整的端到端样例集
- 多账号、复杂附件和更细粒度错误映射仍是后续增强项

结论：

- 适合作为 `0.1.x` 预览版公开发布
- 还不应宣称为“生产级已完全收口”

## 兼容性

当前声明的支持范围：

- OpenClaw Desktop `2026.5.x`
- Node.js `>=22.16.0`

当前已验证环境：

- OpenClaw `2026.5.12 (f066dd2)`

| Item | Status |
| --- | --- |
| OpenClaw Desktop `2026.5.12` | Verified locally |
| OpenClaw Desktop `2026.5.x` | Supported release line |
| Node.js `22.x` | Verified in local/dev and CI |
| Node.js `24.x` | Verified in local/dev and CI |

说明：

- `2026.5.x` 是当前 `0.1.2` 发布线声明支持的 OpenClaw 版本范围
- 当前只在 `2026.5.12` 做过实际本机验证
- 对 `2026.4.x` 及更早版本、以及 `2026.6.x` 及更高版本，当前不承诺兼容

## 快速开始

1. 安装插件：

```bash
openclaw plugins install @kittymi/openclaw-generic-http
```

2. 在 `openclaw.json` 中写入 `channels.generic-http`
3. 执行 `openclaw channels list --all`
4. 执行 `openclaw channels status --channel generic-http`
5. 验证目标 bridge 的 `health / probe / stream / outbound` 链路

当前更推荐通过 OpenClaw 插件机制安装，而不是只做全局 npm 安装。

## 安装方式

推荐方式：

```bash
openclaw plugins install @kittymi/openclaw-generic-http
```

如果你在本地调试插件源码：

```bash
openclaw plugins link /path/to/openclaw-generic-http
```

只做全局安装也可以，但不是当前首选方式：

```bash
npm install -g @kittymi/openclaw-generic-http
```

## 配置示例

最小单账号配置：

```json
{
  "channels": {
    "generic-http": {
      "enabled": true,
      "defaultAccount": "online_001",
      "accounts": {
        "online_001": {
          "baseUrl": "https://bridge.example.com",
          "apiKey": "replace-me",
          "signingSecret": "replace-me"
        }
      }
    }
  }
}
```

配置规则：

- `defaultAccount` 必须指向 `accounts` 里真实存在的账号键
- 一个账号配置对应一个平台 `accountId`
- 不要再把示例账号统一写成 `default` 再到线上手改

本地联调样例见 [dev-config/README.md](./dev-config/README.md) 和 [dev-config/openclaw-generic-http.local.json](./dev-config/openclaw-generic-http.local.json)。

## 最小验证路径

建议第一次接入按这个顺序验证：

1. `openclaw channels status --channel generic-http`
2. bridge `GET /health`
3. bridge `POST /probe`
4. 插件 `POST /outbound/messages`
5. 第三方系统写 `POST /webhooks/inbound/messages`
6. 插件消费 `GET /stream/inbound` 和 `POST /stream/acks`

如果只想快速验证插件和最小 bridge 是否真实互通，可以直接运行：

```bash
npm run test:e2e
```

## 已知限制

- 当前正式兼容声明只覆盖 OpenClaw Desktop `2026.5.x`
- 当前只在 `2026.5.12 (f066dd2)` 做过本机验证
- `openclaw channels add --channel ...` 仍主要依赖内置静态 catalog，第三方 channel 不一定直接出现在交互式枚举里
- 当前重点仍是最小闭环，不是全量平台能力

## 本地开发与发布前检查

```bash
npm install
npm run build
npm test
npm run pack:check
npm run test:e2e
```

## 文档

- 安装与配置：[docs/01-installation-guide.md](./docs/01-installation-guide.md)
- 常见问题与限制：[docs/02-faq.md](./docs/02-faq.md)
- 本地联调：[docs/03-local-dev.md](./docs/03-local-dev.md)
- 下一阶段规划：[docs/04-next-phase-plan.md](./docs/04-next-phase-plan.md)
- 文档目录：[docs/README.md](./docs/README.md)

## 开源协作

当前仓库使用 [MIT License](./LICENSE)。

社区协作入口：

- 贡献说明：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 行为准则：[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- 安全上报：[SECURITY.md](./SECURITY.md)

如果你要提交代码或文档改动，建议优先：

1. 先确认是否影响协议、签名、路由或 OpenClaw 兼容范围
2. 再执行 `npm run build`、`npm test`、`npm run pack:check`、`npm run test:e2e`
3. 最后同步更新 README、CHANGELOG 或示例配置
