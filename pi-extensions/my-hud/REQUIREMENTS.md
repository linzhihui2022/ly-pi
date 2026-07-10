# my-hud 需求文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-06-02
> 最近整理：2026-07-10
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

提供本地 Pi HUD 扩展，通过 aboveEditor、footer、working 三层信息架构展示会话状态、当前上下文锚点和轻量处理反馈。

## 功能需求

### aboveEditor：运行状态仪表盘

1. 显示当前项目名、模型、Git 分支、上下文使用率、累计 input/output tokens、cache read tokens、成本。
2. 模型名优先显示短名；无短名时显示原始模型 ID。
3. 项目名超过 10 字符时截断为前 8 字符加 `..`。
4. Git 分支为空时隐藏整个分支字段。
5. Git 分支存在关联 GitHub PR 时，在分支名后显示 PR 编号（如 `main#42`），并在终端支持时使用 OSC 8 超链接。
6. Git 变更状态显示在分支字段旁，包含 staged、unstaged、untracked、stashed、conflicted、ahead、behind。
7. 显示 cache hit rate。
8. 终端宽度不足时优先保留模型、上下文使用率、input/output tokens，其余字段允许尾部截断。
9. 上下文使用率按窗口大小使用不同颜色阈值。

### footer：上下文锚点

1. 显示最后一条非空用户消息的纯文本摘要。
2. 使用终端图标 `` 作为前缀，颜色为 `dim`。
3. 没有用户消息时返回空内容，不占用 footer 行。
4. 支持字符串和数组形式的消息内容。
5. 数组内容中的非 text 部分替换为 `[MEDIA]`。
6. 文本按终端宽度截断。

### working：情绪反馈

1. 每次 `turn_start` 随机选择一条中文趣味消息。
2. 通过 `ctx.ui.setWorkingMessage()` 设置。
3. 优先使用主题色 `accent`。
4. 消息不承载技术状态信息。

### Slash 命令

1. `/open-pr` 打开当前分支关联的 GitHub PR 页面。
2. 当前分支没有关联 PR 时显示通知。
3. 无法打开浏览器时，在通知中显示 PR URL。
4. `/mem` 显示当前系统内存使用率，并根据压力状态选择通知级别。

### 内存提示

1. agent 启动和结束时检查系统内存压力。
2. 存在高内存压力时，在 aboveEditor 区域显示提示。
3. 高内存压力下若同时存在残留 Vitest 进程，在提示中列出进程信息。
4. 状态恢复正常时移除提示。

## 待实现需求

1. 配置化模型短名映射：
   - 配置文件：`my-hud.json`（与扩展目录同级）。
   - 格式：`{ "modelShortNames": { "kimi-k2-thinking": "k-tkg" } }`。
   - 无映射时回退原始模型 ID。
   - 支持 `/reload` 后重新读取。

## 非功能需求

1. 扩展遵循 TDD 流程。
2. 修改业务逻辑时必须先补充或更新测试。
3. 覆盖率要求：branches/functions/lines/statements 全部 100%。
4. 纯函数模块优先使用单元测试覆盖。
5. 构建命令：`bunx turbo run build`。
6. 测试命令：`bunx turbo run test` 或在扩展目录执行 `vitest run`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 在 aboveEditor 显示当前调用的工具名称 | 动态执行状态，与 aboveEditor 的静态身份卡定位冲突 |
| 在 footer 显示统计数字 | footer 只承担上下文锚点职责 |
| 在 working 消息中显示技术状态 | working 只承担轻量情绪反馈职责 |
| 显示当前时间或已运行时间 | 时钟功能与当前会话状态关系弱 |
| 显示网络连接状态或延迟 | 系统监控，不属于 Pi agent 上下文 |

## 验收标准

1. aboveEditor 在不同宽度下保持核心字段可见且无错位。
2. footer 能正确提取最后一条非空用户消息。
3. working 消息在每个用户回合开始时更新。
4. PR 编号、Git 状态、内存提示和 `/open-pr` 的失败路径都有测试覆盖。
5. 单元测试和覆盖率检查通过。
