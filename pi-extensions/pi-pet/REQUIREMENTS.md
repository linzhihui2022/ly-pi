# pi-pet 需求文档

> 状态：已确认，可作为开发基准  
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

为 Pi 提供本地虚拟 ASCII 宠物扩展，宠物状态随 Pi 会话和真实时间衰减，并通过 `/pet` 命令进行互动。

## 功能需求

### 宠物状态

1. 状态包括：名字（name）、物种（species）、阶段（stage）、饥饿值（hunger）、心情值（mood）、精力值（energy）。
2. 默认值：名字 "Mochi"、物种 "cat"、阶段 "baby"、hunger 80、mood 80、energy 80。
3. 状态持久化到 `~/.pi/pet-state.json`。
4. 状态在扩展加载时读取，并应用基于真实时间的衰减。

### 状态衰减

1. 每小时 hunger +2、mood −1、energy −1.5。
2. 默认值可配置。
3. 衰减后 clamp 到 [0, 100]。

### 事件反应

1. 每次 Pi 完成一个 turn（`agent_end`）时，宠物获得小幅正面增益：mood +3、energy +1、hunger −1。
2. 预留工具结果分类影响（如测试通过/失败、构建成功/失败），但当前 `index.ts` 仅使用 agent_end 固定增益。

### `/pet` 命令

1. `/pet` 或 `/pet status`：显示当前状态与 ASCII 艺术。
2. `/pet feed`：喂食，hunger −30，energy −2。
3. `/pet play`：玩耍，mood +20，energy −10，hunger +5。
4. `/pet sleep`：睡觉，energy +40，hunger +5。
5. `/pet rename <name>`：重命名宠物。
6. `/pet help`：显示可用命令。
7. 命令参数提供补全。

### 状态提示

1. 当 hunger > 70 或 mood < 30 或 energy < 30 时，认为宠物需要关注。
2. 在 `agent_end` 时，若启用通知且距离上次通知超过间隔，则通知用户。
3. 通知间隔可配置，默认 5 分钟。

### ASCII 艺术

1. 根据状态自动选择 5 种表情之一：happy、neutral、hungry、sad、tired。
2. 优先级：tired（energy < 15）> hungry（hunger > 70）> sad（mood < 30）> happy（mood > 60 && energy > 40）> neutral。
3. 状态条显示 hunger、mood、energy 百分比。

### 配置

1. 可选配置文件：`~/.pi/pet-config.json`。
2. 支持字段：
   - `enabled`：总开关。
   - `petName`：默认宠物名字。
   - `decay`：每小时衰减值。
   - `notices`：通知开关与最小间隔。

## 非功能需求

1. 扩展遵循 TDD 流程。
2. 覆盖率要求：branches / functions / lines / statements 全部 100%。
3. 构建命令：`bunx turbo run build`。
4. 测试命令：`bunx turbo run test` 或在扩展目录执行 `npx vitest run --coverage`。
5. 部署命令：`bun run deploy`，目标目录为 `~/.pi/agent/extensions/pi-pet`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 多宠物 | 当前只管理一个宠物 |
| 宠物成长/进化 | 阶段字段固定为 baby |
| 与其他用户的宠物交互 | 单机宠物 |
| 复杂的小游戏 | 仅基础互动命令 |
| 跨设备同步 | 状态仅本地持久化 |

## 验收标准

1. 状态加载、衰减、保存正确。
2. `/pet` 各命令行为正确。
3. ASCII 艺术根据状态正确切换。
4. 通知在需要时触发且不频繁。
5. 配置加载与默认回退正确。
6. 单元测试和覆盖率检查通过。
