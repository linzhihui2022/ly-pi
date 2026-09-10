# gh-git-readonly-whitelist — 确定性放行常用只读 GitHub 与 Git 命令

Status: ready-for-agent

Risk: High

Approval: Approved — 用户已明确批准本规格及源代码与测试实施；部署、合并与 `/reload` 不在本次批准范围内。

## Problem Statement

法官会将未命中静态规则的 bash 单元交给 LLM 判定。常用的只读 `gh` 和 `git` 命令因此会受模型延迟、故障和对“外部 API”语义的不同理解影响，被不稳定地拦截。历史 Judge Log 已记录已人工放行的只读 `gh api` 查询、`gh auth login --help` 查询，以及因超时被拦的 `git show` 查询。

## Solution

为一组语义明确、无远程写入和无本地状态变更的常用 `gh` / `git` 命令添加确定性 allow 规则，使其不再调用 Judge。保守处理 API 调用：仅显式声明 GET 方法的 `gh api` 请求可自动放行；隐式方法、字段/输入载荷和任何写入型命令继续交由现有高风险流程处理。

## User Stories

1. 作为使用 Pi 审查代码的开发者，我希望常用的 Git 状态和历史查询不依赖 Judge，以便模型超时不会阻断诊断工作。
2. 作为使用 GitHub CLI 阅读 PR 的开发者，我希望 `gh pr` 的只读查询可立即执行，以便审查流程稳定。
3. 作为使用 GitHub CLI 阅读 issue、release、workflow 和仓库元数据的开发者，我希望这些只读查询可立即执行，以便不反复处理误拦确认。
4. 作为需要调用 GitHub REST API 的开发者，我希望显式 GET 查询可确定性执行，以便读取 API 元数据不受模型判断波动影响。
5. 作为权限系统所有者，我希望带请求体、字段或非 GET 方法的 `gh api` 调用不获得自动放行，以便远程写入仍被拦截或审查。
6. 作为权限系统所有者，我希望 `git push`、`git fetch`、变基、合并、远程配置变更和写配置继续不被确定性放行，以便不扩大自动执行权限。
7. 作为子代理任务发起者，我希望已白名单的只读命令不会因子会话无法交互确认而失败。
8. 作为维护者，我希望新增规则通过规则求值边界测试，以便规则顺序、链式命令拆分和安全回退都有稳定的回归保障。

## Implementation Decisions

- 只扩展现有 bash 权限映射，不新增广泛的命令解释器、网络访问能力或对 Judge 的绕过机制。
- 自动放行仅覆盖标准、只读的 GitHub CLI 子命令：版本和帮助查询、认证状态、PR / issue / release / workflow / repository 的读取型子命令。
- `gh api` 仅自动放行显式 GET 形式；无显式 GET、带字段或输入载荷、以及 PATCH / POST / PUT / DELETE 等形式一律不加入白名单。
- 自动放行仅覆盖本地 Git 的只读查询，例如提交展示、远程地址读取、受跟踪文件列举、忽略规则查询、责任归属、远程分支列举、符号引用和读取型配置查询。
- 不把可能执行外部 diff/textconv 程序的 Git 展示形式纳入白名单。
- 保留现有默认回退：任何未被明确允许的 bash 单元继续由 Judge 处理；本次不改变 Judge prompt、子代理策略或人工确认语义。
- 规则顺序必须保证更具体的非白名单危险形式不会被较宽的允许模式覆盖。

## Testing Decisions

- 在现有规则求值接缝上测试真实权限配置的外部判定结果，而非断言权限映射的内部键名。
- 将每种允许的典型 `gh` 与 `git` 命令、以及由多个允许单元组成的链式命令断言为 `allow`。
- 将相邻的危险反例断言为非 `allow`：远程创建/编辑/合并、非 GET API、含字段或输入的 API 调用、推送、抓取、变基、合并、远程地址变更、写配置，以及外部 diff/textconv 形式。
- 以现有 Judge Log 中的误拦命令为回归样本；其中 API 样本采用显式 GET 的安全形式，以符合本规格的保守边界。
- 运行仓库完整验证命令；本规格不授权部署，部署须在验证成功后单独获批。

## Out of Scope

- 泛化放行所有 `gh api` 调用或解析任意 shell 脚本。
- 自动放行 GitHub 远程写入、账户切换、认证登录、PR/issue/release 的创建、编辑、关闭或合并。
- 自动放行 `git push`、`git fetch`、rebase、merge、reset、工作树删除、远程配置或写配置。
- 修改 Judge 的提示词、LLM 模型、超时行为、子代理阻断行为或 JUDGE.md。
- 部署扩展或运行 `/reload`。

## Further Notes

该改动属于权限执行机制，风险等级为 High。实现前应将本规格拆为本地 ticket，并在 ticket 中记录用户对本规格的明确批准。