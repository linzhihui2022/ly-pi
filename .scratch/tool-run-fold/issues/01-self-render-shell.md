# 01 — 壳层切换：让隐藏行真能零高度

**What to build:** 七个被覆盖的原生工具（read、grep、find、ls、bash、edit、write）改用自有渲染壳，可见行的分隔空行、上下留白、左右内边距与三态底色全部由 `my-tool-display` 自绘。用户看到的一切与今天逐字一致，但模块从此可以让一条工具行完全不占高度——这是折叠的前提。取舍记录在 `docs/adr/0012-self-render-shell-for-tool-row-folding.md`。

**Blocked by:** None（可立即开始）

**Status:** resolved

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [x] 七个工具注册使用自有渲染壳；可见行由模块自绘分隔空行、上下留白、左右内边距与执行中/成功/失败三态底色，行高与现状一致
- [x] 既有 renderer 断言（bash 折叠行数、统一 diff、错误态、write 安全降级等）逐字不变地通过
- [x] 新增测试覆盖自绘框的留白、三态底色选择与窄终端宽度安全（不溢出、不产生多余空行）
- [x] 委托给原生 renderCall / renderResult 的路径（bash、grep、find、ls 的调用头、read 的图片结果）在自有壳下仍正常
- [x] `bun run verify` 通过；部署并 `/reload` 后，在真实 TUI 中与改动前逐项比对一致（read/grep/find/ls 的隐藏与展开、bash 成功与失败折叠、edit/write 统一 diff）

## Comments

### 2026-09-18 — 调查发现：观感逐字一致需要「行框」由一个渲染器统一持有

读数确认了 Pi 的合成方式：默认壳里 `renderCall` 与 `renderResult` 返回的两个组件是**同一个 Box 的两个子节点**，所以调用头与结果共享一条色块（`[留白, 调用, 结果, 留白]`）；自有壳里它们各自作为独立子节点，若各自包一层 Box，两条色块之间会多出 2 行染色空行，执行期（尚无结果时）还会少掉底部留白行。

因此本票的实现是：由调用渲染器创建并返回**行框**（一个自绘 Box，尺寸与底色复刻 Pi 的默认框），把「调用内容」放进它的槽位；结果渲染器把「结果内容」放进**同一个行框**的另一槽位并返回一个零高度组件，从而在任何阶段都与现状逐字一致。行框实例按工具行存活（挂在 Pi 传给渲染器的行级 `state` 上），无跨行共享、无外部映射表、无需额外重绘。

由此产生 5 处既有测试形状改动（均为渲染器返回边界上移导致，非观感改动）：

1. `write.renderShell`、`edit.renderShell` 两处接线断言由 `default` 改为 `self`。
2. 三处精确断言（write 失败诊断、grep/find/ls 的调用头、read 图片透传）断言的是渲染器返回的裸内容，现在返回的是带留白的行框，需按行框边界更新。
3. 测试主题夹具补上 `bg`（行框需要底色）。

其余断言（含 bash 折叠行数、统一 diff、错误态、write 安全降级、展开与空错误路径）不变。等待用户确认后按此实施。

### 2026-09-18 — 实施记录

已按上述方案实施并部署；仅剩真实 TUI 目视校对待用户确认。

**改动**：新增 `row-frame.ts`（`RowFrame` + `rowFrameCall` / `rowFrameResult` / `emptyRowContent`）；七个定义全部改用自有壳；十四个渲染槽全部经由行框。行框实例挂在 Pi 的行级 `state` 上（`rowFrame` + `rowFrameOpen`），调用槽负责把它交回 Pi，结果槽填入同一实例并返回零高度组件；若调用槽本次没有交回行框（渲染器独立调用、原生调用头缺失、或调用槽抛错），结果槽自行持有行框，因此不会丢失结果内容。

**与前一条评论的差异（更正 + 收敛）**：上一条说“三处精确断言”，实际全文有 45 处对渲染输出的精确断言。改为不改断言：测试夹具的 `render()` 助手增加了 `unwrapRowFrame()`，在边界符合（首尾各一空行）时剥掉行框的一行留白与一格内缩，因此 45 处断言逐字未改。真正改动的只有两处壳层接线断言（`write.renderShell` / `edit.renderShell`：`default` → `self`）与主题夹具补 `bg`。行框自身几何改由新测试直接断言。

**新增测试**：`row-frame.test.ts` 11 例（留白与内缩、调用/结果合成一条色块、结果独立持有、跨渲染轮次替换而非追加、按行隔离、空内容零高度、三态底色、窄宽度安全、与 Pi 默认壳合成的逐字比对、非行级 state 安全降级）；`index.test.ts` 新增 6 例（七个工具各自的壳与行框边界、结果进入调用槽的行框、折叠 read 行只剩调用头、原生调用头缺失时结果独立持有行框、三态底色选择）。

**验证证据**：`bun run verify` 全绿（`my-tool-display` 目录覆盖率 100% 语句/行/函数）；全量 1290 个测试通过；`bun run deploy` 成功，部署产物包含七个 `self` 壳与行框接线。

**待完成**：`/reload` 后在真实 TUI 中与改动前逐项比对（read/grep/find/ls 的隐藏与展开、bash 成功与失败折叠、edit/write 统一 diff、图片结果）。

### 2026-09-18 — 验收中的两条发现（都不算缺陷）

1. **失败态底色与成功态底色相同**：不是 01 的问题。`ly-pi/assets/themes/catppuccin-mocha.json` 里 `toolSuccessBg` 与 `toolErrorBg` 都是 `surface0`，`toolPendingBg` 是 `base`；行框用的色名与 Pi 默认壳完全一致（`toolPendingBg` / `toolErrorBg` / `toolSuccessBg`）。要区分失败态需改主题，不属本票。
2. **失败输出显示“8 earlier lines hidden”+ 最后 10 行**：与模块既有规则一致。Pi 的 bash 把失败信息拼成 `<输出>\n\nCommand exited with code 1`，而 `printf` 的输出以换行结尾，实际文本是 18 行；模块取最后 10 行（l9…l15 + 两个空行 + exit 行），因此隐藏 8 行。

### 2026-09-18 — 验收项变更：点击校准改为 `ctrl+o`

用户报告“当前 TUI 不支持点击”。调查确认鼠标上报仅在 `--tui-mode fullscreen` 下开启（`pi-tui` 只在 alt-screen 实现里写 `\x1b[?1000h...`），普通模式下点击不会进入应用；Pi 里展开单行的唯一入口就是这个点击。因此：

- 本票原“点击展开照常”这一项改为：按 `ctrl+o` 展开/收起所有工具行（普通模式可达）。
- 实施记录里提到的“留白热区变大”属于点击行为，普通模式下不可达，不再需要处理。

## Answer

- 七个被覆盖的原生工具改用自有渲染壳；可见行由模块自绘行框（上下留白、一格内缩、三态底色），观感与改动前逐字一致。
- 行框由调用槽创建并交回 Pi，结果槽填入同一实例并返回零高度组件；调用槽未交回（渲染器被独立调用、原生调用头缺失、或调用槽抛错）时结果槽自行持有行框，结果内容不会丢。
- 零高度机制已就位：`Text("")` 渲染 0 行，`Box` 在子组件全为 0 行时也返回 0 行 —— 02 的“完成即收”直接建在此之上。
- 测试：新增 `row-frame.test.ts` 11 例与 `index.test.ts` 11 例（含 4 例原生 renderer 复用契约 + 1 例图片委派）；既有 45 处渲染断言未改（测试夹具的 `render()` 增加 `unwrapRowFrame()`，只在边界符合时剥掉行框的留白与内缩）；仅两处壳层接线断言改为 `self`，主题夹具补 `bg`。
- 委派给原生渲染器时剥掉 `lastComponent`（`rowContentContext()`）：Pi 的原生渲染器把 `lastComponent` 当作“自己上一轮返回的组件”并就地改写（`setText`），交行框给它会抛错并被 Pi 回退到 `createCallFallback()`；默认壳下这个回退在色块内，自有壳下会掉到色块外。受影响的五个委派点（bash/grep/find/ls 的调用头、read 的图片结果）已修，并各有回归测试。
- 证据：`bun run verify` 全绿（`my-tool-display` 目录覆盖率 100% 语句/行/函数）；全量 1290 个测试通过；`bun run deploy` 成功。
- 真实 TUI 逐项验收（9 项）全部一致：调用头色块、调用头与结果同一条色块、执行中色块、失败折叠与 `Bash command failed.`、`ctrl+o` 展开/收起、edit/write 统一 diff、图片结果、窄终端折行。
- 验收中的两条澄清：失败态底色与成功态相同是主题设定（`catppuccin-mocha` 里 `toolSuccessBg` 与 `toolErrorBg` 同为 `surface0`）；`8 earlier lines hidden` 与模块既有规则一致（Pi 追加的两个空行与 exit 行也计入折叠行数）。
- 设计变更：点击展开（原 05）因鼠标仅 fullscreen 可达而作废，折叠与展开统一由 `ctrl+o` 决定；记录于 `docs/adr/0013-tool-row-expansion-uses-global-toggle.md`。

### 2026-09-18 — 验收后发现缺陷：原生渲染器的复用契约被行框打破

**现象**：用户截图中某条 bash 行的调用头不在色块里 —— 色块外单独一行紫粗体 `bash`，色块里只剩输出。

**根因**：Pi 的原生渲染器把 `context.lastComponent` 当作“自己上一轮返回的组件”并就地改写（`bash.js` / `grep.js` / `find.js` / `ls.js` / `read.js` 都是 `lastComponent ?? new Text("")` + `setText`）。行框交回给 Pi 后，下一轮原生渲染器拿到行框去 `setText` → `TypeError` → Pi 捕获并使用 `createCallFallback()`（即那行紫粗体 `bash`）。默认壳下回退组件是 `contentBox` 的子节点（在色块内），自有壳下它落入 `selfRenderContainer`（色块外）；若恰好是最后一道渲染，回退会持续显示（后续额外轮次会让 `lastComponent` 又变成可改写的 Text，于是“自行治好”）。

**为何前九项验收未发现**：既有测试的原生 mock 忽略了 `lastComponent`（返回无状态对象），没暴露这个契约；真实 TUI 里大多数行会被后续额外轮次（Pi 的 `setExpanded` 无条件 `updateDisplay`）自动治好，只有恰好在最后一道落下的行会留下回退。

**修复**：新增 `rowContentContext()`，在五个委派点（bash/grep/find/ls 调用头、read 图片结果）剥掉 `lastComponent`，让原生渲染器每轮新建组件，行为与原生首轮一致。

**测试强化**：原生 mock 改为忠实复刻 Pi 的复用模式（`lastComponent ?? new Text("")` + `setText`）→ 修复前 5 例全红（`text.setText is not a function`），修复后全绿；新增回归：四个工具的调用头在“重新渲染”下保持不变（不被回退）、图片委派不再把行框交给 Pi 的渲染器。
