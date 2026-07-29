# Task for reviewer

[Read from: /Users/lychee/Documents/configure/plan.md, /Users/lychee/Documents/configure/progress.md]

只读审校 `ly-pi/assets/agents/*.md` 的暂存中文译文，并对照 `HEAD` 中 5 个原英文 reviewer 文件；另检查 `ly-pi/assets/skills/review-pr/SKILL.md` 与这些 reviewer 的聚合协议是否一致。目标：找出语义误译、遗漏、协议不兼容和会改变 agent 行为的措辞。不要修改任何文件。仅报告有证据的问题，给出 file:line、原意、问题与最小修正建议。已确定术语：保留 agent/subagent/review/reviewer/bug/debug/fallback/mock/stub/fake；edge case→边界情况；invariant 全程英文；accessibility→a11y；视觉通用术语译中文；聚合协议用 `## 聚合器标签摘要` 和 `[严重]/[重要]/[建议]`；review-pr 最终将翻译全部人类文本。

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```