# 07 — 收敛旧模型选择并全局验收

**What to build:** 作为 ly-pi 维护者，我可以确认所有受管理模型选择都经由 Model Manifest、Model Policy Registry 或由其编译的 Pi 设置完成；旧硬编码和兼容读取路径不再造成第二个配置真源。

**Blocked by:** 02 — 用策略编译 Pi 默认与通用子代理; 03 — 迁移会话命名与 HUD; 04 — 迁移视觉与评论专用 agent; 06 — 迁移安全审计与权限 self-test

**Status:** ready-for-agent

- [ ] 删除已迁移功能中的旧模型常量、重复 settings、独立 HUD 短名表、受管理 agent frontmatter 模型字段和直接 Provider 注册。
- [ ] 仓库默认的具体 provider/model 标识仅保留在 Model Manifest 及其专属测试或文档说明中。
- [ ] 不保留旧配置读取路径或静默兼容行为，失效配置得到可诊断错误。
- [ ] `/models-doctor`、部署输出、标题、子代理、视觉和安全路径共同验证统一策略的最终行为。
- [ ] 全量测试、类型检查、格式检查和文档检查通过。
