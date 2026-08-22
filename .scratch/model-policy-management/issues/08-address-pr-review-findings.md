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
