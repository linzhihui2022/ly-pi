# my-script-guard：拦截范围扩展至 File Write Bypass

pi agent 在被 ADR-0001 的规则拦截后，会改用 `cat << 'EOF' > file`、`tee file << 'EOF'` 等 shell heredoc/重定向写法模拟 write 工具——这类命令不含任何解释器，完全落在原检测器之外。我们决定将 File Write Bypass（见 `CONTEXT.md`）纳入 my-script-guard 的硬拦截范围，与 Inline Script 同等待遇：heredoc 落盘形态（`cat <<EOF > file`、`tee file <<EOF`）一律拦；`echo/printf ... > file` 镜像既有 eval 阈值（内容超 80 字符或含换行才拦），短一行流放行；heredoc 作为管道数据输入（`cat <<EOF | jq .`、`git commit -F - <<EOF`）放行。拦截与 Inline Script **共用同一个 Urgent Escalation 计数器**——升级机制衡量的是「agent 持续试图绕过专用工具」这一行为本身，分开计数等于整体阈值翻倍。

## Considered Options

- **`echo/printf > file` 一律拦**：被拒绝。write/edit 虽能覆盖静态内容场景，但 `echo "FOO=bar" >> .env` 这类惯用一行流会变成 read+edit 两步，日常摩擦过大；且与既有「短一行流不在此限」传统矛盾。
- **`echo/printf > file` 全放行（只拦 heredoc 形态）**：被拒绝。`printf '%s\n' line1 ... line50 > file` 可拼出任意长的文件内容，是被拦后现成的平替旁路。
- **拦一切 heredoc（含管道数据形态）**：被拒绝。遏止对象是「绕过 write/edit」而非 heredoc 语法本身；`git commit -F -` 等数据形态用专用工具替代反而更绕。
- **Urgent Escalation 分开计数**：被拒绝。见上。

## Consequences

- 扩展名 *my-script-guard* 与职责出现字面偏差（拦的不只是 script），保留原名，词义以 `CONTEXT.md` 为准。
- AGENTS.md 的「禁止内联长脚本」条款需同步补充 File Write Bypass 的提示词约束（提示词负责「为什么」，拦截负责「不得不」）。
