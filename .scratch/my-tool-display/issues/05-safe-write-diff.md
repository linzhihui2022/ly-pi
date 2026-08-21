# 05 — 呈现安全的 write 统一 diff

**What to build:** Pi 用户完成 `write` 后，可审阅新建和覆盖文件的统一 diff；当原内容或结果不能安全呈现时，看到清楚的安全摘要而不是乱码、无界内容或崩溃。工具本身的写入语义不因显示功能改变。

**Blocked by:** 04 — 呈现完成后的 edit 统一 diff

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [ ] 成功 `write` 新建和覆盖 UTF-8 文本文件后展示正确的统一 diff，并沿用已验证的折叠与主题行为
- [ ] 呈现所需的既有内容仅在当前工作区内、受限且安全地获取；不得因显示读取工作区外路径
- [ ] 二进制、过大、不可读取、缺少必要 diff 数据或其他不安全场景显示包含原因的安全摘要
- [ ] 安全摘要不会改变写入执行结果，失败写入仍显示 Pi 可用的失败诊断
- [ ] 自动化测试覆盖新建、覆盖、空内容、二进制、超过安全预算、不可读取和缺失数据路径，且 `bun run verify` 通过
