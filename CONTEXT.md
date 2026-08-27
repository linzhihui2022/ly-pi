# Pi Agent 配置仓库

本仓库管理 pi coding agent 的扩展、技能、主题与全局行为准则。本文件是该上下文的术语表。

## Language

**Session Display Name（会话显示名）**:
给人识别 pi 会话的可读标签，与技术身份标识 `sessionId` 不同。
_Avoid_: session name、session title（在没有明确指向显示名时）

**Automatic Session Naming（自动会话命名）**:
为尚未被用户命名的主交互会话生成 Session Display Name 的行为；它不改变会话的技术身份。
_Avoid_: 自动修改 sessionId、持续改名

**Fork Session Display Name（分支会话显示名）**:
从父会话的 Session Display Name 派生、并带有子会话短标识的名称；用于区分同一任务的用户可见分支。
_Avoid_: 分支 sessionId、自动覆盖人工名称

**Inline Script（内联脚本）**:
通过 bash 工具以 `-c`/`-e` 参数或 heredoc 形式直接传给解释器（python/node/ruby/perl/php 等）执行的脚本代码。与之相对的正常形态是解释器执行磁盘上的脚本文件（`python3 script.py`）。
_Avoid_: inline code、one-liner、脚本字符串

**File Write Bypass（写文件旁路）**:
通过 bash 的 heredoc 或输出重定向（`cat <<EOF > file`、`tee file`、`echo/printf ... > file` 等）把字面内容直接写入文件，绕过 write/edit 专用工具的行为。判定要点是内容「落盘」——heredoc 作为管道数据输入（如 `cat <<EOF | jq .`、`git commit -F - <<EOF`）不算。
_Avoid_: 模拟 write、cat 写文件

**Script Misuse（脚本滥用）**:
用 Inline Script 或 File Write Bypass 完成本可由 read/write/edit/grep 等专用工具或简单 shell 命令完成的任务。遏止对象是滥用本身，而非「内联」这种书写形式。
_Avoid_: 滥用 Python、滥用 bash

**Urgent Escalation（急迫升级）**:
同一会话内 Inline Script 被累计拦截达到阈值（3 次）后，拦截策略从硬 block 转为弹确认框由用户当场裁决的机制。是硬规则唯一的人性化出口，刻意不提供配置开关。
_Avoid_: 逃生门、白名单、重试放宽

**Redundant cd（冗余 cd）**:
bash 命令以 `cd <目标> &&` 或 `cd <目标> ;` 开头、且目标归一化后等于会话工作目录的冗余前缀写法。归一化覆盖引号包裹、末尾斜杠、`.`/`./` 与 realpath 符号链接。命令中间出现的 cd 不在此列。
_Avoid_: 多余 cd、无效切换

**Judge（法官）**:
my-permission 在放行高风险工具调用前咨询的独立 LLM 判定者。针对一次工具调用给出安全/不安全判定、1–10 风险分数、用途推断与理由。判定失败（超时、格式错误）一律视为不安全，交用户手动确认。
_Avoid_: 评审模型、审核、裁判

**Judge Log（法官判断日志）**:
当前会话内每次 Judge 判定的记录集合，每条含被判定工具、命令内容、判定结果、风险分数、用途与理由。通过 `/judge-log` 以 HTML 表格页面查看，最新判定在前，可按安全/不安全过滤。
_Avoid_: 审判日志、判断历史、判定记录

**False Positive / 假阳性**:
法官将安全操作误判为不安全（`safe: false`），但用户随后手动批准的情况。由 Advocate 事后审查并修正。
_Avoid_: 误拦、误报、false alarm

**False Negative / 假阴性**:
危险操作被判安全（`safe: true`）后静默放行的情况。由 Prosecutor 事后审计全部放行记录，用更强模型二次审查发现。
_Avoid_: 漏网、miss

**Advocate（辩护人）**:
事后审查假阳性案例的角色。读取法官日志中法官判 unsafe 但用户手动批准的记录，输出 allow 规则建议和 JUDGE.md 优化建议。通过 `/permission-advocate` 手动触发。不改变实时判断流程。
_Avoid_: 教授、professor、分析器

**Prosecutor（检察官）**:
事后审计假阴性的角色。读取法官日志中全部被判 safe 的放行记录，用更强模型二次审查，找出漏网的危险操作，输出 deny/检测规则建议和 JUDGE.md 优化建议。通过 `/permission-prosecutor` 手动触发。
_Avoid_: 反向审查、auditor

**Chief Judge / 审判长**:
事后审计 JUDGE.md 规则本体质量的角色。不依赖会话日志，直接审视规则间的矛盾、过宽、冗余、遗漏，输出 add / remove / modify / merge 四种建议。通过 `permission_chief` 工具手动触发。
_Avoid_: presiding judge、规则校验器

**JUDGE.md**:
项目根目录的法官规则扩展文件。包含 Advocate 和 Prosecutor 输出的规则建议（一行一条），在法官判定时注入 prompt 末尾作为项目级指导。写入前自动去重，随时间累积。
_Avoid_: 项目规则、local rule

**Intent Chain Analysis（意图链分析）**:
安全判定的方法论：不按工具名称分类（只读=安全、破坏性=不安全），而是追踪工具调用的完整语义链——数据最终落点、侧效果是否超出项目边界、是否通过间接方式执行代码。用于对抗管道注入、heredoc 写入、外部依赖等攻击模式。
_Avoid_: 语义分析、上下文判断

**Multi-worktree Repository（多 worktree 仓库）**:
拥有两个或更多已注册 Git worktree 的仓库；主 worktree 也是该集合的成员。
_Avoid_: 多分支仓库、多个 clone

**Current Worktree（当前 worktree）**:
包含 Pi 会话当前工作目录的最深层 Git worktree；嵌套时选择路径最具体的成员，worktree 集合变化后按最新发现重新确定。它是 worktree 集合中唯一需要在界面上呈现的成员。
_Avoid_: 主 worktree、活跃分支

**Closable Worktree（可关闭 worktree）**:
当前 Pi 会话所在、未锁定、没有 Git 进行中操作、没有已跟踪或未忽略的未跟踪变更，且不含已初始化 submodule 的附属 Git worktree；它可被移除，但其本地分支保留。被 Git 忽略的文件不影响资格，且会随移除消失；主 worktree 与非当前 worktree 不属于此概念。
_Avoid_: 可删分支、空工作树

**Worktree Closure（worktree 关闭）**:
针对 Closable Worktree 的确认式终结操作；Pi 优雅退出后再次验证并移除 worktree，且仅在移除成功时调用 Worktree Close Hook。移除失败时保留终端并显示诊断。
_Avoid_: 强制删除、关闭分支、直接 kill Pi

**Worktree Close Hook（worktree 关闭 Hook）**:
由 `PI_W_CLOSE` 和 `PI_W_CLOSE_TARGET` 组成的用户环境契约；前者指定终端关闭命令前缀，后者指定其目标标识。它仅在 Worktree Closure 成功移除 worktree 后调用。
_Avoid_: 硬编码 WezTerm、默认终端命令

**Visible Worktree（可见 worktree）**:
可由 Pi 访问、路径存在且非 prunable 的已注册 Git worktree；它参与判断 Multi-worktree Repository 的界面资格，但不一定被 Worktree Widget 展示。detached HEAD 以短 commit SHA 作为标识。
_Avoid_: 已注册 worktree、有效分支

**Worktree Manager（worktree 管理模块）**:
`my-worktree` 对 Current Worktree 的发现与已明确管理操作的归属；当前唯一的写操作是 Worktree Closure，Worktree Widget 仍保持只读。
_Avoid_: 通用 Git 客户端、Worktree Widget 本身

**Worktree Widget（worktree 组件）**:
`my-worktree` 模块中的只读 Pi widget，仅在拥有至少两个 Visible Worktree 的 Multi-worktree Repository 中能唯一确认 Current Worktree 时，于编辑器上方以两行树呈现其分支与 worktree 根路径，而不枚举其他 Visible Worktree。accent 的 `● Worktrees (N)` 标题只给出可见成员的聚合数量，唯一条目以中性的 `•` 呈现；主仓库内路径缩写为 `<REPO>`，窄屏从路径开头截断以保留末尾，若路径完全无可用宽度则隐藏整个组件。发现失败时安静隐藏。它是当前会话位置的补充定位信息，不是 worktree 清单。
_Avoid_: worktree 列表、my-hud worktree 字段、Git 状态栏

## Model Configuration

**Direct Model Binding（直接模型绑定）**:
某个功能自行指定并直接调用的单一模型及思考级别；不经过角色选择、候选回退或能力协商。
_Avoid_: 角色解析、模型候选列表

**Locally Owned Pi Model Settings（本机自有 Pi 模型设置）**:
由本机 Pi 配置所有者而非本仓库部署流程决定的主模型和子代理模型设置。
_Avoid_: 仓库默认模型、部署生成的 agent override

## Weekly Timesheet

**Evidence Window（证据窗口）**:
用于工时表、终点不晚于当前本地日期的闭合本地日历区间；其中 GitHub 活动可作为记工时证据。
_Avoid_: 预测周期、未来周期

**No Activity（无活动）**:
某个日历日没有任何 GitHub 活动证据的状态，以 `NO_ACTIVITY` 和 `0h` 表示，且不是票据。
_Avoid_: UNASSIGNED、未归属活动

**Unassigned Activity（未归属活动）**:
已有 GitHub 活动证据但无法确定唯一票据编号的状态；其估算工时单列，等待人工记账决定。
_Avoid_: No Activity、无活动

**Allocation Rule（分配规则）**:
调用者指定的每日目标工时与最小增量，用于在有证据的日期估算各票据的工时；不代表实际耗时。
_Avoid_: 计时记录、实际工时
