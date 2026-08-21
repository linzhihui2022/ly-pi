# 显式固定 my-script-guard 先于 my-permission 加载

pi 的 `tool_call` 事件按扩展加载顺序依次调用 handler，第一个返回 block 的短路后续 handler。自动发现（`~/.pi/agent/extensions/*`）的顺序来自 `readdirSync`，无排序保证。这导致 my-permission 的 `security-judge` Role（每次调用最坏 8s 超时）会审查注定被 my-script-guard 确定性拦截的内联脚本，白白消耗模型调用。

pi 的资源解析优先级为：settings 显式 `extensions` 数组（local）先于目录自动发现（auto），且数组内声明顺序在稳定排序后保留。因此在 `settings/settings.json` 中显式声明 `["extensions/my-script-guard", "extensions/my-permission"]`，把确定性规则固定在模型法官之前。其余扩展无需排序，保持自动发现。

## Consequences

- 被 my-script-guard 拦截的命令不再触发法官调用；agent 收到的 block reason 稳定为 script-guard 的引导文案。
- 新增需要排序的扩展时，必须加入该数组而不是依赖目录名。
