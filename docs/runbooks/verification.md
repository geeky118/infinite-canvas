# 验证运行手册

本项目根目录 `AGENTS.md` 明确要求：每次写完代码不需要默认检查语法、构建或测试，除非用户明确要求。本文档用于记录“需要验证时应该怎么验证”，不是强制每次任务都运行。

## 快速检查

后端 Go 测试：

```bash
go test ./...
```

前端格式检查：

```bash
cd web
bun run format:check
```

前端构建：

```bash
cd web
bun run build
```

文档站类型检查：

```bash
cd docs
bun run types:check
```

文档站构建：

```bash
cd docs
bun run build
```

Docker 本地构建运行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

## 本地运行

后端：

```bash
cp .env.example .env
go run .
```

前端：

```bash
cd web
bun run dev
```

文档站：

```bash
cd docs
bun run dev
```

默认前端地址是 `http://localhost:3000`，后端地址是 `http://127.0.0.1:8080`。更多说明见 `docs/content/docs/backend/local-development.mdx`。

## 任务专项检查

- 后端接口：优先跑相关 Go 测试；接口响应必须保持 `{ code, data, msg }`。
- 数据库字段或表结构：更新 `docs/content/docs/backend/backend-database.mdx`，再按需要跑后端测试。
- 前端页面或画布交互：在浏览器里检查目标页面、暗色/浅色主题、移动端宽度、关键弹窗和错误提示。
- 画布节点功能：检查新增节点、刷新恢复、撤销重做、导入导出、资源引用编号和上下游连线。
- 图片/视频/音频生成：至少检查请求参数组装、失败提示和本地生成记录；真实上游能力需要用户提供可用渠道后验证。
- 文档变更：检查 `docs/index.md` 是否需要补入口，正式文档变更同步检查 `docs/content/docs/progress/todo.mdx` 和 `docs/content/docs/progress/pending-test.mdx`。
- Docker 或部署配置：确认 `.env.example`、compose、Dockerfile 和文档描述一致，不要把未验证的生产能力写成已验证。

## 证据记录

需要交接时，把以下证据写入执行计划或最终回复：

- 运行过的命令和关键输出。
- 没有运行验证的原因。
- 需要用户在真实账号、真实上游模型、NAS/WebDAV 或部署环境中继续验证的事项。
- 浏览器截图、生成文件、接口响应或日志摘要。
