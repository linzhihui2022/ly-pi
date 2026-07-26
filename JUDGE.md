允许读取 /Users/lychee/.pi/agent/ 目录下的配置文件（.md, .json）
允许在项目内执行 bun build / bun test / bun run deploy 及其组合命令
允许使用 sed -i 修改项目内的测试文件（*.test.ts）
允许在项目内执行 git stash / git stash pop 管理临时变更
允许删除项目内的临时文件及临时标记文件
允许在项目内执行 echo 等无害命令进行文本输出
允许查找 /Users/lychee/.pi 下的 session 记录文件
允许在项目内及子目录执行 biome check 及其管道组合命令（grep、head、tail、sort、uniq、-c 等），可带 --max-diagnostics，仅限无 --write 的只读检查
允许在项目内执行 bun x tsgo --noEmit 进行类型检查，pi-extensions/ 子目录下可先 cd 进入再执行
允许在项目内使用 grep 搜索项目源代码文件内容
允许恢复单个子目录到指定 git 提交（git checkout <commit> -- <path>），后可跟 biome check 管道组合命令
允许 git add 和 git commit 在项目内提交变更
允许 biome check --write 自动修复项目内文件
允许 git push 在 git add/commit 之后执行，仅限已完成提交确认的推送
禁止编辑 /Users/lychee/.pi/agent/extensions/ 目录下的 .js 文件
禁止在项目外执行代码检查后触发 build/deploy 组合命令