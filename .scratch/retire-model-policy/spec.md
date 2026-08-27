# 退役 Model Policy 子系统

Status: approved for ticketing
Risk: High — 权限法官模型路径与 Pi 本机配置所有权变更
Approval Record: 用户已在本会话确认规格与两票拆分；该记录仅授权创建规格和票据。运行时代码实施、部署和 reload 仍须在实施票据中取得明确的 High-risk 批准。

## Problem Statement

当前仓库通过 Model Policy Subsystem 为主会话、子代理、权限审查、自动 Session Display Name 和 HUD 提供角色化模型选择、候选回退、能力校验与部署编译。该机制的实际行为不符合维护者预期，且让本机 Pi 设置的所有权、局部功能的模型绑定和部署副作用难以区分。

维护者需要彻底移除所有活跃的 Model Policy 工件，同时保留必要功能并将模型责任收敛为两种清晰的方式：本机自有 Pi 模型设置，以及功能局部的 Direct Model Binding。

## Solution

退役所有活跃的 Model Policy 源码、配置、部署逻辑、诊断命令、测试和现行文档引用。部署不再决定主模型或子代理模型，也不再复制或读取策略 manifest。

权限法官、审计/合并和自动 Session Display Name 改用明确的 Direct Model Binding。模型选择失败时保持原有保守语义：权限 Judge 要求手动确认，审计/合并不写入 `JUDGE.md`，自测失败，自动命名保持未命名。HUD 显示模型的完整 `provider/id`，不再依赖策略标签。

历史 `.scratch/` 记录保持不变：扫描未发现整份专属于 Model Policy Subsystem 的历史文件。本规格是本次退役的审计记录。

## User Stories

1. 作为维护者，我希望移除所有活跃的 Model Policy 工件，以便仓库不再通过角色、候选或 manifest 间接决定模型。
2. 作为 Pi 使用者，我希望主模型和子代理模型由本机 Pi 设置决定，以便仓库部署不会覆盖我的本地选择。
3. 作为维护者，我希望部署不再校验、复制或编译策略 manifest，以便部署副作用仅限于仍被仓库拥有的配置。
4. 作为已有本机设置的使用者，我希望退役部署不删除现有模型设置或 `models.local.json`，以便已有本地数据不会被意外破坏。
5. 作为安全敏感的使用者，我希望 Judge 直接使用明确的 Luna 绑定并在失败时继续要求人工确认，以便移除策略不会造成 fail-open。
6. 作为权限审计使用者，我希望 Advocate、Prosecutor、Chief Judge 和规则合并继续使用明确的 Sol 审计绑定，以便事后审查与 `JUDGE.md` 写入保护继续可用。
7. 作为维护者，我希望共享审计绑定使用 `auditModel` 和 `auditThinking` 的术语，以便配置名称与实际审计职责一致。
8. 作为使用者，我希望自动 Session Display Name 继续可用，并直接由 Luna 生成，以便不依赖已退役的 Fast role。
9. 作为使用者，我希望自动命名失败时保持未命名且不产生额外重试，以便其仍是非侵入性的辅助功能。
10. 作为 HUD 使用者，我希望看到当前模型的完整 `provider/id`，以便显示真实模型身份而非策略别名。
11. 作为维护者，我希望部署后旧 manifest 被移除且本机模型设置保持不变，以便可验证仓库已放弃模型设置所有权。
12. 作为维护者，我希望测试覆盖直接绑定、保守失败语义、HUD 展示和 staging 部署行为，以便退役不会改变未授权的功能边界。
13. 作为审计者，我希望历史规格不因本次退役被批量删除，以便现有功能的决策脉络仍可追溯。

## Implementation Decisions

- 删除活跃的 Model Policy Subsystem，包括其注册表、加载器、角色/候选 manifest、诊断命令、扩展接线、部署编译与所有依赖它的测试和现行文档说明。
- 主模型和子代理模型改为 Locally Owned Pi Model Settings。仓库部署不再写入默认 provider、默认模型、默认 thinking 或任何子代理模型覆盖。
- 部署删除其先前生成的 manifest，但不删除、改写或迁移现有 Pi settings，也不删除 `models.local.json`。后者在退役后不再被任何运行时代码读取。
- 权限 Judge 采用 Direct Model Binding `openai-codex/gpt-5.6-luna`，不传 `reasoningEffort`。找不到模型、请求异常、超时或非完整响应时继续产生需要人工确认的保守结果。
- Advocate、Prosecutor、Chief Judge 与规则合并共用 Direct Model Binding `openai-codex/gpt-5.6-sol`，使用 `high` thinking。共享配置字段改为 `auditModel` 与 `auditThinking`；失败时返回错误并禁止写入 `JUDGE.md`。
- Direct Model Binding 不再执行角色解析、候选切换、能力诊断、策略失败分类或新增重试。现有调用方的超时和失败结果保持不变。
- 自动 Session Display Name 采用 Direct Model Binding `openai-codex/gpt-5.6-luna`，不传 `reasoningEffort`，且保持单次、静默失败和不命名的行为。
- HUD 不再解析策略别名；模型字段始终使用当前模型的完整 `provider/id`。
- 当前术语表保留 Direct Model Binding 与 Locally Owned Pi Model Settings，并移除已退役机制的活跃定义；现行 README 删除相关模块与配置说明。

## Testing Decisions

- 测试只验证用户可观察的行为、部署结果和安全边界，不测试被删除的内部实现细节。
- 权限测试覆盖 Judge 的 Luna 直接解析与调用、审计/合并的 Sol + high 绑定、模型不存在/错误/超时/非完整响应的保守结果，以及不写入 `JUDGE.md` 的保证。
- 自动命名测试覆盖 Luna 的直接调用、不传 `reasoningEffort`、无模型或模型错误时返回未命名，以及现有输出校验。
- HUD 测试覆盖模型字段展示完整 `provider/id`，且不再依赖标签解析器。
- 部署集成测试以 staging 目录验证：不再生成或保留 manifest，且已有默认模型、thinking 和子代理覆盖字段不会被部署修改。
- 删除范围以静态引用检查和相关测试调整验证，确保 `/models-doctor`、策略 manifest 与活跃策略依赖不再存在。
- 完成前必须通过 `bun run verify`；随后运行 `bun run deploy`，并由用户执行 `/reload` 验证已部署扩展。

## Out of Scope

- 删除或改写既有 `.scratch/` 历史规格与 Git 历史。
- 删除、重置或迁移现有本机 Pi 模型设置。
- 删除用户的 `models.local.json`。
- 选择、推荐或配置主模型和子代理模型。
- 修改权限规则、Judge prompt、`JUDGE.md` 内容、确认界面或安全放行规则。
- 增加模型候选回退、能力协商、额外重试或 fail-open 行为。
- 为 HUD 新增模型别名配置或隐藏模型字段。

## Further Notes

- 本次需求的 High-risk 面来自权限 Judge 的模型路径变更。创建本规格已获用户确认；运行时代码实施、部署和 reload 前仍须在后续实施票据中记录明确批准。
- 不创建历史删除票：在已确认的“整份文件专属旧系统”边界内，候选数为 0。
