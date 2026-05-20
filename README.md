# openclaw-generic-http

`openclaw-generic-http` 是 OpenClaw 的 `generic-http` channel 插件。

它负责把 OpenClaw 接到一个遵循 `generic-http protocol v1` 的 bridge / relay / platform 上：

- 通过 `GET /stream/inbound` 消费入站事件
- 通过 `POST /stream/acks` 确认已处理事件
- 通过 `POST /outbound/messages` 发送 OpenClaw 出站消息
- 处理配置、安全签名、会话路由和宿主生命周期适配

## 当前完整度

当前版本已经具备 `0.1.x` 首次独立发布所需的最小闭环：

- `webhook + stream` ingress 运行时
- OpenClaw 宿主注册入口与 host adapter
- `health / probe / resolve / capabilities`
- 文本、图片、文件附件规范化
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

## 安装

```bash
openclaw plugins install @kittymi/openclaw-generic-http
```

或：

```bash
npm install -g @kittymi/openclaw-generic-http
```

当前更推荐通过 OpenClaw 插件机制安装，而不是只做全局 npm 安装。

## 配置示例

最小单账号配置：

```json
{
  "channels": {
    "generic-http": {
      "enabled": true,
      "defaultAccount": "default",
      "accounts": {
        "default": {
          "baseUrl": "https://bridge.example.com",
          "apiKey": "replace-me",
          "signingSecret": "replace-me"
        }
      }
    }
  }
}
```

本地联调样例见 [dev-config/README.md](./dev-config/README.md) 和 [dev-config/openclaw-generic-http.local.json](./dev-config/openclaw-generic-http.local.json)。

## 适用场景

适合：

- 本地或内网运行的 OpenClaw
- 第三方系统通过 webhook 写入 bridge
- OpenClaw 通过 stream 主动拉取入站事件

不适合：

- 需要插件直接暴露公网入站地址的场景
- 一开始就要覆盖复杂卡片、多租户工作台、重型消息总线的场景

## 本地开发

```bash
npm install
npm run build
npm test
npm run pack:check
npm run test:e2e
```

当前 OpenClaw 桌面版本下，更可靠的启用方式仍然是：

1. 安装插件
2. 手工写入 `channels.generic-http`
3. 执行 `openclaw channels list --all`
4. 执行 `openclaw channels status --channel generic-http`

`openclaw channels add --channel ...` 仍主要依赖内置静态 catalog，不一定能直接枚举第三方 channel。

## 文档

- 安装与配置：[docs/01-installation-guide.md](./docs/01-installation-guide.md)
- 常见问题：[docs/02-faq.md](./docs/02-faq.md)
- 本地联调：[docs/03-local-dev.md](./docs/03-local-dev.md)

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
