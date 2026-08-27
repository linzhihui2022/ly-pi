# retire-pi-tool-display-compatibility — 退役旧工具显示兼容层

Status: ready-for-agent

Risk: High

Approval: 用户在本 Pi 会话的 grilling 中确认：完整退役兼容层、同步一次性清理本机残留、完整部署验证，并将批准记录在本 spec 与唯一 ticket 中。

## Problem Statement

当前机器已经卸载第三方 `pi-tool-display`，但仓库仍保留旧 renderer 兼容层。它会在每次部署时写入一个无运行时作用的禁用配置，也让测试和 README 继续表达已经结束的迁移策略。

维护者需要让仓库、部署行为与实际运行状态一致：自有 `my-tool-display` 是唯一受支持的工具显示实现，不再创建、更新或说明第三方 renderer 的兼容配置。

## Solution

正式退役旧 renderer 兼容层。部署不再处理旧 renderer 配置；测试从兼容切换改为证明部署不会创建或改写该配置；README 仅保留当前受支持的配置说明；已解决的历史 ticket 保持不变。

在本次成功部署后，维护者一次性删除已确认无用的本机旧配置残留。此清理不成为未来部署的自动删除行为。

## User Stories

1. As a ly-pi maintainer, I want the repository to contain only supported tool-display configuration, so that its source of truth matches the active runtime.
2. As a Pi user, I want a normal deployment not to create a legacy renderer configuration, so that it does not leave misleading dormant state behind.
3. As a Pi user with an existing dormant legacy configuration, I want deployment not to rewrite it, so that an unrelated deploy does not silently alter user-level state.
4. As a maintainer, I want the retired migration tests replaced with behavior-focused deployment tests, so that the absence of legacy deployment behavior is protected.
5. As a maintainer, I want active README guidance to describe only supported configuration, so that new readers are not directed through a completed migration.
6. As a maintainer, I want the original resolved migration ticket retained, so that the historical decision remains auditable without presenting it as current behavior.
7. As the current Pi user, I want the known inert local artifact removed only after successful validation and deployment, so that cleanup is deliberate and bounded.
8. As a Pi user, I want the extension runtime reloaded after the deployment, so that the verified deployed implementation becomes active.

## Implementation Decisions

- The Legacy Renderer Compatibility Layer is fully retired: its configuration source, deployment transaction work, compatibility-specific tests, and active migration documentation are removed together.
- The deployment seam remains the existing staging-directory deployment test. Its contract becomes that a deployment neither creates nor modifies the legacy configuration.
- The deployment workflow does not acquire a permanent deletion step for user-level legacy state.
- One exact current-machine cleanup runs only after successful repository validation and deployment. It removes the known legacy configuration file and removes its parent directory only when empty.
- The resolved migration ticket remains a historical record and is not rewritten.
- `my-tool-display` behavior, third-party package installation, and package caches are not changed.

## Testing Decisions

- Test externally observable deployment behavior through the existing staging-directory deployment seam rather than internal helper calls.
- Cover a first deployment with no legacy configuration and a deployment with a pre-existing legacy configuration; assert that the former remains absent and the latter remains unchanged.
- Preserve tests for the remaining extension deployment transaction behavior; delete only assertions whose contract was the retired compatibility layer.
- Run the repository-wide verification command, then normal deployment. After deployment, verify the package list and exact legacy artifact path before requesting runtime reload.

## Out of Scope

- Supporting upgrades for users who still have the old third-party renderer installed.
- Automatically uninstalling packages, deleting package caches, or deleting legacy state during every future deployment.
- Changing the resolved historical migration ticket.
- Changing `my-tool-display` rendering behavior or any other Pi extension.
- Making unrelated documentation or refactoring changes.

## Further Notes

- This task changes and runs deployment workflow code, and deletes one global-agent configuration artifact; it is High risk under the repository delivery guardrails.
- The user approved the complete scope and release validation in this conversation. The final runtime reload remains a user action after deployment.
