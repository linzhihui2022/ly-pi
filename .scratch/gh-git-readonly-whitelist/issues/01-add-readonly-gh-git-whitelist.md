# 01 — add deterministic read-only gh/git whitelist

**What to build:** 常用且语义明确的只读 GitHub CLI 与 Git 查询应在权限规则层被确定性放行，使它们不受 Judge 超时或不一致判断影响；相邻的远程写入、本地写入和可能执行外部程序的命令仍不得自动放行。

**Blocked by:** None — can start immediately.

**Status:** claimed

**Risk:** High

**Approval:** 用户已明确批准 `.scratch/gh-git-readonly-whitelist/spec.md` 及本票源代码与测试实施；不授权部署、合并或 `/reload`。

- [ ] 常用只读 `gh` 子命令与显式 GET API 查询在规则求值时返回 `allow`。
- [ ] 常用只读 `git` 查询在规则求值时返回 `allow`，且外部 diff/textconv 形式不获得自动放行。
- [ ] 链式命令仅在每个单元都属于白名单时自动放行。
- [ ] GitHub 远程写入、非 GET 或带载荷 API、Git 推送/抓取/历史重写/远程或配置写入仍返回非 `allow`。
- [ ] 回归测试覆盖历史 Judge Log 的代表性误拦场景与相邻危险反例。
- [ ] 仓库完整验证通过。

## Comments

- 用户已批准单一完整垂直票：规则与回归测试一并交付。
- 当前阻塞：`bun run --cwd ly-pi test` 中有 5 个 `my-hud/index.test.ts` 失败，来自本票之外的未提交 HUD 改动；本票的 `rules.test.ts` 98 个测试在未启用覆盖率的定向运行中均已通过。