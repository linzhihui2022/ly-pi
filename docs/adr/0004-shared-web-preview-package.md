# 抽取 web-preview 共享包供多扩展复用

`my-permission` 的 `/judge-log` 需要与 `/html` 相同的「写 HTML 文件 + 本地预览 server + 打开浏览器」能力。我们决定新建 workspace 包 `pi-extensions/web-preview`，内含静态预览 server、`PREVIEW_DIR` 约定与通用 HTML 骨架函数（不含 marked/highlight.js 等 markdown 依赖），由 `my-html` 与 `my-permission` 共同依赖，各自 bundle 时内联。

这打破了此前「扩展各自独立、无跨扩展依赖」的约定。被否决的替代方案：在 `my-permission` 内复制一份精简 server —— 会让 server 逻辑与 `PREVIEW_DIR` 约定出现两处真相，同会话可能起两个静态服务器，修 bug 要改两处。
