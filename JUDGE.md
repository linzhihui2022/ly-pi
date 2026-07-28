允许读取 ~/.pi 目录下的 agent 配置（.md/.json）、session 记录、costs 记录，排除含 auth/token/secret 关键字的文件
允许在项目内执行：构建、测试、类型检查、代码检查（无 --write）、源代码搜索（支持管道组合 grep/head/tail/sort/uniq/-c）、删除临时文件、echo 输出、sed -i 修改测试文件、读取 node_modules 源码；deploy 命令需额外审计脚本内容；对于 bun run 等支持 --cwd 参数的命令，仅当 --cwd 路径位于当前项目目录内时允许执行
允许在项目内执行 git stash/stash pop、git add、git commit、git checkout 恢复子目录、biome check --write 自动修复等安全版本管理操作
禁止在项目外目录执行写操作，禁止编辑 ~/.pi/agent/extensions/ 下的 .js 文件
禁止读取任何敏感凭据文件，包括 ~/.ssh/ 目录、.env 系列、credentials.*、*.pem、*.key
禁止通过 find -exec/-ok、xargs、heredoc、echo 管道等方式间接执行任意解释器代码（python/node/perl/ruby/php 等）
禁止网络传输工具（nc/telnet/ssh/scp/rsync/ftp）建立连接，curl 仅限读取且禁止落盘、禁止管道给解释器执行
禁止 sudo、rm -rf、kill 及 chmod/chown/chgrp 等破坏性或权限变更命令
禁止通过任何方式（包括但不限于 --cwd、-C、cd 前缀）将构建/测试/文件操作的作用域切换至当前项目目录之外
执行 git push 或 deploy 前需额外确认：push 时分支非 main/master 或用户确认，deploy 含外传操作需人工审计