# 发布 Checklist

## 1. 目标

本文档用于固定 `openclaw-generic-http` 的当前发布前检查、发布动作和发布后记录口径。

当前只覆盖插件仓库自身：

- npm 包发布
- README / CHANGELOG / 兼容矩阵收口
- 与平台仓库的版本矩阵同步

不覆盖平台仓库的后端 / 前端线上部署。

## 2. 当前发布方式

当前插件发布采用“三段式”固定路径：

1. 本地先完成文档、构建和最小回归检查
2. 先生成对应版本的 git tag，并创建对应 GitHub Release
3. GitHub Actions 手动触发 npm 发布 workflow

当前 workflow 入口：

- `D:\openclaw-generic-http\.github\workflows\release-plugin-npm.yml`

当前 workflow 内固定执行：

1. `npm ci`
2. `npm run build`
3. `npm test`
4. `npm run pack:check`
5. `npm run test:e2e`
6. 检查 npm 上是否已存在同版本
7. `npm publish --access public --tag <npm_tag>`

## 3. 发布前准备

发布前至少确认：

1. 目标版本号已在 `package.json` 中更新
2. `CHANGELOG.md` 已写入实际变更，且没有虚构内容
3. `README.md`、`docs/05-compatibility-matrix.md` 与当前兼容声明一致
4. 如修改协议、签名、路由或共享向量，平台仓库文档已同步更新
5. 本地工作区没有不打算随发布一起说明的脏改动
6. 如果要扩大 OpenClaw 支持范围，必须先补对应宿主验证记录

如果本次变更涉及 OpenClaw 支持范围、Node.js 支持范围、协议字段或共享测试向量，
必须同步检查：

- `D:\openclaw-http-bridge\docs\15-version-matrix.md`
- `D:\openclaw-http-bridge\docs\02-protocol-v1.md`
- `D:\openclaw-http-bridge\docs\06-security-spec.md`
- `D:\openclaw-http-bridge\docs\08-session-routing-spec.md`
- `docs/11-openclaw-2026.6-compat-validation.md`

## 4. 本地发布前检查

发布前固定执行：

```powershell
npm run build
npm test
npm run pack:check
npm run test:e2e
```

建议补充检查：

```powershell
git status --short
```

当前最低通过标准：

1. TypeScript 构建成功
2. 单元测试全部通过
3. `npm pack --dry-run` 成功
4. 最小真实 bridge 回归通过
5. 如扩大支持声明，宿主验证记录完整

## 5. 文档与版本收口

准备发布前，至少确认以下文件口径一致：

1. `package.json`
2. `CHANGELOG.md`
3. `README.md`
4. `docs/05-compatibility-matrix.md`
5. `D:\openclaw-http-bridge\docs\15-version-matrix.md`
6. `docs/11-openclaw-2026.6-compat-validation.md`（如本次改兼容声明）

重点检查项：

| 检查项 | 目标 |
| --- | --- |
| 包版本号 | `package.json` 与发布目标一致 |
| 变更记录 | `CHANGELOG.md` 已记录实际内容 |
| OpenClaw 支持范围 | `README.md` 与兼容矩阵一致 |
| Node.js 支持范围 | `README.md` 与兼容矩阵一致 |
| 平台对齐版本 | 插件矩阵与平台矩阵一致 |
| 宿主验证记录 | 扩大支持声明时必须有对应记录 |

## 6. 触发发布

在触发 npm 发布前，必须先完成版本标记和 GitHub Release：

1. 确认目标版本对应的提交已经落在默认发布分支
2. 创建并推送版本 tag，例如 `v0.1.7`
3. 基于同名 tag 创建 GitHub `New release`
4. Release 标题与 tag 保持一致，例如 `v0.1.7`
5. Release 内容至少覆盖 `CHANGELOG.md` 中该版本的实际变更

当前硬规则：

1. 不允许先发 npm、后补 tag
2. 不允许只打 tag、不建 GitHub Release
3. npm 上的发布版本、git tag、GitHub Release 三者必须一致

当前通过 GitHub Actions 手动触发：

1. 打开仓库 Actions
2. 选择 `Release Plugin to npm`
3. 输入 `npm_tag`
4. 触发 workflow

`npm_tag` 当前建议：

- 正式发布：`latest`
- 预发布 / 灰度验证：按需要使用非 `latest` 标签

如果 workflow 在“package version already exists”步骤失败，说明：

1. 当前版本号已经发布过
2. 需要先调整 `package.json` 版本
3. 再重新执行 workflow

## 7. 发布后检查

workflow 成功后，至少确认：

1. npm 包已可查询到目标版本
2. npm 包 metadata 与仓库信息一致
3. 对应版本的 git tag 已经存在于远端
4. 对应版本的 GitHub Release 已可访问
5. README 中的安装命令仍适用于当前发布线
6. 如本次变更影响兼容声明，平台仓库矩阵也已同步

建议最小记录项：

| 项目 | 记录内容 |
| --- | --- |
| package name | `@kittymi/openclaw-generic-http` |
| package version | 本次发布号 |
| git tag | 例如 `v0.1.7` |
| GitHub Release | Release 链接 |
| npm tag | `latest` 或实际使用标签 |
| workflow run | GitHub Actions run 链接或编号 |
| docs synced | `yes/no` |
| known issues | 如有则记录 |

## 8. 回滚口径

插件 npm 发布后的“回滚”本质上不是删除已发布版本，而是：

1. 发布一个新的修正版本
2. 必要时调整 dist-tag
3. 同步修正文档和兼容声明

因此当前回滚口径为：

1. 不依赖撤回已公开版本
2. 优先通过新的 patch version 修复问题
3. 若错误仅在标签层，优先修正 npm dist-tag

## 9. 常见失败点

当前最常见的失败点：

1. `CHANGELOG.md` 没有跟版本号同步
2. 发 npm 前没有先创建对应 tag 和 GitHub Release
3. `README.md`、兼容矩阵、平台矩阵口径不一致
4. 本地没跑 `test:e2e`，但 workflow 才暴露最小 bridge 回归失败
5. `package.json` 版本号已存在于 npm
6. 兼容声明扩大了，但没有新增实测依据
7. README 写了新支持线，但没有同步平台矩阵

排障时优先看：

1. 本地 `npm run build`
2. 本地 `npm test`
3. 本地 `npm run test:e2e`
4. GitHub Actions workflow 日志
5. npm registry 上的实际版本状态
6. `docs/11-openclaw-2026.6-compat-validation.md`

## 10. 变更纪律

后续如修改以下任一项，必须同步更新本文档：

1. 发布 workflow 入口或步骤
2. 本地发布前检查项
3. 版本矩阵口径
4. 发布后记录项
5. 回滚策略
