# 确定性 guard 先于模型法官生效

pi 的 `tool_call` 事件按扩展注册顺序依次调用 handler，第一个返回 block 的短路后续 handler。若模型法官排在确定性 guard 之前，它会审查注定被 guard 拦截的命令，白付一次模型调用（每次最坏 8s 超时）。

因此 `ly-pi/index.ts` 中 guard harness 必须先于 `myPermission(pi)` 注册：

```ts
createGuardHarness(pi, [cdGuard, scriptGuard]);
// …
await myPermission(pi);
```

## Consequences

- 被 my-script-guard 拦截的命令不再触发法官调用；agent 收到的 block reason 稳定为 script-guard 的引导文案。
- 新增需要先于法官生效的扩展时，排进这段注册顺序的前面，而不是依赖模块名或目录名。
