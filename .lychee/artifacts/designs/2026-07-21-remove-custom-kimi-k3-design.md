# 移除自定义 Kimi K3 设计

> 状态：已确认
> 日期：2026-07-21

## 背景

Pi 0.78.1 已内置 `kimi-coding/k3`。仓库的 `settings/models.json` 仍以相同 provider/model ID 注册 Kimi K3，导致自定义元数据覆盖官方定义。

## 目标

- 删除仓库及本机已部署配置中的自定义 `kimi-coding/k3`。
- 让 Kimi K3 后续完全使用 Pi 官方模型定义。
- 保留尚需自定义维护的 `kimi-coding/kimi-for-coding-highspeed`。

## 方案

采用定点删除：仅从 `settings/models.json` 的 `kimi-coding.models` 数组删除 `id: "k3"` 的对象，不删除文件，也不修改现有部署脚本。

不采用以下方案：

- 删除整个 `models.json`：会同时移除 highspeed 自定义模型。
- 保留 K3 override：仍会覆盖官方定义，不满足目标。

## 配置与部署流程

1. 更新根级 `REQUIREMENTS.md` 与 `SPEC.md`，规定自定义模型配置不得重复注册 Pi 已内置的 provider/model ID。
2. `settings/models.json` 仅保留 `kimi-for-coding-highspeed`。
3. 执行 `bun run deploy`。部署脚本以源配置数组替换本机 `~/.pi/agent/models.json` 对应数组，从而清除旧的自定义 K3 条目。
4. Pi 加载模型目录时，将剩余自定义 highspeed 模型与内置 `kimi-coding` 模型合并；官方 `k3` 保持可用。

## 验证

- 仓库与 `~/.pi/agent/models.json` 均可被解析为有效 JSON。
- 两处配置均不含自定义 `id: "k3"`，且仍含 `kimi-for-coding-highspeed`。
- `pi --list-models` 仍列出 `kimi-coding/k3`，证明其来自 Pi 内置目录。

## 非目标

- 不删除或修改 Kimi 凭证。
- 不调整子代理模型映射。
- 不修改 highspeed 模型元数据。
- 配置与文档变更不新增自动化测试。
