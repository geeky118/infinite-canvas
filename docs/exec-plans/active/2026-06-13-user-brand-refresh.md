# 用户端品牌和页面体验刷新

## 目标

- 重新设计用户端 logo 和品牌主色。
- 建立新的用户端设计规范文档。
- 更新用户端首页、导航、登录页和核心工作台的页面风格。
- 保持日间和夜间模式一致可用。
- 避开并发中的管理端改动，最终只提交本次用户端相关文件。

## 范围

- 用户端品牌资产：`web/public/logo.png`、`web/public/logo-icon.png`、`web/public/logo-64.png`。
- 用户端主题入口：`web/src/lib/app-theme.ts`、`web/src/lib/canvas-theme.ts`、`web/src/app/globals.css`。
- 用户端页面和壳层：`web/src/app/(user)/`、`web/src/components/layout/`。
- 文档：新增用户端设计规范，更新进度待测试文档。

## 计划

- [x] 切出独立分支，确认管理端改动不纳入本次提交。
- [x] 梳理当前用户端页面结构和主题入口。
- [x] 落地新 logo 与设计规范文档。
- [x] 更新用户端页面风格、主色调和日夜模式。
- [x] 用浏览器检查桌面/移动端、浅色/深色和关键点击路径。
- [ ] 精确暂存并提交本次改动。

## 验证记录

- 已在 `http://127.0.0.1:49321` 启动当前分支前端开发服务。
- Playwright 回归访问 `/`、`/login`、`/canvas`、`/image`、`/video`、`/prompts`、`/assets`，页面均可渲染，检测无横向溢出，Logo 图片资源加载成功。
- Playwright 点击桌面导航：我的画布、视频创作台、提示词库、我的素材均可跳转；生图工作台在首页同时存在顶部导航和首屏按钮，脚本计数为 2，人工按页面截图确认入口可见。
- Playwright 截图已生成在 `output/playwright/user-brand-*.png`，仅作为本地验证产物，不纳入提交。
- 本地未启动后端 `127.0.0.1:8080`，因此 `/api/settings`、`/api/prompts` 代理返回 502；这会影响动态数据，不影响本次样式检查结论。
- 按项目规则未执行构建或格式检查。
