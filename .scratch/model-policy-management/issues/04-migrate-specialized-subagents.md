# 04 — 迁移视觉与评论专用 agent

**What to build:** 作为 ly-pi 使用者，image-reader 始终由 vision 策略选择满足图像输入要求的候选，PR 评论分析由 standard 策略选择候选；两者都不会因 agent frontmatter 的高优先级模型声明绕过统一策略。

**Blocked by:** 02 — 用策略编译 Pi 默认与通用子代理

**Status:** resolved

- [x] 专用 agent 的模型和 thinking 由部署生成的策略覆写管理，而不是自身 frontmatter。
- [x] image-reader 绑定 vision，并在部署和诊断中验证图像输入能力。
- [x] PR 评论分析绑定 standard，并继承其候选链和失败语义。
- [x] 现有 agent 的工具、只读权限、提示词和职责保持不变。
- [x] 测试验证专用 agent 的有效策略来源和能力要求，而非写死模型 ID。

## Comments

- 2026-08-21：风险评定为 High（部署设置会改变专用子代理的实际模型路由）。用户明确批准在限定范围实施：更新 Manifest 部署绑定、移除受管理 agent 的 `model`/`thinking` frontmatter，并仅用临时 staging 验证；不得部署 `~/.pi` 或执行 reload。已确认 TDD seam：`compilePiSettings()` 专用覆写、staging deploy 产物、以及 `/models-doctor` 的 vision 图像能力诊断。
- 2026-08-21：两轮 TDD 已完成；两轴代码审查未发现可操作问题；`bun run verify` 通过（62 test files / 904 tests）。仅运行了临时 staging deploy 测试，未部署 `~/.pi`、未 reload。
