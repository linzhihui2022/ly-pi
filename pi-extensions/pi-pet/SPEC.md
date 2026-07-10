# pi-pet Spec

> 状态：已确认，可作为开发基准  
> 需求文档：[`REQUIREMENTS.md`](./REQUIREMENTS.md)

## 1. 设计目标

pi-pet 是一个虚拟 ASCII 猫宠物，为 Pi 会话提供轻量情感反馈：
- 状态随时间自然衰减。
- 在 Pi 完成每个 turn 时获得小幅奖励。
- 用户可通过 `/pet` 命令进行喂食、玩耍、睡觉、重命名等互动。

## 2. 模块结构

```
pi-extensions/pi-pet/
├── index.ts          # 扩展入口：加载配置、注册事件与命令
├── state.ts          # 宠物状态管理、持久化、时间衰减
├── art.ts            # ASCII 艺术帧选择与状态条渲染
├── events.ts         # 事件影响分类（预留）
├── config.ts         # 配置加载与默认回退
├── types.ts          # 共享类型
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── SPEC.md           # 本文档
└── REQUIREMENTS.md   # 需求清单
```

依赖方向：

```
index.ts → state.ts
        → art.ts
        → events.ts
        → config.ts
        → types.ts
```

## 3. 状态模型

```ts
interface PetState {
  name: string;
  species: "cat";
  stage: "baby" | "adult";
  hunger: number;        // 0–100
  mood: number;          // 0–100
  energy: number;        // 0–100
  lastUpdatedAt: number; // 毫秒时间戳
  bornAt: string;        // ISO 时间字符串
}
```

默认值：
- `name`: "Mochi"
- `species`: "cat"
- `stage`: "baby"
- `hunger`: 80
- `mood`: 80
- `energy`: 80

## 4. 状态管理

### 4.1 持久化

- 保存路径：`~/.pi/pet-state.json`。
- 使用写临时文件 + `rename` 方式保证原子写入。

### 4.2 加载与衰减

加载时计算 `elapsedHours = (now - lastUpdatedAt) / MS_PER_HOUR`，然后：

```
hunger += decay.hungerPerHour * elapsedHours
mood   -= decay.moodPerHour   * elapsedHours
energy -= decay.energyPerHour * elapsedHours
```

所有值 clamp 到 [0, 100]。

### 4.3 操作影响

| 操作 | hunger | mood | energy |
|------|--------|------|--------|
| feed | −30 | 0 | −2 |
| play | +5 | +20 | −10 |
| sleep | +5 | 0 | +40 |
| agent_end | −1 | +3 | +1 |

## 5. ASCII 艺术

### 5.1 帧选择

按优先级：
1. `tired`：`energy < 15`
2. `hungry`：`hunger > 70`
3. `sad`：`mood < 30`
4. `happy`：`mood > 60 && energy > 40`
5. `neutral`：默认

### 5.2 状态条

显示 hunger、mood、energy 的进度条与百分比，宽度根据终端宽度自适应（>50 时 15 格，否则 10 格）。

## 6. 配置

`~/.pi/pet-config.json`：

```ts
interface PetConfig {
  enabled: boolean;
  petName: string;
  decay: {
    hungerPerHour: number;
    moodPerHour: number;
    energyPerHour: number;
  };
  notices: {
    enabled: boolean;
    minIntervalMinutes: number;
  };
}
```

默认值：

```json
{
  "enabled": true,
  "petName": "Mochi",
  "decay": {
    "hungerPerHour": 2,
    "moodPerHour": 1,
    "energyPerHour": 1.5
  },
  "notices": {
    "enabled": true,
    "minIntervalMinutes": 5
  }
}
```

配置加载失败时回退到默认值。

## 7. `/pet` 命令

| 命令 | 行为 |
|------|------|
| `/pet` / `/pet status` | 显示 ASCII 艺术与状态条 |
| `/pet feed` | 喂食并更新状态 |
| `/pet play` | 玩耍并更新状态 |
| `/pet sleep` | 睡觉并更新状态 |
| `/pet rename <name>` | 重命名宠物；空名字被拒绝 |
| `/pet help` | 显示命令帮助 |

命令参数补全：status、feed、play、sleep、rename、help。

## 8. 通知

### 8.1 触发条件

`agent_end` 时，若满足：
- `config.notices.enabled` 为 true。
- 距离上次通知超过 `config.notices.minIntervalMinutes`。
- 宠物需要关注（hunger > 70 或 mood < 30 或 energy < 30）。

则调用 `ctx.ui.notify` 提示具体状态（如 "Mochi is hungry!"）。

## 9. 事件响应

### 9.1 当前

- `session_start`：加载配置并初始化 `PetStateManager`。
- `agent_end`：应用固定正面影响，可能触发通知。

### 9.2 预留

`events.ts` 中定义了基于工具结果分类的 `classifyEvent`（测试通过/失败、构建成功/失败等），但当前 `index.ts` 未使用，作为未来扩展点。

## 10. 测试策略

- `state.ts`：加载、衰减、操作、持久化、边界值测试。
- `art.ts`：帧选择逻辑与状态条渲染测试。
- `events.ts`：事件分类逻辑测试。
- `config.ts`：配置加载与默认回退测试。
- `index.ts`：集成测试，mock ExtensionAPI、事件、命令与文件系统。
- 覆盖率目标：branches / functions / lines / statements 全部 100%。

## 11. 不做什么

| 功能 | 排除原因 |
|------|----------|
| 多宠物 | 当前只管理一个宠物 |
| 宠物成长/进化 | 阶段字段固定为 baby |
| 与其他用户的宠物交互 | 单机宠物 |
| 复杂的小游戏 | 仅基础互动命令 |
| 跨设备同步 | 状态仅本地持久化 |

## 12. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-10 | 补充 pi-pet 需求与规格文档，确认状态、命令、配置、通知与测试策略 |
