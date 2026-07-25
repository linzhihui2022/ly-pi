# 01 — my-hud.json 支持 modelShortNames 模型短名配置

**What to build:** my-hud 支持可选配置文件 `my-hud.json`（与扩展目录同级，遵循仓库 JSON 配置约定），其中 `modelShortNames` 字段允许用户把完整模型 ID 映射为 HUD 上显示的短名（例如 `kimi-coding/k3` → `k3`）。未配置的模型显示默认名称；配置缺失或解析失败时静默回退默认行为；`/reload` 后新配置生效。读取时机、默认值合并策略由实现时按仓库现有配置加载惯例确定。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `my-hud.json` 的 `modelShortNames` 映射生效，HUD 模型字段显示短名
- [x] 未命中映射的模型显示默认名称
- [x] 配置缺失/解析失败静默回退，不影响 HUD 其他字段
- [x] 单元测试覆盖映射命中、未命中、配置缺失、配置损坏四种路径

## Answer

2026-07 实现完成。要点：

- 配置文件位置定为**扩展目录内** `pi-extensions/my-hud/my-hud.json`（与 my-bt/my-permission 实际代码一致；AGENTS.md “同级”描述与实际不符，另行修正）
- 新增 `config.ts`：`loadHudConfig(dir)` 加载并校验 `my-hud.json`，缺失/损坏/结构非法一律静默回退空映射
- `format.ts` 新增 `setModelShortNames()`：用户映射覆盖内置 `SHORT_NAMES`，未命中回退内置短名再回退原始 ID
- `index.ts` 启动时加载配置；`/reload` 重新加载扩展即生效
- `scripts/deploy.ts` 部署时若存在 `my-hud.json` 一并拷贝
- 测试：`config.test.ts` 8 条 + `format.test.ts` 5 条；全量 220 通过，覆盖率 100%
