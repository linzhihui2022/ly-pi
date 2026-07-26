# 01 — collectAllowed + Prosecutor 工具

**What to build:** 用户运行 `/permission-prosecutor` 后，系统收集本会话全部被法官放行的工具调用，用更强模型（pro）二次审查每条记录是否危险，识别假阴性，输出统计摘要和规则建议，逐条请用户确认后合并写入 JUDGE.md。

**Blocked by:** None — can start immediately

**Status:** done

- [ ] `stats.ts` 新增 `collectAllowed(entries)`，筛选 `safe: true` 的全部放行记录，返回 `JudgeLogEntry[]`
- [ ] `prosecutor.ts` 新增 `createProsecutor` 工厂函数，输入放行记录列表 + JUDGE.md + judgePrompt，输出假阴性分析结果（统计摘要 + 规则建议）
- [ ] `index.ts` 注册 `permission_prosecutor` 工具，标签"检察官"，描述"审计法官放行的操作，发现假阴性并优化规则"
- [ ] 工具 execute：若无放行记录则提示"无放行记录"，若有则调 prosecutor 分析，逐条确认规则，通过现有 merger 写入 JUDGE.md
- [ ] `prosecutor.test.ts` 覆盖：空记录、有记录但无假阴性、有假阴性、pro 模型调用失败、JSON 解析失败
- [ ] `stats.test.ts` 新增 `collectAllowed` 用例：空会话、有放行记录、混合 safe/unsafe
- [ ] 覆盖率 100%（branches/functions/lines/statements）
