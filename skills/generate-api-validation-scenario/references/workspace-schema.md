# Process Check workspace schema

输出必须是单个 JSON object，不要加 Markdown 代码围栏。版本 2 将 Actor 与 Action 配置保存在节点实例中；`templates` 只是用户从已配置节点显式保存的可选复用副本。

```json
{
  "version": 2,
  "name": "工作区名称",
  "activeEnvironment": "local",
  "environments": {
    "local": { "baseUrl": "http://127.0.0.1:8080" }
  },
  "variables": {},
  "templates": {
    "actors": [],
    "actions": []
  },
  "scenarios": [
    {
      "id": "scenario-happy-path",
      "name": "完整成功链路",
      "nodes": [
        {
          "id": "use-role-a",
          "type": "actor",
          "x": 80,
          "y": 120,
          "data": {
            "actor": {
              "name": "角色 A",
              "variables": {
                "username": "<TEST_USERNAME>",
                "password": "<TEST_PASSWORD>"
              },
              "login": {
                "method": "POST",
                "url": "{{env.baseUrl}}/login",
                "headers": {},
                "body": {
                  "username": "{{actor.username}}",
                  "password": "{{actor.password}}"
                }
              },
              "auth": {
                "enabled": true,
                "tokenPath": "body.data.accessToken",
                "headerName": "Authorization",
                "prefix": "Bearer "
              }
            }
          }
        },
        {
          "id": "create",
          "type": "action",
          "x": 330,
          "y": 120,
          "data": {
            "action": {
              "name": "创建资源",
              "request": {
                "method": "POST",
                "url": "{{env.baseUrl}}/resources",
                "headers": {},
                "body": {}
              }
            }
          }
        },
        {
          "id": "assert-created",
          "type": "assert",
          "x": 580,
          "y": 120,
          "data": {
            "label": "创建成功",
            "actual": "{{steps.create.status}}",
            "operator": "equals",
            "expected": 201
          }
        }
      ],
      "edges": [
        { "source": "use-role-a", "target": "create" },
        { "source": "create", "target": "assert-created" }
      ]
    }
  ]
}
```

## Node types

- `actor`: `data.actor` 包含名称、变量和登录请求。Actor 节点拥有独立会话；第一次执行时登录，后续 Action 复用 Cookie。可选 `auth` 从登录响应提取 Token 并自动注入 Action Header。
- `action`: `data.action` 包含名称与 HTTP 请求。可选 `data.actorNodeId` 固定使用某个 Actor 节点；可选 `data.saveAs` 把响应 body 写入 `shared.<saveAs>`。
- `assert`: `data.actual` 和 `data.expected` 均支持模板。`operator` 可用 `equals`、`notEquals`、`exists`、`truthy`、`contains`、`greaterThan`、`matches`。
- `scenario`: `data.scenarioId` 引用另一个场景；共享 `steps`、`shared` 和 Actor 会话。

`templates.actors[]` 与 `templates.actions[]` 的结构为 `{ "id", "name", "config" }`，其中 `config` 分别等同于 `data.actor` 或 `data.action`。自动生成场景时通常保持模板数组为空，除非用户明确要求同时创建模板。

Actor Token 注入配置：

- `auth.enabled`: 是否启用。
- `auth.tokenPath`: 相对于完整登录结果的路径，登录接口 Body 为 `{"data":{"accessToken":"..."}}` 时填写 `body.data.accessToken`。
- `auth.headerName`: 默认 `Authorization`。
- `auth.prefix`: 默认 `Bearer `。

Action 显式配置同名 Header 时覆盖 Actor 自动值。

模板路径支持 `env`、`actor`（仅登录请求）、`steps`、`shared`、`actors`。完整模板如 `{{steps.create.body.id}}` 会保留数字、布尔值或对象类型；嵌入字符串时会转成文本。

每个 HTTP 请求都会生成一组内置随机值：

- `{{random.string}}`：8 位 URL-safe 随机字符串。
- `{{random.uuid}}`：UUID v4。
- `{{random.timestamp}}`：当前毫秒时间戳。

同一个请求中重复引用同一路径会得到相同值；下一个 Action 或 Actor 登录请求会生成新值。项目名可写为 `yb-{{random.string}}`。

GET 与 HEAD Action 不发送请求体。查询参数必须放在 URL 中；即使导入 JSON 中保留了 `body`，执行器也会忽略它。
