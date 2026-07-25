# 01 — my-hud.json 支持 modelShortNames 模型短名配置

**What to build:** my-hud 支持可选配置文件 `my-hud.json`（与扩展目录同级，遵循仓库 JSON 配置约定），其中 `modelShortNames` 字段允许用户把完整模型 ID 映射为 HUD 上显示的短名（例如 `kimi-coding/k3` → `k3`）。未配置的模型显示默认名称；配置缺失或解析失败时静默回退默认行为；`/reload` 后新配置生效。读取时机、默认值合并策略由实现时按仓库现有配置加载惯例确定。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `my-hud.json` 的 `modelShortNames` 映射生效，HUD 模型字段显示短名
- [ ] 未命中映射的模型显示默认名称
- [ ] 配置缺失/解析失败静默回退，不影响 HUD 其他字段
- [ ] 单元测试覆盖映射命中、未命中、配置缺失、配置损坏四种路径
