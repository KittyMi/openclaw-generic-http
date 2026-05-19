# 贡献说明

## 仓库定位

这个仓库只承载 `openclaw-generic-http` 插件本身。

这里不放：

- 平台后端代码
- 平台前端代码
- 与插件无直接关系的规划文档

## 提交前要求

在提交实现改动前，请先确认：

1. 改动仍然符合 `generic-http protocol v1`
2. 签名、时间戳、nonce 和路由行为没有被无意改坏
3. 插件作用域仍然只限于 transport、mapping、security 和 host integration
4. 行为变化已经补测试或补文档

## 协作规则

1. 大改动先开 issue 或 discussion。
2. 保持改动小而可审查。
3. 不随意修改公开字段名、manifest 结构或 schema 语义。
4. 如果改动影响安装、配置、兼容性或限制说明，同步更新 README。

## 本地验证

提交前至少执行：

```bash
npm run build
npm test
npm run pack:check
npm run test:e2e
```
