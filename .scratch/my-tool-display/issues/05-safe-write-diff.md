# 05 — 呈现安全的 write 统一 diff

**What to build:** Pi 用户完成 `write` 后，可审阅新建和覆盖文件的统一 diff；当原内容或结果不能安全呈现时，看到清楚的安全摘要而不是乱码、无界内容或崩溃。工具本身的写入语义不因显示功能改变。

**Blocked by:** 04 — 呈现完成后的 edit 统一 diff

**Status:** resolved

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [x] 成功 `write` 新建和覆盖 UTF-8 文本文件后展示正确的统一 diff，并沿用已验证的折叠与主题行为
- [x] 呈现所需的既有内容仅在当前工作区内、受限且安全地获取；不得因显示读取工作区外路径
- [x] 二进制、过大、不可读取、缺少必要 diff 数据或其他不安全场景显示包含原因的安全摘要
- [x] 安全摘要不会改变写入执行结果，失败写入仍显示 Pi 可用的失败诊断
- [x] 自动化测试覆盖新建、覆盖、空内容、二进制、超过安全预算、不可读取和缺失数据路径，且 `bun run verify` 通过

## Answer

- `my-tool-display` 现在仅在 `write` 仍由 Pi 内置实现拥有时注册覆盖；调用头只显示目标路径，`renderShell` 使用 Pi 标准 shell，执行继续委托 Pi 原生 `write` definition，并使用实际 `ctx.cwd`。
- 成功执行后，模块在当前工作区内安全读取既有 UTF-8 文件，调用 Pi 的 `generateDiffString` 构造统一 diff，并复用 edit 的主题、折叠/展开和窄宽度呈现行为。新建文件以空内容作为 diff 基线；空 diff 显示明确摘要。
- 展示读取受工作区边界、符号链接解析、常规文件类型、1 MB 文件/新内容/生成 diff 预算、NUL/无效 UTF-8 和读取错误约束。二进制、过大、不可读、工作区外路径或缺少 diff 数据只显示包含原因的安全摘要，不阻止原生写入。
- 写入失败优先显示 Pi 返回的失败诊断，不渲染成功 diff；不提供执行期间的 write preview、split diff 或词级高亮。
- 验证：`bun run verify`、`bun run --cwd ly-pi build` 和 `git diff --check` 通过；未执行部署或 `/reload`。
