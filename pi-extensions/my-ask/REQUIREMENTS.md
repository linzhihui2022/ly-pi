# my-ask 需求文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-06-12
> 最近整理：2026-07-10
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

构建本地 Pi 扩展 `pi-extensions/my-ask`，注册 `ask_user_question` 工具，作为 `@juicesharp/rpiv-ask-user-question` 的 drop-in replacement。

## 功能需求

### 工具接口

1. 工具名必须是 `ask_user_question`。
2. 参数 schema 保持原始形状：
   - `questions[]`：1-4 项。
   - 每个 question 包含 `question`、`header`、`options`，可选 `multiSelect`。
   - `header` 最多 16 字符。
   - `options` 为 2-4 项。
   - 每个 option 包含 `label`、`description`，可选 `preview`。
   - `label` 最多 60 字符。
3. 注册 `promptSnippet` 和 `promptGuidelines`，让 LLM 能在可用工具列表中识别该工具。

### 运行时校验

1. 非交互模式下通过 `ctx.hasUI` 失败保护，返回 `no_ui`。
2. 无问题时返回 `no_questions`。
3. 问题超过 4 个时返回 `too_many_questions`。
4. 选项少于 2 个时返回 `empty_options`。
5. 重复问题文本返回 `duplicate_question`。
6. 同一问题内重复选项标签返回 `duplicate_option_label`。
7. 保留标签返回 `reserved_label`。
8. 以下标签必须被视为保留标签：
   - `Other`
   - `Type something.`
   - `Chat about this`
   - `Next`

### UI 行为

1. 问题文本过长时换行显示，不使用省略号截断。
2. 单选问题使用 option list。
3. 没有 preview 的问题自动添加 `Type something.` 行。
4. 选择 `Type something.` 后打开 inline editor。
5. 自定义输入会添加为 `<value> (custom)` 新行，不自动提交。
6. 自定义行行为与普通选项一致：
   - 单选中按 Enter 选择并提交。
   - 多选中按 Space 切换。
   - 聚焦时按 Delete/Backspace 删除。
7. 单选中添加自定义值后，用户必须在该行或其他选项上按 Enter 才完成答案。
8. 多选支持 Space 切换、Enter 提交。
9. 多选中按 `a` 选择所有当前行，再按一次清空所有选择。
10. 多选中 `Type something.` 添加的自定义值应以已勾选行 `[x] <value> (custom)` 显示。
11. 单选 preview 显示在聚焦选项下方，高度受限且无过度空白。
12. 每个问题都提供 `Chat about this` 逃逸行。
13. 多问题场景提供 tab bar，支持 `←`、`→`、Tab 导航和 Submit tab。
14. Esc 取消整个问卷；在自定义输入模式中 Esc 返回选项列表。

### 返回结果

1. 返回 envelope 需要兼容原扩展。
2. `details.answers[]` 中包含：
   - `questionIndex`
   - `question`
   - `kind`
   - `answer`
   - 可选 `selected`
   - 可选 `preview`
3. `details.cancelled` 表示是否取消。
4. `details.error` 表示可选错误信息。
5. `content[0].text` 为人类可读摘要。

## 非功能需求

1. 扩展遵循 TDD 流程。
2. `validate.ts`、`format.ts`、`questionnaire.ts` 覆盖率达到 100%。
3. 构建命令：`bunx turbo run build`。
4. 部署命令：`bun run deploy`，目标目录为 `~/.pi/agent/extensions/my-ask`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 依赖 `@juicesharp/rpiv-*` | 目标是本地替代实现 |
| i18n | 超出当前范围 |
| 外部事件通知 | 超出当前范围 |
| 可配置 guidance | 超出当前范围 |
| side-by-side preview panes | 当前 UI 保持简单上下布局 |
| per-option notes | 原扩展有该能力，本地简化版明确省略 |
| 自动替换或卸载原扩展 | 由用户按 `SPEC.md` 手动处理 |
| 自定义 `renderCall`/`renderResult` | 使用 Pi 默认渲染 |

## 验收标准

1. `ask_user_question` schema 与原工具兼容。
2. 所有校验错误都返回稳定错误码。
3. 单选、多选、自定义输入、preview、多问题导航、取消路径行为符合规格。
4. 返回结构能被旧提示词按原 envelope 读取。
5. 单元测试和覆盖率检查通过。
