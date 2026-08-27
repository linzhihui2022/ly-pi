# 02 — 退役策略基础设施与部署所有权

**What to build:** 删除剩余活跃的 Model Policy Subsystem、诊断命令、manifest、部署编译和现行文档引用，使部署不再拥有主模型或子代理模型设置，并安全移除已部署的旧 manifest。

**Blocked by:** 01 — 迁移运行时 Direct Model Binding.

**Status:** resolved

**Risk:** High — 部署行为与权限执行机制的最终退役。

**Approval:** Approved — 用户于 2026-08-27 在本会话明确选择“批准实施 02”，授权本票据范围内的 High-risk 实施、部署与 `/reload` 验证。

- [x] 删除所有剩余活跃策略注册、加载、角色/候选配置、诊断命令、扩展接线、相关测试和现行文档说明。
- [x] 部署不再校验、复制或编译策略配置，也不再写入默认模型、默认 thinking 或子代理模型覆盖。
- [x] 部署移除已生成的旧 manifest，同时保持既有 Pi settings 和 `models.local.json` 不变。
- [x] 术语表保留 Direct Model Binding 与 Locally Owned Pi Model Settings，并删除已退役机制的活跃定义。
- [x] staging 部署测试证明 manifest 已移除且现有模型 settings 未被修改；通过 `bun run verify`、`bun run deploy`，并在用户 `/reload` 后验证。

## Answer

已删除策略注册表、加载器、manifest、`/models-doctor`、扩展接线、部署编译及其测试和现行文档引用。部署现在仅在同一可回滚事务中移除旧 `model-policies.json`，并显式过滤仓库配置中的模型字段与子代理 overrides；staging 测试验证本机 settings 和 `models.local.json` 保持不变。

验证证据：`bun run verify` 通过（68 files / 1064 tests），`bun run deploy` 成功；已部署 manifest 不存在、settings 存在、`models.local.json` 保持此前不存在的状态；用户已确认 `/reload` 成功且扩展无报错。独立复审结论为 OK。
