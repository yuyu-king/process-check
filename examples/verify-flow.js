import { spawn } from "node:child_process";
import { executeWorkspace } from "../src/engine.js";

const actor = (id, username) => ({
  id,
  name: username,
  variables: { username, password: "demo" },
  login: {
    method: "POST",
    url: "{{env.baseUrl}}/login",
    body: { username: "{{actor.username}}", password: "{{actor.password}}" }
  }
});
const workspace = {
  activeEnvironment: "local",
  environments: { local: { baseUrl: "http://127.0.0.1:4321" } },
  variables: {},
  actors: [actor("a", "supervisor_a"), actor("b", "manager_b"), actor("c", "manager_c")],
  actions: [
    {
      id: "create",
      name: "创建项目",
      request: { method: "POST", url: "{{env.baseUrl}}/projects", body: { approvers: ["manager_b", "manager_c"] } }
    },
    {
      id: "approve",
      name: "审批项目",
      request: { method: "POST", url: "{{env.baseUrl}}/projects/{{steps.created.body.id}}/approve", body: {} }
    }
  ],
  scenarios: [{
    id: "full",
    name: "完整审批",
    nodes: [
      { id: "actor-a", type: "actor", data: { actorId: "a" } },
      { id: "created", type: "action", data: { actionId: "create" } },
      { id: "actor-b", type: "actor", data: { actorId: "b" } },
      { id: "approved-b", type: "action", data: { actionId: "approve" } },
      { id: "actor-c", type: "actor", data: { actorId: "c" } },
      { id: "approved-c", type: "action", data: { actionId: "approve" } },
      { id: "email-sent", type: "assert", data: { actual: "{{steps.approved-c.body.emailSent}}", operator: "equals", expected: true } }
    ],
    edges: [
      ["actor-a", "created"], ["created", "actor-b"], ["actor-b", "approved-b"],
      ["approved-b", "actor-c"], ["actor-c", "approved-c"], ["approved-c", "email-sent"]
    ].map(([source, target]) => ({ source, target }))
  }]
};

const demo = spawn(process.execPath, ["examples/demo-api.js"], { stdio: "ignore" });
try {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await executeWorkspace(workspace, "full");
  if (!result.ok) throw new Error(result.error);
  const logins = result.events.filter((event) => event.type === "actor:success").length;
  const emailSent = result.context.steps["approved-c"].body.emailSent;
  if (logins !== 3 || emailSent !== true) throw new Error("Cookie 隔离或最终断言不符合预期");
  console.log(`验证通过：${logins} 个独立 Actor 登录，最终 emailSent=${emailSent}，共 ${result.events.length} 条事件。`);
} finally {
  demo.kill();
}
