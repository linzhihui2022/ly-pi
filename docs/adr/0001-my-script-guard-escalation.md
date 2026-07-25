# my-script-guard：硬拦截内联脚本，三次后升级为人工确认

pi agent 倾向于在 bash 工具里用 `python3 -c "<长脚本>"` 或 heredoc 完成本可由专用工具完成的任务（Script Misuse）。我们决定新建 `my-script-guard` 扩展在 `tool_call` 钩子中硬拦截一切解释器（python/node/ruby/perl/php）的 Inline Script：`-c`/`-e` 代码串超过 80 字符或含换行即拦，heredoc 一律拦。

**刻意不提供配置开关。** 唯一的出口是 Urgent Escalation：同一会话被拦满 3 次后，第 4 次起弹确认框（附脚本预览）由用户当场放行或拒绝。

## Considered Options

- **配置开关（enabled/阈值可调）**：被拒绝。开关会被 agent 以「用户急需」为由引导用户关掉，削弱规则的绝对性；仓库其他扩展虽有配置文件惯例，此处刻意破例。
- **纯硬拦截、无任何出口**：被拒绝。确实存在需要一次性较长脚本的合理场景（如批量数据转换），完全没有出口会逼用户改代码。
- **只做提示词约束（改 AGENTS.md）**：被拒绝。已观察到模型不总是遵守纯文本指引；提示词与硬拦截双管齐下，提示词负责「为什么」，拦截负责「不得不」。
