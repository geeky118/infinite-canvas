# 画布助手图片任务智能体

## 目标和范围

- 助手生成图片后自动添加到画布空白位置，避免堆叠在已有节点上。
- 框选多个画布图片后，助手自动把它们作为引用，可用于分析、生成新图或图片修改。
- 在对话模式下识别“生成图片、修改图片、拆分元素”等图像任务，自动进入相应图像执行链路。
- 增加任务拆分智能体：根据选中图片和用户要求规划多个子任务，并逐个生成图片结果。
- 完成后按项目规则执行可行的回归测试。

## 约束

- 沿用现有前端直连/远程 AI 请求接口，不新增后端接口。
- 沿用现有选中节点引用机制，不重做画布框选交互。
- 不引入新的状态管理方案。
- 保持画布助手 UI 轻量，不增加大块解释性文案。

## 涉及文件

- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- `web/src/app/(user)/canvas/types.ts`
- `docs/content/docs/progress/pending-test.mdx`

## 执行清单

- [x] 增加助手图片批量插入回调和画布空白落点算法。
- [x] 扩展助手消息图片状态，支持自动添加标记。
- [x] 增加对话图像任务识别：分析、生成、编辑、拆分。
- [x] 增加拆分任务规划与逐项生图链路。
- [x] 更新待测试文档。
- [x] 执行回归测试并记录结果。

## 验证

- `npm run build`：通过。
- `npx tsc --noEmit`：助手相关类型错误已清除；仍存在 4 个既有非本次修改文件错误：
  - `canvas-image-toolbar-settings-modal.tsx`：`HTMLDivElement | null` 传给 `Element`。
  - `canvas-node-hover-toolbar.tsx`：`node` 可能为 `null`。
  - `canvas-node-hover-toolbar.tsx`：Ant Design Tooltip `styles.body` 类型不匹配。
  - `canvas-node-mask-edit-dialog.tsx`：`HTMLCanvasElement | null` 传给 `HTMLCanvasElement`。
- Playwright 浏览器回归：
  - `/canvas` 画布库可加载。
  - 可新建并进入画布。
  - 打开画布助手不再触发 `Maximum update depth exceeded`。
  - 助手可切换到生图模式，图片模型和参数入口正常显示。
  - 未实际调用上游生图/编辑接口，避免消耗额度；图像任务效果仍需真实模型渠道验证。
