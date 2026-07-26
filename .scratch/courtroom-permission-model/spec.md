# 法庭隐喻：三角色权限审查模型

## 概述

将权限系统从"Judge + Professor"二元模型扩展为法庭隐喻的三角色模型，引入 JUDGE.md 作为项目级安全规则的单一事实源，并对抗假阴性风险。

## 背景

当前系统：
- **Judge（法官）**：实时 LLM，对工具调用判 safe/unsafe，综合基准规则 + 项目 JUDGE.md
- **judge-professor（教授）**：事后分析假阳性，通过 `/judge-professor` 触发，输出写入 JUDGE.md
- **JUDGE.md 注入机制**：已生效。`index.ts` 通过 `loadFile(join(process.cwd(), "JUDGE.md"))` 加载并传入 judge

问题：
- **假阴性**（危险操作被判 safe 后静默放行）与假阳性同样危险，但当前系统无检测手段
- judge-prompt.md 按工具名分类安全（只读=安全、破坏性=不安全），对管道注入、heredoc 写入、外部依赖等攻击模式无效
- 教授输出写入 JUDGE.md，但没有对等角色处理假阴性

## 目标

### 三个角色分工

| 角色 | 命令 | 时机 | 职责 |
|------|------|------|------|
| **Judge（法官）** | （自动） | 实时，每个工具调用 | 综合 judge-prompt.md + 项目 JUDGE.md，判 safe/unsafe |
| **Advocate（辩护人）** | `/permission-advocate` | 事后，手动触发 | 审假阳性：法官判 unsafe 但用户手动批准 → 输出 allow 规则到 JUDGE.md |
| **Prosecutor（检察官）** | `/permission-prosecutor` | 事后，手动触发 | 审假阴性：审计全部被判 safe 的放行记录，用更强模型二次审查 → 输出 deny/检测规则到 JUDGE.md |

### JUDGE.md

- 位置：项目根目录 `JUDGE.md`
- 状态：**已实现**。`index.ts` 启动时加载，注入 judge prompt 末尾
- 格式：一行一条规则，紧凑
- 写入控制：写入前由 merger（现 mergeModel）去重合并
- 维护：Advocate 和 Prosecutor 的输出通过 merger 追加到 JUDGE.md

### 新的安全判定方法论：意图链分析（Intent Chain Analysis）

- 不按工具名分类，而是追踪工具调用的完整语义链：
  - 数据最终落点是否超出项目边界
  - 是否产生不可逆副作用
  - 是否通过间接方式执行代码（`-e`/`-c` 参数、管道给解释器）
  - 依赖来源是否可信
- 实现位置：`judge-prompt.md`（系统基准规则），JUDGE.md 为项目级补充
- 安全 = 最终效果不超出项目边界，不产生不可逆副作用

### 验证方式：对抗性自测

- 攻击模型生成变种攻击命令，法官去拦截
- 评估指标：精确优先（Precision > Recall），宁可漏，不误拦

## 实现决策

### 实现位置

所有变更在 `pi-extensions/my-permission/` 内，不涉及外部 pi-permission-system 包。

### 模块拆分

**模块 1：重命名 judge-professor → permission-advocate**

- `index.ts`：工具名从 `judge_professor` 改为 `permission_advocate`
- 工具 label、description、promptSnippet 同步更新
- `professor.ts`：内部标识符 professor → advocate（函数名、类型名）
- 现有 `config.professorModel`、`config.professorThinking` 保留字段名不变（向后兼容，advocate 和 prosecutor 共用审查模型配置）

**模块 2：新增 permission-prosecutor**

- 新文件 `pi-extensions/my-permission/prosecutor.ts`
- `index.ts` 注册 `permission_prosecutor` 工具
- 输入：`collectAllowed()` → 本会话全部 `safe: true` 的 JudgeLogEntry
- 审查：用 `professorModel` (pro) 对每条放行记录做二次审查，判断是否危险
- 输出三层（同 advocate）：
  1. 统计摘要：按危险模式分组（管道外泄、heredoc 写入、外部依赖、内联执行）
  2. 规则建议：应加 deny/ask 的命令模式
  3. JUDGE.md 合并：复用现有 `createMerger`，写入 JUDGE.md
- 无假阴性时提示"未发现假阴性"
- 复用 `professorModel` 和 `professorThinking` 配置，复用 `createMerger`

**模块 3：stats.ts 新增 collectAllowed**

- 扩展现有 `collectJudgeLogs` 逻辑
- 新函数 `collectAllowed(entries)`：筛选 `safe: true` 的记录
- 返回 `JudgeLogEntry[]`，供 prosecutor 消费

**模块 4：judge-prompt.md 加入意图链分析**

- 替换现有"安全/不安全"分类为意图链分析原则
- 保留 JSON 格式要求和 score 定义
- 新增四个不安全判定维度（数据外泄、不可逆副作用、间接执行、不可信来源）

**模块 5：对抗性自测脚本**

- 新文件 `pi-extensions/my-permission/self-test.ts`
- 攻击命令生成器：用 LLM 生成攻击变种（管道注入、heredoc 写入、外部依赖、内联执行四类）
- 法官拦截测试：对每个变种调 `createJudge`，记录 safe/unsafe
- 评估：精确率、召回率、F1
- 用 `bun run self-test` 执行

## 测试决策

### 测试原则

- 只测试外部行为，不测试实现细节
- 通过 create* 工厂函数注入 mock 依赖
- 遵循现有测试风格（vitest + vi.mock）

### 测试接缝

| # | 接缝 | 文件 | 测试文件 |
|---|------|------|----------|
| 1 | `collectAllowed` | `stats.ts` | `stats.test.ts`（新增用例） |
| 2 | `createProsecutor` | `prosecutor.ts` | `prosecutor.test.ts`（新建） |
| 3 | advocate 内部标识符 | `professor.ts` | `professor.test.ts`（更新） |
| 4 | judge-prompt 意图链分析 | `judge-prompt.md` | 对抗性自测脚本覆盖 |

### 覆盖率要求

- branches/functions/lines/statements 全部 100%
- `types.ts`、`index.ts` 排除在外
- `professor.ts` 已有测试，更新后保持覆盖率
- `prosecutor.ts` 新建，从零 TDD

## 非目标

- 不修改 pi-permission-system 外部包
- 不改变法官实时判定流程（JUDGE.md 注入机制已存在）
- 不对假阴性做严重程度分级
- 不实现 JUDGE.md 自动过期淘汰机制
- 不修改 config.json 的 schema

## 补充说明

- `index.ts` 中 `judge_professor` 工具的 execute 回调超过 50 行 → 配合 prosecutor 新增，将工具 execute 逻辑抽到独立文件
- 对抗性自测脚本的目标：Precision >= 90%，成功拦截已知攻击模式及其变种
