# Process Check workspace schema

输出必须是单个 JSON object，不要加 Markdown 代码围栏。

```json
{
  "version": 1,
  "name": "工作区名称",
  "activeEnvironment": "local",
  "environments": {
    "local": { "baseUrl": "http://127.0.0.1:8080" }
  },
  "variables": {},
  "actors": [
    {
      "id": "actor-role-a",
      "name": "角色 A",
      "variables": { "username": "<TEST_USERNAME>", "password": "<TEST_PASSWORD>" },
      "login": {
        "method": "POST",
        "url": "{{env.baseUrl}}/login",
        "headers": {},
        "body": { "username": "{{actor.username}}", "password": "{{actor.password}}" }
      }
    }
  ],
  "actions": [
    {
      "id": "action-create",
      "name": "创建资源",
      "request": {
        "method": "POST",
        "url": "{{env.baseUrl}}/resources",
        "headers": {},
        "body": {}
      }
    }
  ],
  "scenarios": [
    {
      "id": "scenario-happy-path",
      "name": "完整成功链路",
      "nodes": [
        { "id": "use-role-a", "type": "actor", "x": 80, "y": 120, "data": { "actorId": "actor-role-a" } },
        { "id": "create", "type": "action", "x": 330, "y": 120, "data": { "actionId": "action-create" } },
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

- `actor`: `data.actorId` 引用顶层 actor。执行时登录一次，并把它设为后续 action 的当前 Actor。
- `action`: `data.actionId` 引用顶层 action。可选 `data.actorId` 固定 Actor；可选 `data.saveAs` 把响应 body 写入 `shared.<saveAs>`。
- `assert`: `data.actual` 和 `data.expected` 均支持模板。`operator` 可用 `equals`、`notEquals`、`exists`、`truthy`、`contains`、`greaterThan`、`matches`。
- `scenario`: `data.scenarioId` 引用另一个场景；共享 `steps`、`shared` 和 Actor 会话。

模板路径支持 `env`、`actor`（仅登录请求）、`steps`、`shared`、`actors`。完整模板如 `{{steps.create.body.id}}` 会保留数字、布尔值或对象类型；嵌入字符串时会转成文本。
