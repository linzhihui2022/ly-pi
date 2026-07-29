# Task for reviewer

[Read from: /Users/lychee/Documents/configure/plan.md, /Users/lychee/Documents/configure/progress.md]

只读审校 `ly-pi/assets/agents/*.md` 当前中文文案，并阅读 `ly-pi/assets/skills/review-pr/SKILL.md`。目标：从母语中文提示词编辑角度找出生硬直译、搭配错误、歧义、术语不一致、标点/格式问题；不得建议重构或增删规则，不得修改文件。按文件给出 file:line、现文、推荐最小改法。遵守已定风格：中文为主但保留 agent/subagent/review/reviewer/bug/debug/fallback/mock/stub/fake；edge case→边界情况；invariant 全程英文；a11y；视觉通用术语中文；强角色语气保留但润色。

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