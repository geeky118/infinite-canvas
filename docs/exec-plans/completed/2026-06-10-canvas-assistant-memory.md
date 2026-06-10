# 画布助手会话记忆优化

## 目标和范围

- 将助手会话记忆从简单拼接文本升级为结构化摘要。
- 长对话发送上下文时使用会话记忆加最近消息，避免全量历史无限增长。
- 记忆更新优先使用文字模型压缩，失败时保留本地轻量兜底。
- 明确登录用户的会话记忆随画布项目同步到 `user_data` 数据库记录。

## 约束

- 沿用现有 `/api/v1/user-data/canvas` 同步链路，不新增后端接口或数据库表。
- 不引入新的状态管理方案。
- 按项目规则，本次不执行构建或测试。

## 涉及文件

- `web/src/app/(user)/canvas/types.ts`
- `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- `docs/content/docs/backend/canvas-data-structure.mdx`
- `docs/content/docs/backend/backend-database.mdx`
- `docs/content/docs/progress/pending-test.mdx`

## 执行清单

- [x] 定义结构化会话记忆类型。
- [x] 发送文字对话时使用记忆摘要加最近消息。
- [x] 增加模型压缩记忆更新和本地兜底。
- [x] 更新登录用户数据库持久化说明。
- [x] 更新待测试文档。

## 验证

- 未运行构建或测试，按项目规则由用户自行验证。
