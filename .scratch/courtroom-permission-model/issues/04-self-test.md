# 04 — 对抗性自测脚本

**What to build:** 一个独立的测试脚本，用 LLM 生成攻击命令变种，通过法官去拦截，评估新意图链分析 prompt 的效果（精确率、召回率、F1）。

**Blocked by:** 03-intent-chain-prompt

**Status:** resolved

- [ ] 新建 `self-test.ts`，用 `bun run self-test.ts` 执行
- [ ] 攻击命令生成器：用 LLM 对四类模式（管道外泄、heredoc 写入、外部依赖、内联执行）各生成 N 个变种
- [ ] 安全命令生成器：生成正常操作作为对照组
- [ ] 法官拦截测试：对每个命令调 `createJudge`，记录 `safe/unsafe` 判定
- [ ] 输出报告：Precision、Recall、F1、误判详情
- [ ] 目标：Precision >= 90%（精确优先，宁可漏不误拦）
- [ ] 脚本可独立运行，不依赖会话上下文
