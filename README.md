# Jay Chan 个人作品集

纯静态多页面网站，无需构建工具。首页只保留主视觉，向下滚动依次进入个人介绍、音乐、配乐、制谱和项目；地址栏随当前栏目更新，各栏目仍可直接分享给客户，打开栏目地址会进入完整网站并定位到对应部分。

| 页面 | 文件 |
| --- | --- |
| 首页 | `index.html` |
| 个人介绍 | `about.html` |
| 音乐试听 | `music.html` |
| 配乐视频 | `scoring.html` |
| 制谱预览 | `notation.html` |
| 音乐科技项目 | `projects.html` |

## 本地预览

在仓库根目录运行 `python3 scripts/preview.py --port 8880`，打开 `http://localhost:8880/`。

## 编辑和发布

- 各页面内容直接编辑对应 HTML，随后运行 `python3 scripts/sync_scroll_home.py` 同步首页的连续浏览内容。
- 首页滚动与地址切换在 `scroll-pages.js`；无须服务器路由支持。
- 共用样式在 `styles.css`，播放器、预览和动画在 `site.js`。
- 网站采用固定中英文混排文案，无语言切换；文案直接在各 HTML 中编辑，各页面标题和简介位于 HTML 的 `body` 数据属性中。
- 发布时将六个 HTML、`styles.css`、`site.js`、`scroll-pages.js`、`page-entry.js` 和 `peaks.json` 一起放到网站根目录。图片和音视频继续引用原来的 OSS 地址。
- 对外链接使用 `/about`、`/music`、`/scoring`、`/notation`、`/projects`。旧 `.html` 链接永久跳转到简洁网址。
- 线上托管使用 Vercel；根目录 `vercel.json` 配置旧地址永久跳转及五个栏目的首页重写。部署时保留该文件，发布目录仍为仓库根目录。
- 本地预览脚本读取 `vercel.json`，验证直接打开、刷新与旧地址跳转；普通 `http.server` 不支持这些服务器重写规则。
- 旧链接中的 `lang` 参数会自动移除，统一展示中英文混排版本。
- 原来的 `/#about`、`/#portfolio`、`/#visual`、`/#notation`、`/#work` 链接会在 JavaScript 可用时定位到连续浏览中的对应栏目。
- 栏目切换使用连续滚动，保留播放器状态；直接打开或刷新栏目简洁地址，会载入首页的完整内容并定位到该栏目。
