# Process Check

一个本地优先的后端接口验证工具。它包含两种验证方式：

- **流程验证**：把多账号登录、接口调用、变量传递、断言和子场景组合成可拖拽流程。
- **接口用例集**：让同一个 Action 模板使用不同参数批量执行，适合正常、异常和边界条件验证。

创建节点时先从左侧拖入 Actor、Action、Assert 或子场景节点类型，再在右侧属性面板配置这个节点。配置完成的 Actor/Action 可以按需保存为模板，之后从“我的模板”快速复用；节点实例与模板互不绑定。

## 接口用例集

1. 在“流程验证”中配置 Actor/Action 节点，并把需要复用的节点保存为模板。
2. 切换到顶部的“接口用例集”，新建一个用例集。
3. 选择 Action 模板以及可选的 Actor 模板。
4. 添加多条用例，在“参数覆盖 JSON”中只填写相对于 Action 模板需要变化的请求字段。
5. 为每条用例配置响应断言，然后点击“批量运行”。

参数覆盖会与 Action 模板的请求进行深度合并。例如：

```json
{
  "body": {
    "projectName": "yb-{{random.string}}",
    "approvers": ["manager_b", "manager_c"]
  }
}
```

断言的 `source` 相对于单次接口响应，可填写 `status`、`ok`、`body.success`、`body.data.id` 等路径：

```json
[
  { "source": "status", "operator": "equals", "expected": 201 },
  { "source": "body.data.id", "operator": "exists" }
]
```

每条启用用例独立执行，拥有独立的 Actor 登录会话；单条失败不会阻止后续用例。禁用用例会被跳过。

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
- Actor 可在登录后调用独立 Token 接口，也可兼容从登录响应直接提取 Token；随后自动向 Action 注入 Authorization 或其他 Header。Action 显式配置同名 Header 时优先。
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
- 每次 HTTP 请求提供 `{{random.string}}`（8 位）、`{{random.uuid}}` 和 `{{random.timestamp}}`。同一请求内重复引用保持一致。

## Actor Token 自动注入

在 Actor 属性面板启用“自动获取 Token 并注入后续 Action”，然后配置 Token 请求：

```text
Token 请求方法：GET
Token 接口地址：{{env.baseUrl}}/token
Token 路径：body.data.accessToken
Header 名称：Authorization
值前缀：`Bearer `
```

执行 Actor 时会先调用登录接口建立 Cookie 会话，再使用相同 Cookie 调用 Token 接口。当 Token 响应为 `{"data":{"accessToken":"abc123"}}` 时，后续 Action 会自动携带 `Authorization: Bearer abc123`，无需在画布上额外创建获取 Token 的 Action。

如果 Token 接口地址留空，则继续从登录响应提取 Token，兼容已有配置。

## JSON 与敏感信息

工作区自动保存到浏览器 `localStorage`，也可导入或导出 JSON。Actor 变量可能包含密码；导出文件不会自动脱敏，请使用测试账号或占位符，不要提交真实凭据。

本地执行器仅监听 `127.0.0.1`。它会按场景内容访问指定 URL，因此只导入可信的场景 JSON。

## 生成 Skill

项目内的 `skills/generate-api-validation-scenario` 可让 Codex 分析接口定义、路由和业务流程，生成可直接导入本工具的 JSON。将该 Skill 安装或链接到你的 Codex skills 目录后，可这样调用：

```text
使用 $generate-api-validation-scenario 分析当前项目，生成“创建项目后依次审批”的验证场景。
```
