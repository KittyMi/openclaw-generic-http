# 联合 `0.2.0` Sprint A 执行清单

## 1. 文档目标

本文档把联合 `0.2.0` 的第一个 Sprint，从“任务拆解”进一步收成插件端可直接执行的清单。

对应联合版本总拆解：

- [09-joint-0.2.0-task-breakdown.md](./09-joint-0.2.0-task-breakdown.md)

平台仓库对应执行清单：

- `D:\openclaw-http-bridge\docs\23-joint-0.2.0-sprint-a-checklist.md`

## 2. Sprint 目标

Sprint A 只做一件事：

`冻结插件端在联合 0.2.0 中的兼容与发布口径`

结束时必须做到：

1. 插件能明确回答是否支持 OpenClaw `2026.6.x`
2. 插件兼容矩阵、README、release checklist 与平台矩阵一致
3. 后续 Sprint 可以在稳定版本边界上继续做状态输出与健壮性开发

## 3. 本 Sprint 不做的事

Sprint A 当前不直接开发：

1. 新的 stream reconnect 算法
2. 新的多账号并行调度逻辑
3. 新的协议字段
4. npm 正式发布动作

如果验证兼容性时必须改代码，只允许做最小验证性改动，不扩展为正式功能开发。

## 4. 插件端执行清单

### A-C1. 明确 `2026.6.x` 兼容结论

- [ ] 选定具体 OpenClaw `2026.6.x` 验证版本
- [ ] 跑安装与 channel 加载验证
- [ ] 跑最小 `webhook -> stream -> ack -> outbound` 闭环
- [ ] 记录验证结果、限制条件和已知问题

完成标准：

- README 和 compatibility matrix 能明确写出“支持 / 暂不声明支持”

### A-C2. 收口兼容矩阵

- [ ] 更新 `docs/05-compatibility-matrix.md`
- [ ] 明确插件版本、OpenClaw 支持范围、Node.js 范围、平台对齐版本
- [ ] 明确是否继续维持 `clawbridge-platform 0.1.2` 基线，或升级到新的联合 `0.2.0` 目标口径

完成标准：

- compatibility matrix 不再保留模糊措辞，如“最新 OpenClaw”或“未来评估”

### A-C3. 收口 README 与发布说明

- [ ] 更新 `README.md` 的兼容性、运行时、发布定位段落
- [ ] 更新 `docs/06-release-checklist.md`
- [ ] 更新 `docs/07-release-notes-policy.md`

完成标准：

- README、release checklist、release notes policy 三处版本口径一致

## 5. 平台端协同检查项

插件侧在 Sprint A 需要反向确认平台侧至少完成：

- [ ] 平台 `docs/15-version-matrix.md` 已同步插件兼容结论
- [ ] 平台联合版本说明没有提前承诺插件未完成能力
- [ ] 平台联合任务拆解中的插件依赖项与本仓库口径一致

## 6. 联合执行清单

### A-X1. 双仓矩阵同步

- [ ] 同步平台 `docs/15-version-matrix.md`
- [ ] 同步插件 `docs/05-compatibility-matrix.md`
- [ ] 同步双仓 README 的兼容与版本说明

完成标准：

- 双仓不会出现不同的 OpenClaw 支持范围或不同的插件/平台目标版本

### A-X2. 协议边界确认

- [ ] 确认本 Sprint 不升级协议版本
- [ ] 确认共享样例是否只需要补说明，不需要改字段
- [ ] 在文档中明确 `0.2.0` 仍基于 `protocol v1`

完成标准：

- Sprint B 不会因为 Sprint A 口径不清而临时改协议边界

## 7. 输出物清单

Sprint A 结束前，插件仓库至少应新增或更新：

- [ ] `README.md`
- [ ] `docs/05-compatibility-matrix.md`
- [ ] `docs/06-release-checklist.md`
- [ ] `docs/07-release-notes-policy.md`
- [ ] `docs/09-joint-0.2.0-task-breakdown.md`
- [ ] `docs/10-joint-0.2.0-sprint-a-checklist.md`

并与平台仓库至少同步：

- [ ] `D:\openclaw-http-bridge\docs\15-version-matrix.md`
- [ ] `D:\openclaw-http-bridge\docs\22-joint-0.2.0-task-breakdown.md`
- [ ] `D:\openclaw-http-bridge\docs\23-joint-0.2.0-sprint-a-checklist.md`

## 8. 建议执行顺序

1. 先完成 `2026.6.x` 兼容验证。
2. 再更新 compatibility matrix。
3. 再更新 README 与 release checklist。
4. 最后和平台仓库统一矩阵与版本说明。

## 9. Sprint 结束判定

只有同时满足以下条件，Sprint A 才算完成：

1. `2026.6.x` 支持结论明确
2. 插件 compatibility matrix 完成更新
3. 插件 README 与 release 说明完成更新
4. 平台版本矩阵已同步
5. Sprint B 可以直接进入状态输出与健壮性开发
