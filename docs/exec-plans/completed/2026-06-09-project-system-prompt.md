# 项目级系统提示词

## 目标和范围

- 将画布系统提示词从全局模型配置调整为每个画布项目独立保存。
- 画布主生成流程、重试、图片编辑、反推提示词和右侧助手都应读取当前项目的系统提示词。
- 全局模型配置弹窗不再提供系统提示词入口，避免误认为所有项目共用。

## 约束

- 先沿用现有画布 store 与 AI 配置结构，不新增后端接口。
- 登录用户的项目数据会通过现有 `canvas` 用户数据域同步到服务端。
- 按项目规则，本次不执行构建或测试。

## 涉及文件

- `web/src/app/(user)/canvas/stores/use-canvas-store.ts`
- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- `web/src/app/(user)/canvas/components/canvas-toolbar.tsx`
- `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- `web/src/components/layout/app-config-modal.tsx`
- `docs/content/docs/backend/canvas-data-structure.mdx`
- `docs/content/docs/progress/pending-test.mdx`

## 执行清单

- [x] 在 `CanvasProject` 中增加 `systemPrompt` 字段并随项目保存、导入和创建初始化。
- [x] 在画布工具栏增加当前项目系统提示词入口。
- [x] 在画布页面增加项目系统提示词编辑弹窗。
- [x] 将画布生成、重试、图片编辑、反推提示词和文本生图默认配置改为项目级有效配置。
- [x] 将右侧画布助手改为接收当前项目有效配置。
- [x] 移除全局模型配置弹窗里的系统提示词输入。
- [x] 更新文档待测试项和画布数据结构说明。

## 验证

- 未运行构建或测试，按项目规则由用户自行验证。
- 建议人工验证：两个画布项目分别设置不同系统提示词后，画布生成、配置节点生成、重试和右侧助手请求均使用当前项目提示词。
