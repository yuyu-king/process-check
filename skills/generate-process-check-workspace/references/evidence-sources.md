# 从原始仓库收集接口证据

按实现与测试优先于注释与猜测。下列位置按常见后端栈搜索；没有的跳过。

## HTTP 接口

- 路由声明：Express/Koa/Fastify `app.(get|post|…)`、Nest `@Controller` + `@Get/@Post`、Spring `@RequestMapping` / `@RestController`、Gin/Echo、FastAPI `@app.` / `APIRouter`、Django `urlpatterns`、Rails `routes.rb`
- OpenAPI / Swagger：`openapi.yaml`、`swagger.json`、springdoc、`@Operation`
- 网关或 BFF 转发规则（仅当它定义对外契约）
- 前端/客户端 SDK 里的路径通常是二手证据，与后端冲突时以后端为准

记录：method、完整 path（含前缀）、path 参数名。

## 请求与校验

- DTO / command / schema：class-validator、Zod、Joi、Bean Validation、Pydantic、JSON Schema
- 手工 `if` / `IllegalArgumentException` / 业务错误码
- 测试里的非法入参与期望 status

记录：字段名（保持原样）、必填、类型、min/max、枚举、格式。失败时的 HTTP status 与 body 形状必须来自实现或测试。

## 响应

- 序列化 DTO、`ResponseEntity`、`res.json`、资源 assembler
- 成功测试的 status 与 JSON 片段
- 错误包装（`{ code, message }`、`ProblemDetail` 等）

后续步骤要用的字段（id、status、token）必须在成功响应里真实存在。

## 鉴权

- 登录路由与请求体（用户名密码、验证码等）
- Session / Cookie 名称
- JWT 或独立 Token 接口；响应里 token 的 JSON 路径
- 注入 Header 名与前缀（`Authorization` + `Bearer ` 最常见，以代码为准）
- 角色 / 权限注解与守卫（决定要几个 Actor，以及 401/403 用例）

Token 配在 Actor `auth`，不要生成「获取 Token」Action 节点。

## 业务流程

- 应用服务 / 编排层里的连续调用
- 状态机、审批枚举、工作流引擎定义
- 已有集成测试、E2E、Postman/Newman 集合
- README 或领域文档中的「先 A 后 B」——仍要回代码确认路径与字段

记录每步：谁调用、method/URL、body、成功 status、写入后续步骤的字段、可观察副作用。

## 环境

- `.env.example`、`application-*.yml`、docker-compose 端口 → `environments.local.baseUrl`
- 找不到时用 `http://127.0.0.1:<TODO_PORT>` 并写入 Assumptions
