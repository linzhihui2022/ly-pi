# 02 — Advocate 重命名

**What to build:** 将现有 `/judge-professor` 重命名为 `/permission-advocate`，内部标识符 `professor` → `advocate` 同步更新。用户使用新命令名触发假阳性审查，功能不变。

**Blocked by:** None — can start immediately

**Status:** done

- [ ] `index.ts`：工具 name 从 `judge_professor` 改为 `permission_advocate`，label/description/promptSnippet 更新
- [ ] `professor.ts`：函数名 `createProfessor` → `createAdvocate`，`ProfessorFn` → `AdvocateFn`，`ProfessorResult` → `AdvocateResult`，`ProfessorSuggestion` → `AdvocateSuggestion`
- [ ] `professor.ts`：`buildProfessorPrompt` → `buildAdvocatePrompt`，`parseProfessorJson` → `parseAdvocateJson`
- [ ] `index.ts` 中所有引用同步更新
- [ ] `professor.test.ts` 同步重命名，所有用例通过
- [ ] 覆盖率保持 100%
- [ ] `config.professorModel` / `config.professorThinking` 字段名保留不变（advocate 和 prosecutor 共用）
