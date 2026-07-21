# 移除自定义 Kimi 模型设计

> 状态：已确认
> 日期：2026-07-21

## 背景

Pi 0.78.1 已内置 `kimi-coding/k3` 和 `kimi-coding/kimi-for-coding-highspeed`。仓库的 `settings/models.json` 仍以相同 provider/model ID 注册这两个模型，导致自定义元数据覆盖官方定义。其中 highspeed 自定义条目还会覆盖官方的 `compat.forceAdaptiveThinking`。

## 目标

- 删除仓库及本机已部署的 Kimi 自定义模型配置。
- 让 K3 与 highspeed 完全使用 Pi 官方模型定义。
- 保留 Kimi 凭证和子代理模型映射。

## 方案

删除整个 `settings/models.json`，并移除 `settings/scripts/deploy.ts` 中仅为该文件增加的部署支持。部署脚本恢复为只处理 `settings.json` 的单文件实现。

本机 `~/.pi/agent/models.json` 已确认仅包含 `k3` 和 `kimi-for-coding-highspeed` 两个模型，没有其他 provider、字段或凭证，因此直接删除该文件不会丢失无关配置。

不采用以下方案：

- 只删除 K3：highspeed 同样已内置，保留它仍会覆盖官方兼容性元数据。
- 保留任一模型 override：当前没有需要偏离官方定义的配置需求。

## 配置与清理流程

1. 更新根级 `REQUIREMENTS.md` 与 `SPEC.md`，明确当前 Kimi 模型全部由 Pi 内置目录提供。
2. 删除仓库中的 `settings/models.json`。
3. 将 `settings/scripts/deploy.ts` 恢复为仅部署 `settings.json`。
4. 删除本机 `~/.pi/agent/models.json`，清除已部署的旧 override。
5. 重新查询 Pi 模型目录，确认官方 K3 与 highspeed 仍可用。

## 验证

- 仓库中不存在 `settings/models.json`，部署脚本不再引用 `models.json`。
- `settings` 部署命令成功，生成的 `~/.pi/agent/settings.json` 是有效 JSON。
- 本机 `~/.pi/agent/models.json` 不存在。
- `pi --list-models` 仍列出 `kimi-coding/k3` 与 `kimi-coding/kimi-for-coding-highspeed`。
- `git diff --check` 通过。

## 非目标

- 不删除或修改 Kimi 凭证。
- 不调整子代理模型映射。
- 不修改 Pi 安装包中的官方模型元数据。
- 配置与文档变更不新增自动化测试。
