# 01 — add deterministic read-only gh/git whitelist

**What to build:** 常用且语义明确的只读 GitHub CLI 与 Git 查询应在权限规则层被确定性放行，使它们不受 Judge 超时或不一致判断影响；相邻的远程写入、本地写入和可能执行外部程序的命令仍不得自动放行。

**Blocked by:** None — can start immediately.

**Status:** resolved

**Risk:** High

**Approval:** 用户已明确批准 `.scratch/gh-git-readonly-whitelist/spec.md` 及本票源代码与测试实施；不授权部署、合并或 `/reload`。

- [x] 常用只读 `gh` 子命令与显式 GET API 查询在规则求值时返回 `allow`。
- [x] 常用只读 `git` 查询在规则求值时返回 `allow`，且外部 diff/textconv 形式不获得自动放行。
- [x] 链式命令仅在每个单元都属于白名单时自动放行。
- [x] GitHub 远程写入、非 GET 或带载荷 API、Git 推送/抓取/历史重写/远程或配置写入仍返回非 `allow`。
- [x] 回归测试覆盖历史 Judge Log 的代表性误拦场景与相邻危险反例。
- [x] 仓库完整验证通过。

## Comments

- 用户已批准单一完整垂直票：规则与回归测试一并交付。
- HUD 测试阻塞已由其改动完成后解除；全量测试现已通过。

## Answer

- 已确定性放行常用只读 `gh` / `git` 命令及只包含白名单单元的链式命令。
- `gh api` 仅放行显式 GET 且不含请求载荷、自定义主机或自定义头的形式；写入和相邻危险命令继续不自动放行。
- `git show` 的 `--ext-diff` 与 `--textconv` 形式继续交由 Judge。
- 已提交为 `3fd8c6f`（`feat(permission): whitelist read-only gh and git commands`）。
- `bun run verify` 已通过；部署和 `/reload` 仍需单独批准。