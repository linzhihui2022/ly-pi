# Pi Agent 配置仓库

本仓库管理 pi coding agent 的扩展、技能、主题与全局行为准则。本文件是该上下文的术语表。

## Language

**Inline Script（内联脚本）**:
通过 bash 工具以 `-c`/`-e` 参数或 heredoc 形式直接传给解释器（python/node/ruby/perl/php 等）执行的脚本代码。与之相对的正常形态是解释器执行磁盘上的脚本文件（`python3 script.py`）。
_Avoid_: inline code、one-liner、脚本字符串

**Script Misuse（脚本滥用）**:
用 Inline Script 完成本可由 read/write/edit/grep 等专用工具或简单 shell 命令完成的任务。遏止对象是滥用本身，而非「内联」这种书写形式。
_Avoid_: 滥用 Python、滥用 bash

**Urgent Escalation（急迫升级）**:
同一会话内 Inline Script 被累计拦截达到阈值（3 次）后，拦截策略从硬 block 转为弹确认框由用户当场裁决的机制。是硬规则唯一的人性化出口，刻意不提供配置开关。
_Avoid_: 逃生门、白名单、重试放宽

**Redundant cd（冗余 cd）**:
bash 命令以 `cd <目标> &&` 或 `cd <目标> ;` 开头、且目标归一化后等于会话工作目录的冗余前缀写法。归一化覆盖引号包裹、末尾斜杠、`.`/`./` 与 realpath 符号链接。命令中间出现的 cd 不在此列。
_Avoid_: 多余 cd、无效切换
