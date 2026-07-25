# 03 — aboveEditor 字段可通过 my-hud.json 隐藏

**What to build:** my-hud 的 aboveEditor 状态栏字段（project、model、git branch、context%、tokens、cost）支持用户通过 `my-hud.json` 配置隐藏。在 01 票引入的配置文件中新增 `hiddenFields` 数组字段，命中的字段不渲染；未配置或为空数组时显示全部字段；配置缺失/解析失败静默回退默认行为；字段名未命中时忽略该条目；`/reload` 后生效。

**Blocked by:** 01

**Status:** resolved

- [x] `my-hud.json` 的 `hiddenFields` 生效，命中字段不再渲染
- [x] 未配置/空数组时渲染全部字段
- [x] 未命中的字段名条目被忽略，不影响其他字段
- [x] 配置缺失/解析失败静默回退，不影响 HUD 其他行为
- [x] 单元测试覆盖：命中隐藏、未配置、空数组、非法字段名、配置损坏

## Answer

2026-07 实现完成。要点：

- 字段词表：`project` / `model` / `branch`（含 PR 号）/ `gitStatus` / `context` / `input` / `output` / `cacheRead` / `cost` / `cacheRate` / `permission`；`branch` 与 `gitStatus` 相互独立，可单独隐藏
- `config.ts`：`hiddenFields` 须为字符串数组，否则静默回退 `[]`
- `render.ts` 新增 `setHiddenFields()`，模块级 Set，`buildStatusLine` 按字段过滤
- `index.ts` 启动时随 `modelShortNames` 一并装配，`/reload` 生效
- 测试：`config.test.ts` +3 条、`render.test.ts` +5 条；全量 229 通过，覆盖率 100%
