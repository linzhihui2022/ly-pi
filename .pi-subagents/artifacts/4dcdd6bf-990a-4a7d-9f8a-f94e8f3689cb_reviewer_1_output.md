## Review

- **Correct**：已逐行审校 6 个 agent 文件，并以 `ly-pi/assets/skills/review-pr/SKILL.md:189` 的聚合协议为格式依据。
- **Correct**：`agent`、`PR review`、`bug`、`debug`、`mock`、`stub`、`fake` 等术语大体遵循既定风格。
- **Fixed**：无；本次严格只读，未修改文件。

### 1. `ly-pi/assets/agents/image-reader.md`

| 严重度 | 位置 | 现文 | 推荐最小改法 |
|---|---|---|---|
| 重要 | `image-reader.md:3` | “当父模型缺少视觉能力需要理解图片时使用。” | “当父模型需要理解图片但不具备视觉能力时使用。” |
| 重要 | `image-reader.md:16` | “截图与 UI”“UI 元素”“accessibility 问题” | “截图与界面”“界面元素”“a11y 问题” |
| 重要 | `image-reader.md:17` | “architecture diagram、flowchart、sequence diagram、数据可视化和 graph” | “架构图、流程图、时序图、数据可视化和图形” |
| 建议 | `image-reader.md:18,34` | “error dialog”“stack trace”“bullet point” | 分别改为“错误对话框”“堆栈跟踪”“项目符号” |
| 建议 | `image-reader.md:33` | “系统性地逐项分解所见内容” | “系统地梳理所见内容” |
| 重要 | `image-reader.md:39` | “你严格为只读。” | “你只能进行只读操作。” |
| 建议 | `image-reader.md:41` | “**精确。**” | “**确保准确。**” |

### 2. `ly-pi/assets/agents/pr-code-reviewer.md`

| 严重度 | 位置 | 现文 | 推荐最小改法 |
|---|---|---|---|
| **Blocker** | `pr-code-reviewer.md:44,50-52,57-59,67` | `## 聚合器标签摘要`、`[严重]`、`[重要]`、`[建议]` | 恢复机器协议词：`## Tag Summary for Aggregator`、`[CRITICAL]`、`[IMPORTANT]`、`[SUGGESTION]`；中文问题描述不变。`SKILL.md:189` 只解析这些英文标记。 |
| 建议 | `pr-code-reviewer.md:11` | “精通多语言和多框架的现代软件开发” | “熟悉多种语言和框架下的现代软件开发” |
| 建议 | `pr-code-reviewer.md:19` | “显式的项目规则” | “明确的项目规则” |
| 重要 | `pr-code-reviewer.md:23` | “accessibility 问题” | “a11y 问题” |
| 重要 | `pr-code-reviewer.md:32-33,57` | 评分段将 90 归入 76–90，但标签规则又规定 90–100 为严重 | 将第 57 行最小改为“置信度 91-100 使用 `[CRITICAL]`”。 |
| 建议 | `pr-code-reviewer.md:39` | “在有用处附上” | “必要时附上” |
| 建议 | `pr-code-reviewer.md:72` | “全面但严格过滤——质量优于数量。” | “审查要全面，但筛选要严格——质量重于数量。” |
| 建议 | `pr-code-reviewer.md:74` | `"看起来没问题"` | `“看起来没问题”` |
| 建议 | `pr-code-reviewer.md:77` | “不要将其作为 build/test pipeline 的一部分运行” | “但不要以构建/测试流水线的方式运行这些工具” |

### 3. `ly-pi/assets/agents/pr-comment-analyzer.md`

| 严重度 | 位置 | 现文 | 推荐最小改法 |
|---|---|---|---|
| **Blocker** | `pr-comment-analyzer.md:57,63-65,69-71,79` | 中文聚合标题和中文严重度标签 | 恢复 `## Tag Summary for Aggregator` 与 `[CRITICAL]`、`[IMPORTANT]`、`[SUGGESTION]`。 |
| 建议 | `pr-comment-analyzer.md:11` | “产生随时间叠加的技术债务” | “使技术债务随时间累积” |
| 重要 | `pr-comment-analyzer.md:13` | “免受注释腐烂的侵蚀”“以……开发者视角” | “防止代码库中的注释逐渐失真”“从……开发者的视角” |
| 建议 | `pr-comment-analyzer.md:24` | “与文档化的参数和返回类型匹配” | “与文档中的参数和返回类型一致” |
| 重要 | `pr-comment-analyzer.md:27` | “edge case” | “边界情况” |
| 建议 | `pr-comment-analyzer.md:34-35` | “复杂算法的方法是否已解释”“业务逻辑原理在不自明时是否已记录” | “复杂算法的思路是否已说明”“业务逻辑的依据若不直观，是否已说明” |
| 建议 | `pr-comment-analyzer.md:39` | `"为什么"`、`"是什么"` | `“为什么”`、`“是什么”` |
| 建议 | `pr-comment-analyzer.md:41` | “经验最少的未来维护者” | “经验尚浅的未来维护者” |
| 建议 | `pr-comment-analyzer.md:43` | “主动搜索注释可能被误解的方式” | “主动查找可能导致注释被误解的表述” |
| 重要 | `pr-comment-analyzer.md:64,70` | “注释可以增强或不完整”“对于可以增强或不完整的注释” | “注释有待完善或内容不完整”“对于有待完善或内容不完整的注释” |
| 建议 | `pr-comment-analyzer.md:84` | “每条注释都应通过……来证明其在代码库中的存在” | “每条注释都应提供清晰、持久的价值，证明其有必要留在代码库中。” |

### 4. `ly-pi/assets/agents/pr-silent-failure-hunter.md`

| 严重度 | 位置 | 现文 | 推荐最小改法 |
|---|---|---|---|
| **Blocker** | `pr-silent-failure-hunter.md:89,95-97,102-104,112` | 中文聚合标题和中文严重度标签 | 恢复 `## Tag Summary for Aggregator` 与三个英文严重度标签。 |
| 重要 | `pr-silent-failure-hunter.md:3,15,21,34,59,61-63,79,84,103` | 将 `fallback` 混用为“降级”“退回” | 统一保留 `fallback`，如“fallback 逻辑”“fallback 行为”“fallback 链”。第 21 行可改为“在用户不知情时采用 fallback 行为，就是在隐藏问题。” |
| 重要 | `pr-silent-failure-hunter.md:11` | “确保每个错误都被正确暴露、记录且可操作” | “确保每个错误都能被正确呈现和记录，并提供可操作的信息” |
| 重要 | `pr-silent-failure-hunter.md:19` | “任何发生但未正确记录且未通知用户的错误” | “任何未被正确记录、也未通知用户的错误” |
| 建议 | `pr-silent-failure-hunter.md:23` | “mock/fake 实现仅属于测试代码” | “mock/fake 实现只能用于测试代码” |
| 建议 | `pr-silent-failure-hunter.md:29` | “系统性地定位” | “系统地定位” |
| 建议 | `pr-silent-failure-hunter.md:32,36` | “error callback 和 error event handler”“optional chaining 或 null coalescing” | “错误回调和错误事件处理器”“可选链或空值合并” |
| 建议 | `pr-silent-failure-hunter.md:35` | “所有错误被记录但执行继续的位置” | “所有记录错误后仍继续执行的位置” |
| 建议 | `pr-silent-failure-hunter.md:46,51` | “6 个月后的人”“具体有用” | “六个月后的维护者”“具体、实用” |
| 建议 | `pr-silent-failure-hunter.md:56` | “抑制无关错误” | “吞掉无关错误” |
| 建议 | `pr-silent-failure-hunter.md:62` | “feature spec” | “功能规格” |
| 建议 | `pr-silent-failure-hunter.md:68-69` | “更高级别的 handler”“向上冒泡” | “更上层的处理器”“向上传播” |
| 建议 | `pr-silent-failure-hunter.md:78` | “optional chaining（`?.`）” | “可选链（`?.`）” |
| 建议 | `pr-silent-failure-hunter.md:103` | “差劲的错误信息” | “质量不佳的错误信息” |

### 5. `ly-pi/assets/agents/pr-test-analyzer.md`

| 严重度 | 位置 | 现文 | 推荐最小改法 |
|---|---|---|---|
| **Blocker** | `pr-test-analyzer.md:51,57-59,64-66,74` | 中文聚合标题和中文严重度标签 | 恢复 `## Tag Summary for Aggregator` 与三个英文严重度标签。 |
| 重要 | `pr-test-analyzer.md:19,40` | “edge case” | “边界情况” |
| 重要 | `pr-test-analyzer.md:22` | “边界条件缺少 edge case 覆盖” | “边界情况覆盖不足” |
| 建议 | `pr-test-analyzer.md:15` | “测试及其覆盖的生产代码” | “测试及其对应的生产代码” |
| 建议 | `pr-test-analyzer.md:19` | “识别必须测试以防止回归的……” | “识别为防止回归而必须测试的……” |
| 建议 | `pr-test-analyzer.md:24` | “负面测试用例” | “负向测试用例” |
| 重要 | `pr-test-analyzer.md:29` | “对合理的重构具有弹性” | “不会因合理重构而轻易失效” |
| 建议 | `pr-test-analyzer.md:32-33` | “其能捕获的失败”“按 1-10 评级严重程度” | “该测试能够捕获的具体失败示例”“按 1–10 分评定严重程度” |
| 建议 | `pr-test-analyzer.md:39,41` | “用户可见错误”“为完整性考虑的可选覆盖” | “用户可感知的错误”“为提高完整性而补充的可选覆盖” |
| 建议 | `pr-test-analyzer.md:46` | “在有用处” | “必要时” |
| 重要 | `pr-test-analyzer.md:82` | “注意测试是否在测试实现而非行为。” | “注意测试针对的是实现细节还是行为。” |

### 6. `ly-pi/assets/agents/pr-type-design-analyzer.md`

| 严重度 | 位置 | 现文 | 推荐最小改法 |
|---|---|---|---|
| **Blocker** | `pr-type-design-analyzer.md:60,66-68,73-75,83` | 中文聚合标题和中文严重度标签 | 恢复 `## Tag Summary for Aggregator` 与三个英文严重度标签。 |
| 重要 | `pr-type-design-analyzer.md:3,11,19,25,34,38-40,43-44,48-49,73-74,93,99,103` | 多处使用“不变量”，仅第 11 行括注 `invariant` | 按既定术语全程改用 `invariant`，如“invariant 表达”“invariant 的强度”“识别 invariant”。 |
| 重要 | `pr-type-design-analyzer.md:11` | “具有强大、清晰表达且良好封装的不变量” | “确保其 invariant 强健、表达清晰且封装良好” |
| 建议 | `pr-type-design-analyzer.md:19` | “抗 bug 软件系统” | “不易出现 bug 的软件系统” |
| 建议 | `pr-type-design-analyzer.md:41` | “通过其设计实现自文档化” | “类型设计本身是否具有自说明性” |
| 建议 | `pr-type-design-analyzer.md:46` | “使代码更容易推理” | “让开发者更容易推理代码行为” |
| 重要 | `pr-type-design-analyzer.md:50-51` | “所有变更点是否都有守卫”“是否不可能创建无效实例” | “所有修改入口是否都有保护措施”“是否能确保无法创建无效实例” |
| 建议 | `pr-type-design-analyzer.md:55` | “在有用处包含完整的……” | “必要时提供完整的……” |
| 建议 | `pr-type-design-analyzer.md:66,68` | “允许无效构造”“设计润色” | “允许构造无效实例”“设计可小幅改进” |
| 建议 | `pr-type-design-analyzer.md:89` | “表达性” | “表达力” |
| 重要 | `pr-type-design-analyzer.md:91` | “完美是好的敌人” | “不要让追求完美妨碍务实改进” |
| 建议 | `pr-type-design-analyzer.md:93` | “构造函数验证对于维护……” | “构造函数验证对维护……至关重要” |
| 重要 | `pr-type-design-analyzer.md:102` | “变更方法间不一致的执行” | “各变更方法对 invariant 的执行不一致” |

### 7. 参考文件与残余风险

- **Correct**：`ly-pi/assets/skills/review-pr/SKILL.md:189` 明确要求英文聚合标题及 `[CRITICAL]`、`[IMPORTANT]`、`[SUGGESTION]`，因此上述 5 个 reviewer agent 的中文协议标记会导致结果无法被提取。
- **Note**：任务指定的 `plan.md`、`progress.md` 均不存在，无法核对其中可能记录的其他文案决策。
- **Note**：工作区已有 staged 变更及未跟踪目录；本次没有产生或更改这些内容。
- **Correct**：`bun run check-docs` 全部通过。