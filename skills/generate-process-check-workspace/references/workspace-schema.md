# Process Check workspace schema (v5)

输出必须是单个 JSON object，不要加 Markdown 代码围栏，不要注释或尾逗号。

节点只引用库 ID，不要内嵌 `data.actor` / `data.action`，不要使用 `templates`、`actionTemplateId`、`actorTemplateId`。

```json
{
  "version": 5,
  "name": "工作区名称",
  "activeEnvironment": "local",
  "environments": {
    "local": { "baseUrl": "http://127.0.0.1:8080" }
  },
  "variables": {},
  "scenarioGroups": [],
  "apiGroups": [],
  "actorGroups": [],
  "actors": [],
  "apis": [],
  "caseSets": [],
  "scenarios": []
}
```

完整示例见 [../assets/workspace.example.json](../assets/workspace.example.json)。

## 顶层字段

- `version`：必须为 `5`
- `name`：工作区名称
- `activeEnvironment`：对应 `environments` 的键，通常 `local`
- `environments`：每个环境至少一个 `baseUrl`
- `variables`：写入 `shared` 的初始值，可为 `{}`
- `scenarioGroups` / `apiGroups` / `actorGroups`：`{ "id", "name" }[]`，可空
- `actors` / `apis` / `caseSets` / `scenarios`：数组；各组内 `id` 唯一

URL 一律写 `{{env.baseUrl}}/...`，部署地址只放在 `environments`。

## RequestConfig

```json
{
  "method": "POST",
  "url": "{{env.baseUrl}}/resources",
  "headers": {},
  "body": {}
}
```

`method`：`GET` | `POST` | `PUT` | `PATCH` | `DELETE` | `HEAD`。GET/HEAD 不发送 body，查询参数写进 URL。

## actors[]

```json
{
  "id": "actor-supervisor",
  "name": "主管",
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
    "request": {
      "method": "GET",
      "url": "{{env.baseUrl}}/token",
      "headers": {}
    },
    "bindings": [
      {
        "path": "body.data.accessToken",
        "headerName": "Authorization",
        "prefix": "Bearer "
      }
    ]
  },
  "defaultHeaders": {}
}
```

- 第一次执行该 Actor 节点时先登录，Cookie 在同一次运行中复用。
- `auth.enabled` 且 `auth.request.url` 非空：登录后再用同一 Cookie 调 Token 接口，从该响应按 `bindings` 注入 Header。
- `auth.enabled` 且 `request.url` 为空：从**登录响应**按 `bindings` 提取。
- 不要在画布上再放一个「获取 Token」Action。
- 登录请求可用 `{{actor.*}}`、`{{env.*}}`。Token 请求额外可用 `{{login.body.*}}`。
- Action 显式配置同名 Header 时覆盖 Actor 自动值。

无独立 Token 接口、只从登录取 Token：

```json
"auth": {
  "enabled": true,
  "request": { "method": "GET", "url": "", "headers": {} },
  "bindings": [
    { "path": "body.token", "headerName": "Authorization", "prefix": "Bearer " }
  ]
}
```

仅 Cookie、无需 Header 注入：

```json
"auth": {
  "enabled": false,
  "request": { "method": "GET", "url": "", "headers": {} },
  "bindings": []
}
```

## apis[]

```json
{
  "id": "api-create-project",
  "name": "创建项目",
  "request": {
    "method": "POST",
    "url": "{{env.baseUrl}}/projects",
    "headers": {},
    "body": {
      "projectName": "yb-{{random.string}}",
      "approvers": ["manager_b"]
    }
  }
}
```

可选 `defaultAssertions`：用例未写 `assertions` 时回退使用。生成时优先给每条用例写明确断言。

## caseSets[]

```json
{
  "id": "case-set-create-project",
  "name": "创建项目参数验证",
  "apiId": "api-create-project",
  "actorId": "actor-supervisor",
  "cases": [
    {
      "id": "case-normal",
      "name": "正常创建",
      "enabled": true,
      "overrides": {
        "body": {
          "projectName": "yb-{{random.string}}",
          "approvers": ["manager_b"]
        }
      },
      "assertions": [
        { "source": "status", "operator": "equals", "expected": 201 },
        { "source": "body.id", "operator": "exists" }
      ]
    },
    {
      "id": "case-empty-name",
      "name": "名称为空",
      "enabled": true,
      "overrides": { "body": { "projectName": "" } },
      "assertions": [{ "source": "status", "operator": "equals", "expected": 400 }]
    }
  ]
}
```

- `apiId` 必须指向 `apis[]`。
- `actorId` 可省略（匿名）；填写时必须指向 `actors[]`。
- `overrides` 与 API `request` 深度合并；数组整体替换。
- `assertions[].source` 相对于单次响应：`status`、`ok`、`headers`、`body`、`durationMs` 及子路径。
- 每条启用用例独立会话；失败不阻断后续用例。

## scenarios[]

```json
{
  "id": "scenario-happy-path",
  "name": "完整成功链路",
  "description": "主管创建后经理审批",
  "defaultHeaders": {},
  "nodes": [],
  "edges": []
}
```

可选 `groupId` 指向 `scenarioGroups[].id`。

### 节点

- `actor`：`data.actorId`（库中的角色）
- `action`：`data.apiId`；可选 `actorNodeId`、`requestOverride`、`saveAs`、`continueOnFailure`
- `assert`：`data.label`、`actual`、`operator`、`expected`
- `scenario`：`data.scenarioId`（引用另一场景；共享 `steps` / `shared` / Actor 会话）

Action 节点不要内嵌请求体定义；请求写在 `apis[]`。步骤级差异用 `requestOverride`（与 API request 深合并）。

`saveAs: "project"` 把该步响应 **body** 写入 `shared.project`，后续可用 `{{shared.project.id}}`。

`actorNodeId` 指定使用某个 Actor 节点的会话；省略则使用拓扑顺序中最近的 Actor。

### 断言 operator

`equals`、`notEquals`、`exists`、`truthy`、`contains`、`greaterThan`、`matches`。

流程断言的 `actual` / `expected` 都支持模板，例如 `{{steps.create-project.status}}`。

### 边

```json
{ "source": "use-role-a", "target": "create" }
```

场景必须是 DAG。无依赖的同级节点按 `nodes` 数组顺序执行。按执行顺序从左到右摆放，间距约 250px。

## 模板变量

- `env.*`：任意请求
- `actor.*`：登录请求；Actor `defaultHeaders`
- `login.*`：Token 请求
- `steps.<nodeId>.status` / `.ok` / `.headers` / `.body` / `.durationMs`：后续 URL、Header、body、断言
- `shared.*`：被 `saveAs` 或工作区 `variables` 写入后
- `random.string`：8 位 URL-safe 随机串
- `random.uuid`：UUID v4
- `random.timestamp`：当前毫秒时间戳

整段恰好是 `{{steps.create.body.id}}` 时保留原类型；嵌在更大字符串里会转成文本。同一请求内重复引用同一 `random.*` 路径值相同。
