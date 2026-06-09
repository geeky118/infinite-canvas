# 系统总览

本文档用于帮助 AI / 自动化开发在动手前快速理解仓库边界。具体开发规则以根目录 `AGENTS.md` 为准。

## 主要模块

- 后端服务：根目录 Go 项目，入口是 `main.go`，路由在 `router/`，HTTP 入参和返回在 `handler/`，业务逻辑在 `service/`，数据库访问在 `repository/`，数据结构在 `model/`，配置读取在 `config/`。
- 前端应用：`web/`，Next.js App Router + React + TypeScript + Ant Design + Tailwind + Zustand。用户端页面在 `web/src/app/(user)/`，管理后台在 `web/src/app/(admin)/admin/`，API 请求封装在 `web/src/services/api/`。
- 画布功能：`web/src/app/(user)/canvas/`，画布状态、节点组件、工具栏、资源引用和导入导出逻辑都优先放在该目录内部。
- 文档站：`docs/`，Next.js + Fumadocs。面向用户的正式文档放在 `docs/content/docs/`，AI 文档索引是 `docs/index.md`，harness 文档放在 `docs/architecture/`、`docs/runbooks/` 和 `docs/exec-plans/`。
- 部署配置：根目录 `Dockerfile`、`docker-compose.yml`、`docker-compose.local.yml`、`render.yaml`；文档站也有独立的 `docs/Dockerfile` 和 compose 文件。

## 数据和状态

- 后端默认使用 SQLite，数据库结构说明写在 `docs/content/docs/backend/backend-database.mdx`。
- 业务接口保持 `{ code, data, msg }` 响应结构，约定写在 `docs/content/docs/backend/api-response.mdx`。
- 画布项目、生成记录和“我的素材”主要保存在浏览器本地；前端业务数据持久化默认使用 `localforage`。
- 本地直连模式下，AI API Key 保存在浏览器本地，并由前端请求 OpenAI 兼容接口。

## 关键边界

- `handler/` 不写业务细节，只做 HTTP 参数、调用 service、返回 `OK` / `Fail`。
- `service/` 负责业务规则、默认值、校验、时间、ID、鉴权等处理。
- `repository/` 只做数据库访问和 GORM 查询，不承载业务决策。
- 前端跨页面 API 封装统一放在 `web/src/services/api/`；跨页面状态放在 `web/src/stores/`。
- 页面私有 hook 和组件优先留在页面目录内，只有真实复用后才上提。

## 高风险区域

- 画布节点尺寸、缩放、裁剪、导入导出和撤销重做容易互相影响，改动前先读 `web/src/app/(user)/canvas/` 的状态和工具函数。
- 图片、视频、音频和文本资源引用依赖编号、上游连线和本地媒体存储，不能只改 UI 展示。
- Docker 下工作目录和 SQLite 路径可能不同，静态资源路径仍是待办项，文档中不要过度承诺生产部署已完全验证。
- 管理后台主题由全局主题配置承载，页面私有组件不要新增自己的深浅色分支。
- 项目尚未上线，不需要旧数据兼容；字段或表结构调整按新设计直接改，但必须同步更新数据库文档。

## 变更落点

- 新增后端接口：`model/` -> `repository/` -> `service/` -> `handler/` -> `router/`，并更新接口和数据库文档。
- 新增用户端页面：优先写在 `web/src/app/(user)/<route>/page.tsx`，只有复杂度真实需要时再拆同目录组件。
- 新增管理页面：页面私有组件放在对应页面目录的 `components/` 下，页面私有 hook 放在页面目录下。
- 新增画布交互：先确认是否属于 `use-canvas-store`、`use-canvas-ui-store`、节点组件或工具函数，避免跨层传递大量 props。
- 新增文档：用户文档写入 `docs/content/docs/`；AI 操作指引、执行计划和验证说明写入 harness 文档目录。
