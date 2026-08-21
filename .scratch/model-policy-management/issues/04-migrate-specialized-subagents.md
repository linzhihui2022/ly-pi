# 04 — 迁移视觉与评论专用 agent

**What to build:** 作为 ly-pi 使用者，image-reader 始终由 vision 策略选择满足图像输入要求的候选，PR 评论分析由 standard 策略选择候选；两者都不会因 agent frontmatter 的高优先级模型声明绕过统一策略。

**Blocked by:** 02 — 用策略编译 Pi 默认与通用子代理

**Status:** ready-for-agent

- [ ] 专用 agent 的模型和 thinking 由部署生成的策略覆写管理，而不是自身 frontmatter。
- [ ] image-reader 绑定 vision，并在部署和诊断中验证图像输入能力。
- [ ] PR 评论分析绑定 standard，并继承其候选链和失败语义。
- [ ] 现有 agent 的工具、只读权限、提示词和职责保持不变。
- [ ] 测试验证专用 agent 的有效策略来源和能力要求，而非写死模型 ID。
