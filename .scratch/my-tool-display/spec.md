# my-tool-display — 自有原生工具紧凑呈现

Status: ready-for-agent

## Problem Statement

当前 Pi 会话依赖第三方 `pi-tool-display` 来压缩工具调用、展示编辑 diff 和控制冗长输出。该扩展同时覆盖 MCP、动态工具、聊天消息样式、设置弹窗、适配器 API 与流式预览，远超本仓库实际需要的范围；维护者无法只为七个 Pi 原生工具独立掌控行为，也需要承担第三方 Pi 版本兼容滞后的风险。

Pi 用户需要一份由 ly-pi 自己维护的、紧凑且可预测的工具呈现：成功调用不淹没会话，诊断性错误保持明确且可展开，文件修改有清晰的统一 diff，而工具的实际执行语义、参数和模型上下文保持 Pi 原生行为。

## Solution

在统一 ly-pi 扩展中增加独立的 `my-tool-display` 模块。它只为当前 Pi 0.84.x 交互式 TUI 中的七个原生工具注册呈现覆盖：`read`、`grep`、`find`、`ls`、`bash`、`edit` 和 `write`。

模块默认隐藏成功的读与搜索正文，折叠 bash 输出，并在 edit/write 完成后展示主题化、宽度安全的统一 diff。用户展开工具行后仍可查看 Pi 实际返回的完整输出；任意失败结果始终保留明确错误状态，Bash 失败输出也受其折叠规则约束，其他工具失败时仍保留可用输出。配置只保留启用开关、bash 折叠行数和 diff 折叠行数，修改后通过 `/reload` 生效。

完成验证后，仓库停止部署第三方 pi-tool-display 的配置，并文档化由用户手动卸载该 npm 包的步骤。

## User Stories

1. As a Pi 用户, I want 所有七个原生工具都显示紧凑且一致的调用标题, so that 我能快速识别 agent 正在执行什么而不被参数和原始输出淹没。
2. As a Pi 用户, I want 成功的 `read` 调用默认隐藏文件正文, so that 大文件读取不会占据会话空间。
3. As a Pi 用户, I want 展开已隐藏的 `read` 工具行时看到 Pi 实际返回的完整输出, so that 我仍能在需要时检查读取内容。
4. As a Pi 用户, I want 成功的 `grep`、`find` 和 `ls` 调用默认隐藏正文, so that 搜索与目录列表不会让工具历史难以浏览。
5. As a Pi 用户, I want 展开已隐藏的搜索或目录工具行时看到完整原始输出, so that 我能追溯匹配和目录内容。
6. As a Pi 用户, I want `bash` 调用显示命令和执行状态, so that 我无需展开输出也能判断执行意图和是否成功。
7. As a Pi 用户, I want 成功的 `bash` 输出默认最多显示 10 行, so that 常见命令保持可读而长日志不会挤占会话。
8. As a Pi 用户, I want 通过配置调整 bash 的折叠行数, so that 我能在紧凑性和即时可见信息之间取舍。
9. As a Pi 用户, I want 展开折叠的 `bash` 工具行后看到完整原始输出, so that 我能诊断命令结果而不必重新执行。
10. As a Pi 用户, I want 任意原生工具失败时直接看到明确错误状态，并能在 Bash 折叠后展开完整 stdout/stderr, so that 紧凑呈现不会妨碍诊断。
11. As a Pi 用户, I want `edit` 完成后看到主题化的统一 diff, so that 我能立刻审阅实际文字修改。
12. As a Pi 用户, I want `write` 完成后看到新建或覆盖内容的统一 diff, so that 我能确认文件最终变化而不是只看到一条成功消息。
13. As a Pi 用户, I want 初始 diff 按配置折叠且可展开, so that 小改动立即可读、长改动仍能完整审阅。
14. As a Pi 用户, I want 通过配置调整 diff 的折叠行数, so that 终端与个人阅读偏好不会被固定阈值限制。
15. As a Pi 用户, I want 统一 diff 在窄终端中不溢出可用宽度, so that 工具历史在不同终端尺寸下仍然可读。
16. As a Pi 用户, I want 二进制、过大或无法安全构造 diff 的文件显示明确安全摘要, so that TUI 不会因不可读或超大内容变得缓慢、乱码或崩坏。
17. As a Pi 用户, I want 在配置中禁用该模块后回到 Pi 的原生工具呈现, so that 我可以安全地停用自定义显示而不影响工具能力。
18. As a Pi 用户, I want 配置缺失、损坏或字段无效时获得稳定默认呈现, so that 一份错误配置不会破坏 Pi 会话。
19. As a Pi 用户, I want `/reload` 后呈现覆盖恰好注册一次, so that 重载不会产生重复 renderer、重复提示或逐次变差的显示。
20. As a Pi 用户, I want 当其他扩展已拥有某个原生工具时不被本模块静默抢占, so that 多扩展环境不会因 renderer 所有权冲突而改变工具行为。
21. As a Pi 用户, I want 非交互模式不因纯 TUI 呈现逻辑失败, so that 同一配置在非 TUI 调用时保持安全降级。
22. As a ly-pi 维护者, I want 工具执行继续委托 Pi 的原生实现, so that 工具参数、提示元数据、取消、截断和文件修改语义不会因显示功能改变。
23. As a ly-pi 维护者, I want 所有呈现规则集中在一个独立模块, so that 将来调整七个原生工具的显示时有清晰的所有权和验证位置。
24. As a ly-pi 维护者, I want 不再部署或维护旧扩展的配置、设置页和兼容 API, so that 自有实现保持与实际需求相称的规模。
25. As a ly-pi 维护者, I want 在新模块经验证后获得明确的手动卸载指引, so that 第三方包的移除可审计且不会由部署脚本隐式改变用户级安装状态。

## Implementation Decisions

- **模块与 seam**：`my-tool-display` 是独立的深模块，对统一入口只提供“注册原生工具呈现覆盖”的单一 interface。配置加载、原生工具元数据保留、结果归一化、统一 diff、所有权发现和 reload 清理都隐藏在该模块内部；调用者不需要理解各工具的呈现差异。
- **原生执行 adapter**：每个覆盖保留 Pi 原生工具的描述、参数 schema、提示元数据、参数兼容处理和执行委托。该模块不得重写工具业务逻辑、文件变更语义、输出截断语义或取消语义。
- **工具范围**：只覆盖 `read`、`grep`、`find`、`ls`、`bash`、`edit` 与 `write`。模块不注册、拦截或装饰 MCP、第三方扩展工具或自定义工具。
- **成功呈现契约**：read、grep、find、ls 在未展开时只显示紧凑调用信息；展开时显示原生结果文本。bash 在未展开时显示命令、状态和最多 `bashCollapsedLines` 行输出；展开时显示原生结果文本。原生结果已有的截断仍然有效，模块不承诺恢复 Pi 没有返回的内容。
- **失败呈现契约**：Bash 失败时保留 `Bash command failed.` 状态，未展开时显示最后 `bashCollapsedLines` 行可用输出；若有更早行则明确提示，展开后显示 Pi 返回的完整原始输出。其他工具的错误结果不使用成功路径的隐藏或折叠策略，仍显示错误状态及 Pi 返回的可用文本；缺少文本时显示明确的失败说明。
- **文件修改契约**：edit 和 write 只在工具结果完成后呈现 diff，不做参数流式期间的 pending preview。diff 始终是统一视图，使用当前主题的增删与上下文颜色，并按 `diffCollapsedLines` 折叠。模块不实现分栏 diff、行内词级高亮或专用 diff 设置。
- **安全降级**：构造 write diff 前仅在当前工作区内读取受限的 UTF-8 既有内容。二进制内容、超过内部安全预算的内容、不可读取内容和缺少必要 diff 数据必须降级为包含文件、状态、大小或原因的安全摘要；不得为了呈现而读取工作区外路径或渲染无界内容。
- **配置 contract**：配置只有 `enabled`、`bashCollapsedLines` 与 `diffCollapsedLines` 三个字段，默认值依次为 true、10 与 24。缺失、格式错误或无效值使用安全默认值；禁用时不取得工具 renderer 所有权。配置仅在加载或 `/reload` 后生效，不提供斜杠命令、弹窗、预设或运行时写回。
- **所有权与生命周期**：模块在注册覆盖前确认目标仍由 Pi 内置工具拥有；发现外部所有者时保留其 renderer。重载或会话替换时必须撤销自身注册的呈现相关状态，确保下一次启动不会双重注册。
- **与 `/diff` 的关系**：`my-diff` 保持其现有的人机交互式工作区浏览职责。`my-tool-display` 不把 `/diff` 改造成工具 renderer，也不为了一个简单的共享需求引入额外公开 interface；只有后续出现稳定的双调用者需求时才评估共享抽取。
- **迁移**：自有模块成为唯一的工具显示实现。旧第三方配置、部署复制项和说明文档在验证后移除；不提供 `pi-tool-display` 的 adapter API、配置兼容层或双轨 renderer。用户级 npm 包由文档指引手动卸载，不由部署脚本自动移除。
- **运行边界**：本期以当前 Pi 0.84.x 的交互式 TUI 为支持目标。非 TUI 模式只能安全降级；旧版 Pi 兼容层不在本期实现。

## Testing Decisions

- **好测试标准**：测试通过模块公开的工具覆盖行为观察用户可见结果，而不是断言内部缓存、私有状态或具体 helper 调用。每个测试应从工具参数、Pi 原生结果、配置和主题输入出发，断言可渲染的调用头、结果文本、折叠状态和安全摘要。
- **核心呈现 seam**：覆盖七个原生工具的调用与结果呈现，验证成功隐藏、Bash 成功输出的头部行数限制、Bash 失败输出的尾部行数限制、展开后原始输出、错误状态、统一 diff、折叠提示和可用宽度限制。
- **文件修改边界**：验证 edit 的原生 diff 呈现，以及 write 的新建、覆盖、空内容、二进制、过大、不可读取和缺少 diff 数据的安全降级。测试不得依赖真实工作区修改；文件读取在可替换的本地 adapter 或临时 fixture 下验证。
- **配置 seam**：验证完整配置、缺失配置、损坏 JSON、缺失字段、非法值、禁用模块和默认值回退，确保错误配置不会阻止 Pi 启动。
- **生命周期与所有权 seam**：验证外部工具所有者不被覆盖、重复初始化或 reload 不会重复注册、清理后重新注册只留下一个本模块 renderer。
- **统一入口集成**：沿用 ly-pi 对独立 `my-*` 模块的 mock 集成测试，确认统一扩展会注册 `my-tool-display`。
- **Prior art**：配置解析测试沿用现有 HUD 配置的临时目录与默认值模式；纯 diff 行分类与二进制/超长输出护栏沿用现有 `/diff` 的行为导向测试风格；统一入口测试沿用现有模块 mock 模式。
- **TDD 与验收**：实现按红绿循环推进。完成后必须运行 `bun run verify`；再运行正常部署流程与 `/reload`，并在真实 TUI 中手动验证成功折叠、展开、错误可见、统一 diff、窄宽度和安全降级。

## Out of Scope

- MCP、MCP proxy、动态工具、第三方扩展工具和自定义工具的呈现或拦截
- 对外的 adapter API、旧 `pi-tool-display` import 兼容和旧配置字段兼容
- 工具参数仍在流式生成时的 pending edit/write preview
- split diff、词级 diff 高亮、语法高亮、hashline gutter、RTK 提示或复杂 ANSI 背景处理
- thinking 标签、用户消息框、Markdown 消息 patch、聊天标题或其他非工具消息样式
- `/tool-display` 命令、交互式设置弹窗、预设、动态配置写回或热切换
- 对旧版 Pi 的版本探测、兼容层或测试矩阵
- 自动执行 `pi uninstall`、自动删除用户级 npm 缓存或长期双轨 renderer
- 修改 `my-diff` 的交互式工作区浏览功能
- 修改任何原生工具的执行、权限、提示或模型上下文语义

## Further Notes

- 风险级别为 Medium：该功能改变用户可见 TUI 行为并跨越统一入口、配置部署、文档和工具 renderer 集成；本规格记录了用户确认的范围与验收基线。实施前应将对应 ticket 的实施批准按项目交付护栏记录。
- 预期配置默认值与当前个人使用习惯一致：成功 read/search 隐藏、bash 折叠 10 行、diff 折叠 24 行。
- 第三方包的人工清理仅在自有模块通过完整验证并经 TUI 手动检查后进行。推荐文档命令为 `pi uninstall npm:pi-tool-display`。
