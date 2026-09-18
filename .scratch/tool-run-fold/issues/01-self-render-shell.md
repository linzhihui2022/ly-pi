# 01 — 壳层切换：让隐藏行真能零高度

**What to build:** 七个被覆盖的原生工具（read、grep、find、ls、bash、edit、write）改用自有渲染壳，可见行的分隔空行、上下留白、左右内边距与三态底色全部由 `my-tool-display` 自绘。用户看到的一切与今天逐字一致，但模块从此可以让一条工具行完全不占高度——这是折叠的前提。取舍记录在 `docs/adr/0012-self-render-shell-for-tool-row-folding.md`。

**Blocked by:** None（可立即开始）

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [ ] 七个工具注册使用自有渲染壳；可见行由模块自绘分隔空行、上下留白、左右内边距与执行中/成功/失败三态底色，行高与现状一致
- [ ] 既有 renderer 断言（bash 折叠行数、统一 diff、错误态、write 安全降级等）逐字不变地通过
- [ ] 新增测试覆盖自绘框的留白、三态底色选择与窄终端宽度安全（不溢出、不产生多余空行）
- [ ] 委托给原生 renderCall / renderResult 的路径（bash、grep、find、ls 的调用头、read 的图片结果）在自有壳下仍正常
- [ ] `bun run verify` 通过；部署并 `/reload` 后，在真实 TUI 中与改动前逐项比对一致（read/grep/find/ls 的隐藏与展开、bash 成功与失败折叠、edit/write 统一 diff）
