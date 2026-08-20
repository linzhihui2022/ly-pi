# Agentic Delivery Guardrails（Agent 交付护栏）

Agent 只能依据 `.scratch/` 下的票据（ticket），或由人工明确提出、范围（scope）清晰且
具有明确验收标准（acceptance criteria）的请求进行实施。

## 开始检查清单（Start Checklist）

实施前：

1. 确认范围（scope）和验收标准（acceptance criteria）。
2. 将风险（risk）评定为 `Low`、`Medium` 或 `High`。
3. 确认所需批准（approval）已被记录。
4. 只在约定范围内工作。
5. 按 `AGENTS.md` 完成必要检查（checks）。
6. 在 PR 模板中记录证据（proof）。

## 风险路由（Risk Routing）

| 风险（Risk） | 包括 | Agent 可执行 | 批准（Approval） |
| --- | --- | --- | --- |
| `Low` | 文档、测试、小型 UI 文案或样式、隔离的缺陷修复（bugfix）、安全重构（refactor）、仓库工具。 | 根据范围明确的请求直接实施。 | 合并（merge）前进行人工审查（human review）。 |
| `Medium` | 面向用户的行为、跨模块变更、集成（integration）、性能（performance）变更、接近安全边界的工作（security-adjacent）。 | 在方案（plan）获批后实施。 | 实施前取得已记录的批准（recorded approval）；合并前进行人工审查。 |
| `High` | 身份验证（auth）、权限（permissions）、密钥（secrets）、生产或客户数据、个人身份信息（PII）、支付、账单（billing）、基础设施（infra）、DNS、部署设置（deploy settings）、CI/CD 权限、破坏性迁移（destructive migrations）、事件响应（incidents）、客户承诺。 | 除非明确获批，否则只能制定方案。 | 实施、合并以及必要的发布（release）前均须取得已记录的批准。 |

除非明确缩小风险范围，否则应将权限执行机制（`JUDGE.md`、
`ly-pi/my-permission/`）、密钥、部署工作流（deploy workflows）、CI/CD 权限、
生产环境（production environments）、破坏性迁移和发布机制（release
mechanisms）视为 `High risk`。

已记录的批准（recorded approval）指记录在 `.scratch/` 票据、GitHub、Notion 或其他
约定系统中的批准。对于 `Medium` 或 `High risk`，口头批准不足。

## 停止条件（Stop Conditions）

出现以下情况时，立即停止并升级处理（stop and escalate）：

- 缺少验收标准；
- 范围或风险扩大；
- 出现生产、客户、安全、隐私、账单、身份验证、基础设施、部署或客户数据风险；
- 需要真实密钥或特权访问（privileged access）；
- 必要检查（required checks）因原因不明而失败；
- 继续工作需要禁用测试、绕过 CI 或削弱保护措施；
- 无法留下清晰的 PR 证据（PR evidence）。

使用以下格式：

```text
Stopping because:
Needed:
Current state:
Suggested next action:
```

## 交付证据（Proof）

使用 `.github/PULL_REQUEST_TEMPLATE.md`。

如果跳过了相关检查（relevant checks），必须说明原因。
