# 法庭模型增加第四角色：审判长（Chief Judge），静态审计 JUDGE.md 规则

辩护律师（审假阳性）和检察官（审假阴性）都基于会话日志分析案例。JUDGE.md 规则本身会随累积出现矛盾、过宽、冗余、遗漏等问题——没有任何角色审查这个维度。新增审判长，静态审视 JUDGE.md + judge-prompt.md，输出 add/remove/modify/merge 四种建议，补齐法庭隐喻的最后一块。

## 四角色职责划分

| 角色 | 审查对象 | 输入 | 输出操作 | 成本子类型 |
|------|---------|------|---------|-----------|
| Judge（法官） | 每次工具调用 | 实时 tool_call | safe/unsafe | `judge` |
| Advocate（辩护律师） | 假阳性案例 | `DeniedThenApproved[]` | add / remove | `advocate-analysis` / `advocate-merge` |
| Prosecutor（检察官） | 假阴性风险 | `JudgeLogEntry[]`（safe 记录） | add | `prosecutor-analysis` / `prosecutor-merge` |
| **Chief（审判长）** | **规则本体** | **JUDGE.md + judge-prompt.md** | **add / remove / modify / merge** | **`chief-analysis` / `chief-merge`** |

审判长不依赖会话日志，可在任意时机调用。

## 实现方案

- **独立文件** `chief.ts`：`createChief` + `createChiefMerger`，与 `prosecutor.ts` / `professor.ts` 平级
- **独立合并器** `createChiefMerger`：专属 prompt 处理 modify/merge 操作，不复用 `professor.ts` 的 `createMerger`
- **模型**：通过 Model Policy Registry 请求 `security-audit` Role，不维护角色专用模型配置
- **工具注册**：`permission_chief`，触发词：审判长、规则审计、规则审查、矛盾、冲突、过宽
- **UI 流程**：Phase 1 逐条确认 → Phase 2 diff 预览 + 写入，复用现有 `mergeAndWriteJudgeMd` 的确认/写入模式，但合并调用改为 `createChiefMerger`

## Considered Options

- **合入 professor.ts**：被拒绝。辩护律师（案例驱动）和审判长（规则驱动）的分析逻辑、输出操作集合、合并语义均不同，合在一个文件会导致 prompt 膨胀和职责模糊。
- **审判长也审会话日志**：被拒绝。那会与检察官职责重叠。三个事后角色的价值在于各管一摊。
- **modify 操作拆成 remove + add**：被拒绝。用户看到的是两条独立操作，无法识别这是同一条规则的收紧。显式 modify 让意图更清晰。

## Consequences

- 法庭隐喻从三角色变为四角色，`JUDGE.md`、`/court-costs`、`cost-tracker` 均需新增 chief 相关支持。
- 审判长的 modify/merge 操作比 add/remove 更复杂，合并 prompt 质量是成败关键——需要针对规则去重、语义覆盖、合并措辞做专门调优。
- 静态审计 + 三案例审计的覆盖形成闭环：误判（advocate）、漏判（prosecutor）、规则腐化（chief），没有明显盲区。
