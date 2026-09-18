# 05 — 点击 Run Summary Row 展开这一次 run

**What to build:** 用户点击 Run Summary Row 时，只展开这一次 Tool Run 的工具行（展开后每行沿用现有输出规则），其他 run 不受影响。`ctrl+o` 仍是全局总开关；Tool Run 进行中点击摘要行不产生任何效果；已经展开的 run 不因为全局收起而回到折叠。

**Blocked by:** 02 — 完成即收：一次 Tool Run 只留一行摘要

**Status:** wontfix

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。设计变更由用户在 2026-09-18 确认（砍掉本票，只留 `ctrl+o` 总开关）。

- [ ] 点击 Run Summary Row 展开该 Tool Run 的全部工具行；再次点击回到折叠
- [ ] 展开只作用于被点击的 run，其他 run 保持折叠
- [ ] Tool Run 进行中点击摘要行无效果；`ctrl+o` 的全局展开不受影响
- [ ] 已展开的 run 在全局收起后保持展开（单向）
- [ ] 摘要行点击不与 Pi 的行级展开点击互相干扰（不发生双重切换）
- [ ] 测试覆盖：点击与全局开关解耦、单向性、运行中无效果
- [ ] `bun run verify` 通过；真实 TUI 手动确认点击展开与全局开关共存（本项已随本票作废）

## Comments

### 2026-09-18 — wontfix：鼠标仅 fullscreen 可达，用户选择只留 ctrl+o

用户在 01 的验收中发现“当前 TUI 不支持点击”。调查确认：

- `pi-tui` 只在 `tui-alt-screen.js` 里打开鼠标上报（`\x1b[?1000h\x1b[?1002h\x1b[?1004h\x1b[?1006h`）；`docs/tui.md` 明确写了 “Regular mode does not capture mouse input because the terminal owns its scrollback.”
- Pi 里“展开单行”的唯一入口就是这个鼠标点击（`tool-execution.js` 的 `createResultRegion` → `setExpanded`）；键盘只有 `ctrl+o`，且是全局的。
- 扩展可以注册快捷键（`pi.registerShortcut` 挂在默认编辑器的按键处理上，普通模式可用），确实能做“展开最近一次 run”的键盘替代。

用户在三个选项（快捷键 / 只留 `ctrl+o` / 快捷键+保留 fullscreen 点击）中选择了**只留 `ctrl+o` 总开关**，因此本票作废：单 run 展开不再是本期需求，相应地从 `spec.md` 的 User Stories、Implementation Decisions、Testing Decisions 与 Out of Scope 中移除（新增“单 run 展开”入 Out of Scope）。

对 08 的影响：08 的 Blocked by 去掉本票，验收清单去掉点到展开相关项。
