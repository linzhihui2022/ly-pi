# my-permission bash 命令拆分与分别检测设计

## 背景

当前 `my-permission` 扩展对 `bash` 工具的命令只做整串正则匹配。例如 `cd ~ && cat readme.md` 被当作一个完整字符串，配置中的 `cat readme.md` 规则无法命中后半段。本设计引入对 bash 命令的 AST 解析，按顶层语义拆分为多个子命令后分别检测权限。

## 目标

- 将包含 `&&`、`||`、`;`、`|`、`$()`、子 shell、控制结构等复杂 bash 命令拆分为可独立判断的子命令。
- 每个子命令单独匹配配置的 bash 权限规则。
- 对每个需要询问的子命令独立弹窗，会话规则按子命令分别缓存。
- 保持现有 `path` / `tool` 规则逻辑不变。
- 覆盖率要求与现有扩展一致：branches/functions/lines/statements 100%。

## 非目标

- 不改变 read / tool 权限检测逻辑。
- 不解释执行命令，只做文本级 AST 拆分与正则匹配。
- 不覆盖脚本级语法错误处理；解析失败时降级为整串匹配。

## 总体方案

引入 `unbash` 作为解析库。在 `BashPermission.check()` 中：

1. 用 `unbash.parse(command)` 得到 AST。
2. 通过递归访问器遍历 AST，收集所有 `type === "Command"` 的叶子节点。
3. 对每个叶子节点，用 `source.slice(pos, end)` 还原原始子命令文本。
4. 依次对每个子命令文本匹配运行时规则、配置规则，得到各自的 `Action`。
5. 合并所有子命令的 Action：
   - 任一子命令为 `deny` → 整体 `deny`，reason 汇总被 deny 的子命令。
   - 无 `deny` 但存在 `ask` → 进入 `handleAction`，逐个询问未命中 allow 的子命令。
   - 全部为 `allow` → 整体 `allow`。
6. 解析失败时，降级为当前行为：整串命令匹配规则。

## 关键决策

| 问题 | 决策 |
|------|------|
| 拆分范围 | `&&`、`||`、`;`、`|`、`$()`、子 shell、控制结构体等所有顶层结构 |
| 合并策略 | 独立分别处理：对每个 ask 子命令单独弹窗 |
| 运行时规则 key | 记录每个被允许/拒绝的子命令 |
| 解析实现 | 引入 `unbash` 库，递归提取 Command 节点 |
| 解析失败 fallback | 按原始整串命令匹配 |

## 数据结构与接口

### 新增模块 `bash-split.ts`

```ts
import type { Script, Node } from "unbash";

export interface SubCommand {
  text: string;
}

export function splitCommand(command: string): SubCommand[];
```

- `splitCommand` 内部调用 `unbash.parse`，递归遍历 AST。
- 仅收集 `type === "Command"` 的节点；对 `Subshell`、`CommandSubstitution`、`If`、`For`、`While` 等递归进入 body。
- 返回按 AST 出现顺序排列的子命令文本数组。
- 解析失败时返回 `[{ text: command }]` 作为 fallback。

### `BashPermission` 改动

#### `check()`

1. 如果 `state.config` 未加载，直接返回 `ask`。
2. 调用 `splitCommand(command)` 得到子命令列表。
3. 对每个子命令：
   - 先匹配 `state.runtimeConfig.bash`。
   - 再匹配 `state.config.permission.bash`。
   - 得到 Action。
4. 合并：
   - 优先处理 deny。
   - 若无 deny 但存在 ask，返回一个组合 `AskAction`，内部携带所有待询问子命令及其当前规则来源。

#### `handleAction()`

- `allow`：直接放行。
- `deny`：返回 block，reason 包含所有被 deny 的子命令。
- `ask`：
  - 对每个需要 ask 的子命令依次调用 `promptPermission`。
  - 用户选择后，按选择写入运行时规则（子命令文本作为 key）。
  - 任一子命令被 deny（含 UI 不可用），整体 block。

## 行为示例

### 示例 1：简单 `&&`

输入：`cd ~ && cat readme.md`

- 拆分为 `cd ~`、`cat readme.md`。
- 假设配置：`
  - key: "cat readme.md", value: deny`
- 结果：整体 deny，reason 包含 `cat readme.md`。

### 示例 2：运行时规则命中

输入：`cd ~ && cat readme.md`

- 运行时规则：`cd ~` allow，`cat readme.md` allow。
- 结果：整体 allow。

### 示例 3：混合 allow / ask

输入：`curl example.com && cat readme.md`

- 假设配置：`
  - key: "curl", value: ask`
  - key: "cat readme.md", value: allow`
- 仅 `curl example.com` 需要询问；用户选择 allow session 后，将 `curl example.com` 写入运行时规则。

### 示例 4：包含子 shell

输入：`(cd ~ && cat readme.md)`

- 拆分为 `cd ~`、`cat readme.md`。
- 与子命令在原始命令中的位置一致，正则规则可正常命中。

### 示例 5：解析失败 fallback

输入：包含无法解析语法的命令字符串。

- `unbash.parse` 返回带 `errors` 的 AST，或极端情况下解析为空。
- 如果收集到的子命令为空，返回 `[{ text: command }]`，按整串匹配。

## 错误处理

- 解析失败/空结果：降级为整串匹配，保证不阻塞正常 bash 工具调用。
- `unbash` 解析 tolerant，不会抛异常；即使 AST 有 errors 也能继续提取已解析部分。
- 若提取结果为空（例如输入为空字符串），返回整串 fallback。

## 测试策略

新增 `bash-split.test.ts`，覆盖：

1. 简单命令：`echo hello` 返回单个子命令。
2. `&&` 拆分：`cd ~ && cat readme.md` → `["cd ~", "cat readme.md"]`。
3. `||` 拆分：`cmd1 || cmd2` → `["cmd1", "cmd2"]`。
4. `;` 拆分：`cmd1 ; cmd2` → `["cmd1", "cmd2"]`。
5. `|` 管道拆分：`cat file | grep x` → `["cat file", "grep x"]`。
6. 引号保护：`echo "a && b"` → 不拆分。
7. 命令替换：`cat $(echo readme.md)` → 拆出 `echo readme.md`、`cat ...`。
8. 子 shell：`(cd ~ && cat readme.md)` → 拆出 `cd ~`、`cat readme.md`。
9. 空字符串：返回 `[""]`。
10. 极端非法输入：返回整串 fallback。

更新 `bash.test.ts`，覆盖：

1. 组合命令命中配置 deny。
2. 组合命令部分命中运行时 allow。
3. 组合命令部分 ask 时独立弹窗并分别写入运行时规则。
4. 组合命令全部 allow。
5. 解析失败 fallback 行为。

## 依赖变更

在 `pi-extensions/my-permission/package.json` 的 `dependencies` 中新增：

```json
"unbash": "^4.0.1"
```

然后执行 `bun install`。

## 部署与验证

1. 实现 `bash-split.ts` 并补充测试。
2. 修改 `BashPermission.check` 与 `handleAction`。
3. 运行 `bunx turbo run build test`。
4. 运行 `bun run deploy`。
5. 在 Pi 中 `/reload` 后验证 `cd ~ && cat readme.md` 能被 `cat readme.md` 规则命中。

## 兼容性与风险

- `unbash` 是 ESM-only、零依赖、TypeScript，体积 13KB gzipped，与现有 Bun/Vitest 工具链兼容。
- 解析失败降级为整串匹配，不会引入新的阻断路径。
- 由于按子命令分别缓存，会话期间单独执行某个子命令时不会再次询问，符合预期。
- 正则规则现在可能匹配到更小的子命令文本，建议用户 review 现有规则；例如 `"\.env"` 仍会命中包含 `.env` 的子命令。
