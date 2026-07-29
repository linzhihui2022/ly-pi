## Review

### 正确

- 5 个 reviewer 的 front matter 行为配置未被意外改变，仅翻译了 `description` 和正文。
- 5 个 reviewer 已统一输出 `## 聚合器标签摘要` 以及 `[严重]`、`[重要]`、`[建议]`：
  - `ly-pi/assets/agents/pr-code-reviewer.md:41-68`
  - `ly-pi/assets/agents/pr-comment-analyzer.md:54-80`
  - `ly-pi/assets/agents/pr-silent-failure-hunter.md:86-113`
  - `ly-pi/assets/agents/pr-test-analyzer.md:48-75`
  - `ly-pi/assets/agents/pr-type-design-analyzer.md:57-84`
- 评分区间、严重度映射和“不得修改文件”等关键行为约束基本忠实保留。

### Blocker

1. **聚合器仍解析旧英文协议，导致所有中文标签发现无法被提取。**
   - 位置：`ly-pi/assets/skills/review-pr/SKILL.md:189`、`ly-pi/assets/skills/review-pr/SKILL.md:246`
   - 原意：聚合器必须解析每个 reviewer 强制输出的摘要标题和严重度标签。
   - 问题：5 个 reviewer 已输出 `## 聚合器标签摘要` 和 `[严重]/[重要]/[建议]`，但 SKILL 仍只识别 `## Tag Summary for Aggregator` 和 `[CRITICAL]/[IMPORTANT]/[SUGGESTION]`。按当前协议执行会得到空聚合结果。
   - 最小修正：将第 189 行的标题及三个解析标签替换为中文协议；第 246 行的“移除标签噪音”列表同步替换为中文标签。

### Note

2. **[重要] `review-pr` 尚未满足“全部人类文本翻译”的最终要求。**
   - 位置：`ly-pi/assets/skills/review-pr/SKILL.md:2-58`、`ly-pi/assets/skills/review-pr/SKILL.md:63-74`、`ly-pi/assets/skills/review-pr/SKILL.md:83-189`、`ly-pi/assets/skills/review-pr/SKILL.md:252-267`
   - 原意：最终翻译全部面向人类或 agent 的说明、标题、表格文字、调度 prompt 和规则。
   - 问题：上述范围仍有大量英文正文和调度 prompt。
   - 最小修正：翻译人类文本，保留命令、路径、标识符、代码变量和 URL 不变。

3. **[重要] `invariant` 未按既定术语全程保留。**
   - 位置：`ly-pi/assets/agents/pr-type-design-analyzer.md:3`、`:11`、`:19`、`:25`、`:34`、`:38-49`、`:73-74`、`:93`、`:99`、`:103`
   - 原意：原文所有 `invariant(s)`，且既定术语要求全程保留 `invariant`。
   - 问题：绝大多数被译为“不变量”，第 11 行甚至写成“不变量（invariant）”，术语不一致。
   - 最小修正：将这些“不变量”统一替换为 `invariant`，无需中英并列。

4. **[重要] `fallback` 被译为“降级/退回”，违反既定术语且缩窄语义。**
   - 位置：`ly-pi/assets/agents/pr-silent-failure-hunter.md:3`、`:15`、`:21`、`:23`、`:34`、`:59-64`、`:79`、`:84`、`:102-103`
   - 原意：检查任何替代路径或默认行为的 `fallback`，不一定都是功能“降级”。
   - 问题：“降级”会使 agent 更偏向只检查能力下降的路径，可能漏掉等价替代或默认值 fallback。
   - 最小修正：相关名词统一保留 `fallback`，如“fallback 逻辑”“fallback 行为”“fallback 链”。

5. **[重要] `edge case` 未按既定术语翻译为“边界情况”。**
   - 位置：
     - `ly-pi/assets/agents/pr-comment-analyzer.md:27`
     - `ly-pi/assets/agents/pr-test-analyzer.md:19`、`:22`、`:40`
   - 原意：检查 edge cases。
   - 问题：直接保留了 `edge case`，不符合已确定术语。
   - 最小修正：统一改为“边界情况”；第 22 行可写为“边界条件缺少边界情况覆盖”。

6. **[重要] `accessibility` 未按既定术语写作 `a11y`。**
   - 位置：`ly-pi/assets/agents/pr-code-reviewer.md:23`
   - 原意：检查 accessibility 问题。
   - 问题：仍保留 `accessibility`。
   - 最小修正：改为 `a11y 问题`。

7. **[重要] 四个专职 reviewer 丢失了 `exclusively` 的排他范围约束。**
   - 位置：
     - `ly-pi/assets/agents/pr-comment-analyzer.md:17`
     - `ly-pi/assets/agents/pr-test-analyzer.md:15`
     - `ly-pi/assets/agents/pr-silent-failure-hunter.md:15`
     - `ly-pi/assets/agents/pr-type-design-analyzer.md:15`
   - 原意：`Focus exclusively on ...`，只审查各自专业维度。
   - 问题：“专注于”不等于“仅专注于”，可能扩大 reviewer 输出范围并增加跨 reviewer 重复发现。
   - 最小修正：统一改为“仅专注于……”或“只审查……”。

8. **[建议] `mutates them` 的译文对象不清，可能误导类型 reviewer。**
   - 位置：`ly-pi/assets/agents/pr-type-design-analyzer.md:15`
   - 原意：审查创建类型实例或修改其实例状态的函数/构造函数。
   - 问题：“创建或变更它们的函数”容易理解为变更类型定义本身。
   - 最小修正：改为“以及任何创建其实例或修改其实例状态的函数或构造函数”。

9. **[建议] 一处 `debug` 未按既定术语保留。**
   - 位置：`ly-pi/assets/agents/pr-silent-failure-hunter.md:11`
   - 原意：`hard-to-debug issues`。
   - 问题：译为“难以调试的问题”，而同文件第 22、46 行已保留 `debug`。
   - 最小修正：改为“难以 debug 的问题”。

### 残余风险

- 请求指定的 `plan.md` 和 `progress.md` 在仓库根目录均不存在，因此无法核对其中可能存在的额外范围或决策。
- 本次严格只读，未修改任何文件；工作区原有暂存及未跟踪内容保持不变。