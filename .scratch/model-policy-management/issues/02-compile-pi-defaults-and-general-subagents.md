# 02 — 用策略编译 Pi 默认与通用子代理

**What to build:** 作为 ly-pi 使用者，我修改 primary、fast 或 standard 的默认候选或合法本地覆写后，部署会一致地更新 Pi 的初始默认模型、thinking 以及 scout/delegate 的候选链，而不必编辑多个设置字段。

**Blocked by:** 01 — 建立 Model Policy Registry 与诊断

**Status:** ready-for-agent

- [ ] deploy 从有效 Model Policy Registry 编译 primary 的初始默认模型和默认 thinking。
- [ ] deploy 从 fast 与 standard 策略编译 scout、delegate 的模型、thinking 和固定顺序 fallback 配置。
- [ ] 普通 Local Model Override 会影响编译结果；安全策略不会被该覆写改变。
- [ ] 原 settings 中与这些受管理角色重复的具体模型选择被移除，且其他非模型设置保持不变。
- [ ] 测试验证编译输出及部署合并行为，不依赖真实 provider 或凭据。
