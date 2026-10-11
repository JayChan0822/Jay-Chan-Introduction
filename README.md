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

在仓库根目录运行 `python3 -m http.server 8877`，打开 `http://localhost:8877/`。

## 编辑和发布

- 各页面内容直接编辑对应 HTML，随后运行 `python3 scripts/sync_scroll_home.py` 同步首页的连续浏览内容。
- 首页滚动与地址切换在 `scroll-pages.js`；无须服务器路由支持。
- 共用样式在 `styles.css`，播放器、预览和动画在 `site.js`。
- 中英文文案在 `localization.js`；各页面标题和简介位于 HTML 的 `body` 数据属性中。
- 发布时将六个 HTML、`styles.css`、`site.js`、`localization.js` 、`scroll-pages.js`、`page-entry.js` 和 `peaks.json` 一起放到网站根目录。图片和音视频继续引用原来的 OSS 地址。
- 使用实际 HTML 文件路径，不需要额外配置服务器路由。
- 英文链接添加 `?lang=en`，指定中文可添加 `?lang=zh`；未指定时沿用浏览器中保存的语言选择。
- 原来的 `/#about`、`/#portfolio`、`/#visual`、`/#notation`、`/#work` 链接会在 JavaScript 可用时定位到连续浏览中的对应栏目。
- 栏目切换使用连续滚动，保留播放器状态；直接打开或刷新栏目 HTML 地址，会载入首页的完整内容并定位到该栏目。
