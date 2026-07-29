# Process Check

一个本地优先的后端接口链路验证原型。它把多账号登录、接口调用、变量传递、断言和子场景组合成可拖拽流程。

创建节点时先从左侧拖入 Actor、Action、Assert 或子场景节点类型，再在右侧属性面板配置这个节点。配置完成的 Actor/Action 可以按需保存为模板，之后从“我的模板”快速复用；节点实例与模板互不绑定。

## 启动

需要 Node.js 20 或更高版本，不依赖第三方 npm 包。

```powershell
npm start
```

打开 `http://127.0.0.1:4399`。如需直接运行内置的“主管创建、两位经理审批、最后触发邮件”示例，另开一个终端：

```powershell
npm run demo:api
```

## 运行语义

- Actor 第一次被执行时先调用自己的登录接口；该 Actor 后续 Action 自动携带同一次运行中的 Cookie。
- 不同 Actor 使用相互隔离的 Cookie jar。
- Action 结果写入 `steps.<节点ID>`，包含 `status`、`headers`、`body`、`durationMs`。
- `{{steps.create-project.body.id}}` 这类模板可用于后续 URL、请求头、请求体和断言。
- Action 可把响应 body 保存为 `shared.<变量名>`；子场景复用同一份 `shared` 和 `steps` 上下文。
- 任一 Action 或 Assert 失败会停止当前链路，并在底部日志展示当时的完整状态。
- 场景必须是有向无环图；同级无依赖节点按 JSON 中的节点顺序执行。
- 场景名称可在顶部直接输入修改。
- 点击连线后，可在右侧属性面板删除，或按 `Delete` / `Backspace`。
- GET 与 HEAD 请求始终忽略请求体；查询参数应写入 URL。
- 修改节点、连线或配置后，上一轮运行结果会立即失效；新运行不会被较早返回的异步结果覆盖。

## JSON 与敏感信息

工作区自动保存到浏览器 `localStorage`，也可导入或导出 JSON。Actor 变量可能包含密码；导出文件不会自动脱敏，请使用测试账号或占位符，不要提交真实凭据。

本地执行器仅监听 `127.0.0.1`。它会按场景内容访问指定 URL，因此只导入可信的场景 JSON。

## 生成 Skill

项目内的 `skills/generate-api-validation-scenario` 可让 Codex 分析接口定义、路由和业务流程，生成可直接导入本工具的 JSON。将该 Skill 安装或链接到你的 Codex skills 目录后，可这样调用：

```text
使用 $generate-api-validation-scenario 分析当前项目，生成“创建项目后依次审批”的验证场景。
```
