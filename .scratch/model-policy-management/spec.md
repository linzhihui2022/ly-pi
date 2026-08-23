# 统一模型策略管理

Status: resolved

## Problem Statement

当前模型选择分散在扩展逻辑、部署设置、子代理 frontmatter、开发自测、HUD 显示映射和测试 fixture 中。一次服务商或模型切换会迫使维护者搜索并修改多处具体 provider/model 标识，容易遗漏、难以审查，也无法清楚地区分普通工作与安全工作的候选、能力和失败语义。

## Solution

引入一个版本化的 Model Manifest 和单一 Model Policy Registry。功能只请求 Model Role；Registry 将其绑定到可复用的 Model Policy，并按固定 Candidate Slot 顺序解析、校验和执行候选。Pi 原生机制继续负责 Provider Registry、认证和模型元数据；本地用户通过不纳入版本控制的 Local Model Override 替换普通策略的具体候选与 thinking，而不改变安全或行为语义。

## User Stories

1. As a ly-pi 使用者, I want 通过一份 Model Manifest 管理仓库默认模型策略, so that 更换服务商不必修改多个功能模块。
2. As a ly-pi 使用者, I want 功能只声明 Model Role, so that 功能代码不依赖具体 provider/model 标识。
3. As a ly-pi 使用者, I want 普通工作复用 fast、standard、deep 和 vision 等 Model Tier, so that 相同任务特征不会反复配置候选链。
4. As a ly-pi 使用者, I want primary 有独立策略, so that Pi 的初始交互模型可以独立于子代理档位调整。
5. As a ly-pi 使用者, I want 自动会话命名和 scout 使用 fast 策略, so that 轻量工作默认使用适当的候选。
6. As a ly-pi 使用者, I want delegate 和注释审查等普通子代理使用 standard 策略, so that 常规工作共享一致的模型选择规则。
7. As a ly-pi 使用者, I want 图片分析使用 vision 策略, so that 候选必须满足图像输入能力要求。
8. As a ly-pi 使用者, I want Judge 使用 security-judge、事后安全分析使用 security-audit, so that 安全工作不会意外继承普通深度档位。
9. As a ly-pi 使用者, I want 权限对抗 self-test 复用 security-judge, so that 自测不再直接注册或写死某个 Provider。
10. As a ly-pi 使用者, I want 非安全且非 vision 的普通策略可由本地覆写替换命名 Candidate Slot 的 model、label 和 thinking, so that 我能使用自己的服务商而不修改仓库默认策略。
11. As a ly-pi 使用者, I want Local Model Override 不能修改候选顺序、能力契约或 Role Failure Policy, so that 本地便利性不会改变功能和安全语义。
12. As a ly-pi 使用者, I want Security Model Role 只使用仓库批准的候选, so that 本地配置不会无意降低安全判定与审计质量。
13. As a ly-pi 使用者, I want 模型候选声明人类可读的 Model Label, so that HUD 显示不再维护独立且易过期的短名表。
14. As a ly-pi 使用者, I want 候选按固定顺序选择, so that 同一配置的行为可预测、可复现且易于测试。
15. As a ly-pi 使用者, I want 只有模型不存在、能力不符、认证、限流、超时、网络或服务端故障时才尝试后备候选, so that 畸形输出和业务协议错误不会被静默掩盖。
16. As a ly-pi 使用者, I want 标题、普通子代理、Judge 和安全审计在候选耗尽时有不同且确定的结果, so that 可用性与安全性取舍显式可审查。
17. As a ly-pi 使用者, I want `/models-doctor` 展示角色、策略、候选槽位、覆写来源、能力诊断与实际主模型, so that 我能在不发真实请求的情况下定位配置问题。
18. As a ly-pi 使用者, I want Model Manifest 和 Local Model Override 在部署后 `/reload` 生效, so that Pi 默认模型、子代理覆写和扩展内解析保持一致。
19. As a ly-pi 维护者, I want Provider Registry 和凭据仍由 Pi 原生 `models.json` 与登录机制管理, so that 模型策略不复制认证责任或泄漏密钥。
20. As a ly-pi 维护者, I want 测试使用角色和策略 fixture 而不是散落的真实模型 ID, so that 后续模型迁移只需更新清单相关测试。
21. As a ly-pi 维护者, I want Pi 主会话从默认模型恢复时的偏离被诊断而非阻断, so that 平台原生恢复行为可见且不会让 Pi 不可用。

## Implementation Decisions

- 新增独立 JSON Model Manifest，作为所有仓库默认模型选择的唯一真源。它包含可复用的 Model Policy、功能到策略的 bindings，以及各策略中具名且有固定顺序语义的 Candidate Slot。
- Model Policy 仅拥有候选、Model Label、thinking、核心 Model Capability Contract、必填 `security` 标志、Candidate Slot 顺序与 Role Failure Policy；prompt、timeout、maxTokens 等 Operation Parameters 保留在各功能中。
- 核心 Model Capability Contract 校验输入类型、推理支持、所选 thinking level 和最小上下文窗口，不引入动态质量评分或伪精确质量指标。
- 第一版策略集合为 primary、fast、standard、deep、vision、security-judge 和 security-audit。现有会话命名/scout、普通子代理、图片分析、Judge、安全审计和权限 self-test 分别绑定到已确认的对应策略。
- 新建深模块 Model Policy Registry。它从 Model Manifest 和可选 Local Model Override 构造有效策略，提供统一的模型运行、Pi 设置编译和诊断能力；功能和 deploy 都只能跨越这个 seam。
- Model Runner 接受 Model Role 与一次操作，负责解析候选、能力校验、固定顺序的基础设施故障回退和 Role Failure Policy。畸形输出、解析失败及业务协议错误不触发候选回退。
- 非安全且非 vision 的普通策略可从扩展目录下、不纳入版本控制的 Local Model Override 读取具名槽位替换；该覆写只能替换 model、Model Label 和 thinking。vision、security-judge 与 security-audit 一律拒绝本地候选覆写。
- Pi 原生 Provider Registry 继续管理 provider、认证和模型元数据。Model Manifest 只使用合格的 provider/model 引用，不保存凭据、端点或自定义 Provider 定义。
- deploy 从有效策略编译 Pi 的初始默认模型、默认 thinking 和子代理 `agentOverrides`，并为普通子代理生成候选回退链。受管理的自定义 agent 不再在 frontmatter 中声明 model 或 thinking，以免其高优先级绕过策略。
- 扩展内直接调用模型的功能一律使用 Model Runner；权限自测移动到扩展上下文，以复用 Pi 的 Model Registry，不再直接 import 特定 Provider。
- HUD 从有效候选的 Model Label 显示模型；未被清单识别的实际主模型显示原始标识并由 `/models-doctor` 报告偏离。
- 新增 `/models-doctor`。它不发送真实模型请求，输出绑定、策略、槽位、覆写来源、模型解析、能力校验、角色失败语义和 Pi 实际主模型相对 primary 初始选择的偏离。
- 候选耗尽时：自动会话命名跳过；普通子代理报错停止；Judge 失败闭合并要求用户确认；安全审计报错且不得写入或修改 JUDGE.md。
- primary 策略编译 Pi 的初始默认模型，但 Pi 原生恢复或故障回退可能选择其他可用模型。该行为只诊断、不由扩展阻断。
- 迁移一次性删除旧的模型常量、独立 HUD 短名表、受管理 agent 的模型 frontmatter 与直接 Provider import；不保留旧配置读取路径。

## Testing Decisions

好测试只验证调用方可观察的策略结果，不绑定 Registry 的内部数据结构或某个真实服务商。

1. **Model Policy Registry seam**：输入 Model Manifest、Local Model Override、假的 Model Registry 与一次操作，验证角色 binding、候选槽位顺序、普通覆写、拒绝安全覆写、能力契约、基础设施故障回退、协议错误不回退及每种 Role Failure Policy。
2. **Pi 设置编译 seam**：验证有效策略会编译出 primary 初始设置、子代理 model/thinking/fallback 配置以及受管理 agent 的覆写；验证本地普通覆写会影响编译结果而安全覆写不会。
3. **诊断 seam**：验证 `/models-doctor` 对缺失模型、能力不符、无效覆写、候选来源和实际 primary 偏离给出明确且无网络副作用的结果。
4. **功能适配 seam**：标题、权限和自测的测试只断言请求了正确 Model Role，以及成功、基础设施失败与角色失败结果；不再在这些测试中断言真实 provider/model 字符串。
5. **迁移防线**：验证受管理 agent 的模型选择来自编译后的 Pi 覆写，HUD 读取 Model Label，并确保仓库默认具体模型标识集中在 Model Manifest 及其专属测试中。
6. 所有新增或修改行为遵循 TDD，并以 `bun run verify` 作为最终验收。

## Out of Scope

- 管理 Provider 凭据、API key、端点或自定义模型注册；这些仍由 Pi 原生机制负责。
- 基于实时价格、延迟、健康度或主观质量评分的动态选模。
- 自动发送探测请求、配额监控或主动健康检查。
- 为不同项目添加项目级模型覆写层。
- 为 Pi 主会话实现自定义启动包装器或强制其原生恢复候选链。
- 图形化编辑 Model Manifest 或 Local Model Override 的界面。
- 修改模型调用的 prompt、timeout、maxTokens 等 Operation Parameters，除非迁移本身需要注入 Model Runner。

## Further Notes

- Local Model Override 缺失时，系统只使用 Model Manifest 的仓库默认候选。
- Model Manifest 或覆写结构无效时，部署期 schema 校验必须失败；运行时仍对实际 Model Registry 和能力信息做惰性校验。
- 该方案的架构理由见 ADR-0010；术语以 `CONTEXT.md` 中的 Model Role、Model Policy、Candidate Slot、Model Runner 等定义为准。
- 本规格已通过 `/to-tickets` 以依赖关系拆分为 01–08 号票据；01–07 号迁移票据已实现，08 号用于跟踪 PR 审查修复。
