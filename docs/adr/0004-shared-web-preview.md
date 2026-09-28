# 预览能力共享单一实现

`/html`（my-html）、`/judge-log`（my-permission）与 my-log 需要相同的「写 HTML 文件 + 本地预览 server + 打开浏览器」能力。我们决定让它只有一份实现：`ly-pi/web-preview/`（静态预览 server、`PREVIEW_DIR` 约定、通用 HTML 骨架函数，不含 marked/highlight.js 等 markdown 依赖），由需要预览的模块直接复用。

被否决的替代方案：各模块内部复制一份精简 server —— 会让 server 逻辑与 `PREVIEW_DIR` 约定出现两处真相，同会话可能起两个静态服务器，修 bug 要改两处。
