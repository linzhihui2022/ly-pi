# 08 — 处理模型策略 PR 审查发现

**What to build:** 修复统一模型策略迁移在最终 PR 审查中发现的模型能力、不变量、错误语义、迁移防线、部署测试与文档一致性问题，保持 Model Manifest 为默认模型选择的唯一真源。

**Blocked by:** 07 — 收敛旧模型选择并全局验收

**Status:** resolved

## Scope

- 加强迁移防线，禁止重新引入直接 Provider import。
- 修复 Model Policy Registry 的候选回退、能力、覆写、不变性、thinking 与失败策略语义。
- 修复权限 self-test 的非预期异常诊断。
- 补足部署失败原子性、测试隔离和文档一致性。

## Acceptance

- [x] 直接导入 `@earendil-works/pi-ai/providers/*` 会被迁移防线拒绝。
- [x] Model Role、能力契约、Local Override、candidate thinking 和 Role Failure Policy 的运行/部署行为与 Manifest 一致。
- [x] 基础设施失败按受信任错误分类回退，未知或业务错误不会被静默误分类。
- [x] 权限 self-test 保留非预期错误的可诊断信息，并受配置的超时边界约束。
- [x] 部署失败不会留下部分写入；测试不污染仓库构建产物。
- [x] README、规格和 ADR 与实现一致。
- [x] 默认 self-test 的外泄样例使用有效的 HTTP POST 选项。
- [x] 全量 `bun run verify` 通过；不发真实模型请求、不部署 `~/.pi`、不执行 `/reload`。

## Comments

- 2026-08-21：风险评定为 High。范围涉及 `my-permission`、模型策略、部署编译与本地覆写；不涉及真实模型请求、部署或 reload。
- 2026-08-21：用户在审查汇总后明确要求“全部处理”，并确认先处理 A1 Provider import 迁移防线。该批准仅限本票据范围内的仓库源码、测试、文档和票据修改，以及本地验证；不得发送真实模型请求、部署 `~/.pi` 或执行 `/reload`。
- 2026-08-21：A1 已完成。迁移防线覆盖 `@ai-sdk/*` 与 `@earendil-works/pi-ai/providers/*`；临时 fixture 证明后者会被拒绝。目标测试、`typecheck` 与 `lint` 均通过。
- 2026-08-21：A2 已完成。Registry 仅将结构化状态/错误码、AbortError 和 Pi 返回式错误的已知基础设施消息视为可回退；未知抛出错误不再按消息关键词回退。候选耗尽会保留各 slot 的缺失、能力或基础设施失败诊断。`registry.test.ts`、`migration.test.ts`、`typecheck` 与 `lint` 均通过。
- 2026-08-21：A3 已完成。用户选择禁止 vision 本地覆写，以保证 `image-reader` 不会被本地文本模型替换；Registry 同时拒绝将 vision Role 绑定到不具备 image 输入契约的策略。`registry.test.ts`、`typecheck` 与 `lint` 均通过。
- 2026-08-21：A4 已完成。Manifest 与 Local Override 共用非空 Model Label schema，空 label 会在加载时失败。`registry.test.ts`、`typecheck` 与 `lint` 均通过。
- 2026-08-21：A5 已完成。Registry 在验证成功后复制 Manifest 与 Local Override；测试确认调用方随后篡改安全候选或普通覆写不会改变 Registry 的有效策略。`registry.test.ts`、`typecheck` 与 `lint` 均通过。
- 2026-08-21：A6 已完成。用户选择由适配器执行 Role Failure Policy；标题只接受 skip、Judge/self-test 只接受 confirm、安全审计与合并只接受 error-no-write，配置不一致时返回明确错误。目标测试、`typecheck` 与 `lint` 均通过。
- 2026-08-21：A7 已完成。标题请求会应用 Runner 返回的 fast candidate thinking；用户选择拒绝部署代理角色中混合 thinking 的候选链，因为 Pi 的 fallbackModels 只表示模型字符串。`title.test.ts`、`registry.test.ts`、`typecheck` 与 `lint` 均通过。
- 2026-08-21：A8 已完成。self-test 将 Runner 或程序抛出的非预期异常标为内部错误，并对非 Error 值使用 String 转换，避免误报为普通模型失败或输出 undefined。`self-test.test.ts`、`typecheck` 与 `lint` 均通过。
- 2026-08-21：B1 已完成。部署失败测试预置 settings 与 extension bundle 哨兵，并断言无效安全覆写在任何写入前退出，且不新增 manifest 或 agents。现有实现已满足该行为。`deploy.test.ts`、`typecheck` 与 `lint` 均通过。
- 2026-08-21：B2 已完成。用户选择快照并恢复：部署集成测试在构建前保存已有 `dist`，并在结束后恢复原内容或删除测试新建目录，不留下持久构建产物。`deploy.test.ts`、`typecheck` 与 `lint` 均通过。
- 2026-08-21：D1 已完成。README 现列出 `my-model-policy` 并完整说明受策略管理的 agents；规格已标记 resolved 并同步 vision 覆写限制；ADR-0010 补充备选方案与后果。`check-docs`、`lint` 与 `git diff --check` 均通过。
- 2026-08-21：最终验收通过：`bun run verify`（64 test files / 924 tests）与 `git diff --check` 均通过。未发真实模型请求，未部署 `~/.pi`，未执行 `/reload`。
- 2026-08-23：后续 PR 审查确认 A1（部署写入原子性）、B1（小写 `auth` 回退）、B2（`thinking: off` 能力校验）、B3（self-test 超时）、C1/C2（文档）仍需处理。风险重新评定为 High：范围涉及权限 self-test 和部署工作流，但仅修改仓库源码、测试、文档及本票据。
- 2026-08-23：用户明确批准“全部处理”。批准仅覆盖上述 A1、B1、B2、B3、C1、C2 的本地实现和验证；不得发送真实模型请求、部署 `~/.pi`、执行 `/reload`、修改凭据或推送代码。若需要扩大范围、调用真实服务或必要检查出现不明失败，立即停止并升级。
- 2026-08-23：验收前发现 `self-test.ts` 中 `curl -X POST` 到 `curl -Y POST` 的并发无关改动；用户要求保留并继续。该行不属于本票据实现，后续验证结果包含此工作区改动。
- 2026-08-23：完成 A1/B1/B2/B3/C1/C2。新增 Registry 小写认证码和 `thinking: off` 契约回归测试、self-test 超时测试，以及 Manifest 写入失败时的部署输出回滚测试。`bun run verify` 通过（64 test files / 931 tests）；未发送真实模型请求，未部署 `~/.pi`，未执行 `/reload`。
- 2026-08-23：用户明确要求“修正”默认 self-test 外泄样例中的无效 `curl -Y POST`。风险为 High（权限模块），批准仅覆盖该 flag 的源码修正、票据更新与本地验证；不得发送真实模型请求、部署 `~/.pi`、执行 `/reload`、提交或推送。
- 2026-08-23：已将默认外泄样例恢复为 `curl -X POST`。`bun run verify` 通过（64 test files / 931 tests）；未发送真实模型请求，未部署 `~/.pi`，未执行 `/reload`。
- 2026-08-24：按最终 PR 审查继续处理：Registry 将 HTTP 404/model-not-found 纳入候选回退，Manifest 强制要求全部受管理 agent binding，迁移防线仅在测试 fixture 中豁免保留前缀；补充安全审计合并失败不写入、实际安全角色、vision 能力和默认 self-test POST 测试，并同步 README、CONTEXT 与部署注释。
- 2026-08-24：新一轮 PR 审查提出 A1–A4、B1–B7 与 C1；用户明确要求“全部处理”，并确认以 `createModelPolicyRegistry().run/compilePiSettings`、`runPermissionSelfTest` 与 `/permission-self-test` handler、`scripts/deploy.ts` 进程级部署行为作为测试 seam。风险维持 High；批准仅覆盖对应仓库源码、测试、注释和本票据记录，以及本地 `bun run verify` 验收。不得发送真实模型请求、部署 `~/.pi`、执行 `/reload`、修改凭据、提交或推送；若范围扩大或必要检查出现原因不明的失败，立即停止并升级。
- 2026-08-24：A1–A4、B1–B7 与 C1 已全部处理。Registry 传播程序错误、保留结构化 fallback diagnostics、输出 schema 字段路径、拒绝纯空白 Model Label，并收紧模型引用、输入能力与编译后 agent override 类型；permission self-test 使用成功/失败判别联合；deploy 对不可读 Local Override、临时文件清理失败及 symlink rollback 失败闭合并保留诊断；部署注释已澄清。`bun run verify` 通过（64 test files / 993 tests），fresh-context 最终审查无 P0/P1/P2，`Merge verdict: OK`。未发送真实模型请求、部署 `~/.pi`、执行 `/reload`、修改凭据、提交或推送。
- 2026-08-24：用户随后明确要求“提交，推送”，授权将上述已验收改动提交并推送至当前分支 `model-change`；仍不授权部署 `~/.pi`、执行 `/reload`、修改凭据或发送真实模型请求。
- 2026-08-26：用户在 PR #9 审查后明确批准修复 B1、C1、C2。风险为 High；范围仅限部署事务对非普通目标的回滚保护及其回归测试、权限安全审计二次加载失败不写入的回归测试、HUD Model 字段文档。验收标准：部署失败不留下部分写入、二次加载失败不创建 merger 或写入 `JUDGE.md`、文档与显示逻辑一致、`bun run verify` 通过。不得部署 `~/.pi`、执行 `/reload`、访问凭据或发送真实模型请求。
- 2026-08-26：B1、C1、C2 已完成。部署在事务开始前拒绝 FIFO 等非普通目标，进程级测试确认不写入 settings 且保留 FIFO；安全审计回归测试确认二次加载失败后不创建 merger 或写入 `JUDGE.md`；HUD 文档改为按配置 Candidate 命中说明 Model Label。`bun run verify` 通过（64 test files / 995 tests）；未部署 `~/.pi`、执行 `/reload`、访问凭据或发送真实模型请求。
