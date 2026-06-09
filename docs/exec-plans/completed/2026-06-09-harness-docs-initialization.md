# Harness 文档初始化

## 目标

按 `harness-engineering` 工作流为当前仓库补齐可持续使用的 AI / 自动化开发文档入口。

## 范围

- 保留根目录 `AGENTS.md` 既有项目规则，只追加 harness 入口。
- 新增 `docs/architecture/system-overview.md` 记录项目模块、边界和高风险区域。
- 新增 `docs/runbooks/verification.md` 记录需要验证时的命令和任务专项检查。
- 新增 `docs/exec-plans/` 说明和模板，用于后续多阶段任务交接。
- 更新 `docs/index.md`，让 AI 文档索引能直接找到 harness 文档。

## 决策

- 不使用 `--force` 覆盖已有 `AGENTS.md`。
- Harness 文档放在 `docs/architecture/`、`docs/runbooks/`、`docs/exec-plans/`，不放入 `docs/content/docs/` 正式用户文档目录。
- 本次只是文档初始化，不修改 `docs/content/docs/progress/todo.mdx` 和 `docs/content/docs/progress/pending-test.mdx` 的功能待测内容。

## 验证

- 已运行无覆盖脚手架初始化，确认 `AGENTS.md` 被跳过，缺失 harness 目录和文件被创建。
- 本次未运行构建或测试；按项目规则，文档初始化不需要默认构建验证。
