# 版本发布说明策略

## 1. 目标

本文档用于固定 `openclaw-generic-http` 的版本号、`CHANGELOG.md`、`README.md`、
兼容矩阵以及平台协同文档之间的同步规则。

目标不是增加流程，而是避免以下常见漂移：

- 版本号已变，但 `CHANGELOG.md` 没更新
- README 还在描述旧的兼容范围
- 插件仓库和平台仓库的版本矩阵不一致
- 发布 workflow 能发包，但对外说明口径不完整

## 2. 当前发布说明对象

每次准备发布时，至少要同步检查以下文件：

1. `package.json`
2. `CHANGELOG.md`
3. `README.md`
4. `docs/05-compatibility-matrix.md`
5. `docs/06-release-checklist.md`
6. `D:\openclaw-http-bridge\docs\15-version-matrix.md`

## 3. 版本号变更规则

### 3.1 必须同步更新的文件

当 `package.json` 中的 `version` 变化时，至少应同步更新：

1. `CHANGELOG.md`
2. `docs/05-compatibility-matrix.md` 中的插件发布基线
3. 平台仓库 `docs/15-version-matrix.md` 中的外部插件版本

### 3.2 不应只改版本号

以下做法不允许作为正式发布准备完成态：

1. 只修改 `package.json`，不写 `CHANGELOG.md`
2. 只写 `CHANGELOG.md`，不确认兼容矩阵
3. 只改插件仓库，不同步平台矩阵

## 4. CHANGELOG 书写规则

`CHANGELOG.md` 必须满足：

1. 只记录实际已经交付或准备发布的内容
2. 不写“计划中”“可能会支持”“预期会完成”这类未来时描述
3. 优先写外部用户能感知到的行为变化
4. 如果只是文档治理或发布治理收口，也可以写，但要如实说明

当前推荐结构：

1. 版本标题
2. 1 到 3 个主题小节
3. 每节列出实际完成的行为变化

## 5. README 同步规则

当以下内容变化时，必须同步更新 `README.md`：

1. OpenClaw 声明支持范围
2. Node.js 最低版本或已验证范围
3. 安装方式或推荐安装路径
4. 最小验证路径
5. 发布定位

特别要求：

1. README 中的“兼容性”必须与 `docs/05-compatibility-matrix.md` 一致
2. README 中的“发布定位”必须与当前发布治理成熟度一致
3. README 不要宣称超出实测范围的兼容性

## 6. 兼容矩阵同步规则

以下任一变化都必须更新 `docs/05-compatibility-matrix.md`：

1. 插件发布号变化
2. OpenClaw 声明支持范围变化
3. Node.js 已验证版本变化
4. 平台对齐版本变化
5. 共享协议或测试向量口径变化

如果兼容矩阵更新了，平台仓库 `docs/15-version-matrix.md` 也必须同步检查。

## 7. 平台协同规则

以下场景属于双仓同步变更：

1. 协议字段变化
2. 签名行为变化
3. 路由模型变化
4. 共享测试向量变化
5. 插件与平台的兼容声明变化

此时至少要同步检查：

1. `D:\openclaw-http-bridge\docs\02-protocol-v1.md`
2. `D:\openclaw-http-bridge\docs\06-security-spec.md`
3. `D:\openclaw-http-bridge\docs\08-session-routing-spec.md`
4. `D:\openclaw-http-bridge\docs\15-version-matrix.md`

## 8. 最小发布说明检查清单

每次准备触发 npm 发布前，至少确认：

| 检查项 | 目标 |
| --- | --- |
| `package.json` version | 已更新到目标版本 |
| `CHANGELOG.md` | 已记录本次真实变更 |
| `README.md` | 兼容范围与发布定位无漂移 |
| `docs/05-compatibility-matrix.md` | 发布基线和兼容范围已更新 |
| 平台矩阵 | 外部插件版本和兼容口径已同步 |

## 9. 常见错误写法

以下写法应避免：

1. “支持最新 OpenClaw”  
   - 问题：没有具体版本边界
2. “兼容所有 2026.x”  
   - 问题：没有实测依据
3. “发布流程已完全自动化”  
   - 问题：当前仍是手动触发 workflow
4. “生产可用”  
   - 问题：如果没有明确运维、兼容和回滚基线，这类表述过度

## 10. 当前建议

在当前阶段，最稳妥的版本发布说明口径是：

1. 插件已具备 `0.1.x` 预览发布条件
2. 当前正式支持 OpenClaw Desktop `2026.5.x`
3. 当前已验证 Node.js `22.x` 和 `24.x`
4. 当前 npm 发布通过手动触发 GitHub Actions workflow 执行
5. 在补完更广泛兼容验证前，不扩大支持声明
