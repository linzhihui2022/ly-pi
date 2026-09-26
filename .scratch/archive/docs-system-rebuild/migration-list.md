# 旧文档待办迁移清单

> 票 01 产出物。扫描范围：根级 REQUIREMENTS.md / SPEC.md + 5 个扩展各自的 REQUIREMENTS.md / SPEC.md（共 14 份）。
> 扫描方式：全文通读 + 对照源码验证（config 文件、关键符号 grep）。
> 待用户确认无遗漏后，票 03 才能删除旧文档。

## 有迁移（1 个扩展，2 张票）

### my-hud

| 来源 | 去向 | 说明 |
|------|------|------|
| SPEC.md §6 待决策项 1（`modelShortNames` 配置，REQUIREMENTS 已要求但未实现；代码与 my-hud.json 中均无） | `.scratch/my-hud/issues/01-model-short-names.md` | 真实未实现需求 |
| SPEC.md §6 待决策项 2/3/4（footer 点击复制、aboveEditor 字段可隐藏、working 消息回合内固定） | `.scratch/my-hud/issues/02-hud-open-decisions.md` | 开放设计决策，合并为一张决策票 |

SPEC.md §5「扩展点（未来需求着陆区）」**不迁移**：那是给未来需求的落位指南，不是待办；且属于架构知识，随 git 历史保留即可。

## 无活跃待办（6 份文档组）

| 文档组 | 结论 | 依据 |
|--------|------|------|
| 根级 REQUIREMENTS.md / SPEC.md | 无功能待办 | 全部为流程与约定类规则；硬规则（测试必须、覆盖率 100%、环境变量安全等）由票 04 核对并入 AGENTS.md |
| my-back REQUIREMENTS/SPEC | 无活跃待办 | 12 条功能需求均有实现与测试；`/back N`、图片恢复等明确列在「不做什么」 |
| my-bt REQUIREMENTS/SPEC | 无活跃待办 | 自动播放、浮层、`/bt` 命令均有实现与测试；跨平台等在「不做什么」 |
| my-html REQUIREMENTS/SPEC | 无活跃待办 | 预览服务器已在 server.ts 实现（pi-preview-server 空壳是历史遗留，票 03 删除） |
| my-permission REQUIREMENTS/SPEC | 无活跃待办 | 规则层、法官、session 缓存、/judge-log、my-hud 统计集成均已实现 |
