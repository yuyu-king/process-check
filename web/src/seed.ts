import { nanoid } from "nanoid";
import type {
  Actor,
  ActorConfig,
  Api,
  FlowNode,
  FlowNodeData,
  NodeType,
  Scenario,
  Workspace,
} from "./types";

export const uid = (prefix: string) => `${prefix}-${nanoid(6)}`;
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function normalizeAuth(auth?: Partial<Actor["auth"]> | null): Actor["auth"] {
  const request = auth?.request || { method: "GET" as const, url: "", headers: {} };
  let bindings = Array.isArray(auth?.bindings) ? [...auth.bindings] : [];
  if (!bindings.length && (auth?.tokenPath || auth?.headerName)) {
    bindings = [
      {
        path: auth.tokenPath || "body.token",
        headerName: auth.headerName || "Authorization",
        prefix: auth.prefix ?? "Bearer ",
      },
    ];
  }
  return {
    enabled: Boolean(auth?.enabled),
    request: {
      method: request.method || "GET",
      url: request.url || "",
      headers: request.headers || {},
      ...(request.body !== undefined ? { body: request.body } : {}),
    },
    bindings,
  };
}

export function newActor(name = "新角色"): Actor {
  return {
    id: uid("actor"),
    name,
    variables: { username: "", password: "" },
    login: {
      method: "POST",
      url: "{{env.baseUrl}}/login",
      headers: {},
      body: { username: "{{actor.username}}", password: "{{actor.password}}" },
    },
    auth: normalizeAuth({ enabled: false }),
    defaultHeaders: {},
  };
}

export function newApi(name = "新接口"): Api {
  return {
    id: uid("api"),
    name,
    request: { method: "GET", url: "{{env.baseUrl}}/", headers: {}, body: {} },
  };
}

export function newNode(type: NodeType, x: number, y: number, data?: FlowNodeData): FlowNode {
  const id = uid(type);
  if (type === "actor") return { id, type, x, y, data: data || { actorId: "" } };
  if (type === "action") return { id, type, x, y, data: data || { apiId: "" } };
  if (type === "scenario") return { id, type, x, y, data: { scenarioId: "" } };
  return {
    id,
    type,
    x,
    y,
    data: { label: "响应状态正确", actual: "{{steps.action-id.status}}", operator: "equals", expected: 200 },
  };
}

export function newScenario(name: string, groupId?: string): Scenario {
  return { id: uid("scenario"), name, groupId, defaultHeaders: {}, nodes: [], edges: [] };
}

export function actorToConfig(actor: Actor): ActorConfig {
  return {
    name: actor.name,
    variables: actor.variables,
    login: actor.login,
    auth: actor.auth,
  };
}

/** 将任意旧版 workspace 归一到 v5 */
export function normalizeWorkspace(value: unknown): Workspace {
  const raw = (value && typeof value === "object" ? clone(value) : clone(seedWorkspace)) as Record<
    string,
    unknown
  >;

  const actors: Actor[] = Array.isArray(raw.actors) ? (raw.actors as Actor[]) : [];
  const apis: Api[] = Array.isArray(raw.apis) ? (raw.apis as Api[]) : [];
  const actorByKey = new Map<string, string>();
  const apiByKey = new Map<string, string>();

  const ensureActor = (config: ActorConfig, preferredId?: string): string => {
    const key = JSON.stringify({
      name: config.name,
      variables: config.variables,
      login: config.login,
      auth: config.auth,
    });
    if (actorByKey.has(key)) return actorByKey.get(key)!;
    const existing = actors.find((a) => a.id === preferredId);
    if (existing) {
      actorByKey.set(key, existing.id);
      return existing.id;
    }
    const id = preferredId || uid("actor");
    actors.push({
      id,
      name: config.name,
      variables: config.variables || {},
      login: config.login,
      auth: normalizeAuth(config.auth),
      defaultHeaders: (config as Actor).defaultHeaders || {},
    });
    actorByKey.set(key, id);
    return id;
  };

  const ensureApi = (name: string, request: Api["request"], preferredId?: string): string => {
    const key = JSON.stringify({ name, request });
    if (apiByKey.has(key)) return apiByKey.get(key)!;
    const existing = apis.find((a) => a.id === preferredId);
    if (existing) {
      apiByKey.set(key, existing.id);
      return existing.id;
    }
    const id = preferredId || uid("api");
    apis.push({ id, name, request });
    apiByKey.set(key, id);
    return id;
  };

  // templates → library
  const templates = raw.templates as
    | { actors?: { id: string; name: string; config: ActorConfig }[]; actions?: { id: string; name: string; config: { name: string; request: Api["request"] } }[] }
    | undefined;
  for (const t of templates?.actors || []) {
    if (t?.config) ensureActor(t.config, t.id);
  }
  for (const t of templates?.actions || []) {
    if (t?.config?.request) ensureApi(t.config.name || t.name, t.config.request, t.id);
  }

  // index existing library ids
  for (const a of actors) {
    a.auth = normalizeAuth(a.auth);
    a.defaultHeaders ||= {};
    a.variables ||= {};
    actorByKey.set(a.id, a.id);
  }
  for (const a of apis) apiByKey.set(a.id, a.id);

  const scenarios = (Array.isArray(raw.scenarios) ? raw.scenarios : []) as Scenario[];
  for (const scenario of scenarios) {
    scenario.defaultHeaders ||= {};
    scenario.nodes ||= [];
    scenario.edges ||= [];
    for (const node of scenario.nodes) {
      const data = node.data as FlowNodeData & {
        actor?: ActorConfig;
        action?: { name: string; request: Api["request"] };
      };
      if (node.type === "actor") {
        if (!data.actorId && data.actor) {
          data.actorId = ensureActor(data.actor);
        }
        delete data.actor;
      }
      if (node.type === "action") {
        if (!data.apiId && data.action?.request) {
          data.apiId = ensureApi(data.action.name || "接口", data.action.request);
        }
        delete data.action;
      }
      node.data = data;
    }
  }

  // caseSets migration
  const caseSetsRaw = Array.isArray(raw.caseSets) ? (raw.caseSets as Record<string, unknown>[]) : [];
  const caseSets = caseSetsRaw.map((cs) => {
    const apiId =
      (cs.apiId as string) ||
      (cs.actionTemplateId as string) ||
      "";
    const actorId =
      (cs.actorId as string) ||
      (cs.actorTemplateId as string) ||
      undefined;
    return {
      id: (cs.id as string) || uid("caseset"),
      name: (cs.name as string) || "未命名用例集",
      apiId,
      actorId: actorId || undefined,
      cases: Array.isArray(cs.cases) ? cs.cases : [],
    };
  });

  // groups
  const legacyGroups = Array.isArray(raw.groups) ? (raw.groups as Workspace["scenarioGroups"]) : [];
  const scenarioGroups = Array.isArray(raw.scenarioGroups)
    ? (raw.scenarioGroups as Workspace["scenarioGroups"])
    : legacyGroups;
  const apiGroups = Array.isArray(raw.apiGroups) ? (raw.apiGroups as Workspace["apiGroups"]) : [];
  const actorGroups = Array.isArray(raw.actorGroups)
    ? (raw.actorGroups as Workspace["actorGroups"])
    : [];

  return {
    version: 5,
    name: (raw.name as string) || "未命名工作区",
    activeEnvironment: (raw.activeEnvironment as string) || "local",
    environments: (raw.environments as Workspace["environments"]) || { local: { baseUrl: "" } },
    variables: (raw.variables as Workspace["variables"]) || {},
    scenarioGroups,
    apiGroups,
    actorGroups,
    actors,
    apis,
    caseSets,
    scenarios,
  };
}

export const seedWorkspace: Workspace = normalizeWorkspace({
  version: 5,
  name: "项目审批链路验证",
  activeEnvironment: "local",
  environments: { local: { baseUrl: "http://127.0.0.1:4321" } },
  variables: {},
  scenarioGroups: [{ id: "group-approval", name: "审批流程" }],
  apiGroups: [],
  actorGroups: [],
  actors: [
    {
      id: "actor-supervisor",
      name: "稽查主管 A",
      variables: { username: "supervisor_a", password: "change-me" },
      login: {
        method: "POST",
        url: "{{env.baseUrl}}/login",
        headers: {},
        body: { username: "{{actor.username}}", password: "{{actor.password}}" },
      },
      auth: {
        enabled: false,
        request: { method: "GET", url: "", headers: {} },
        tokenPath: "body.token",
        headerName: "Authorization",
        prefix: "Bearer ",
      },
    },
    {
      id: "actor-manager-b",
      name: "稽查经理 B",
      variables: { username: "manager_b", password: "change-me" },
      login: {
        method: "POST",
        url: "{{env.baseUrl}}/login",
        headers: {},
        body: { username: "{{actor.username}}", password: "{{actor.password}}" },
      },
      auth: {
        enabled: false,
        request: { method: "GET", url: "", headers: {} },
        tokenPath: "body.token",
        headerName: "Authorization",
        prefix: "Bearer ",
      },
    },
  ],
  apis: [
    {
      id: "api-create-project",
      name: "创建项目",
      request: {
        method: "POST",
        url: "{{env.baseUrl}}/projects",
        headers: {},
        body: { name: "自动化验证项目 {{random.string}}", approvers: ["manager_b", "manager_c"] },
      },
    },
    {
      id: "api-approve",
      name: "审批项目",
      request: {
        method: "POST",
        url: "{{env.baseUrl}}/projects/{{shared.project.id}}/approve",
        headers: {},
        body: { approved: true },
      },
    },
  ],
  caseSets: [],
  scenarios: [
    {
      id: "scenario-full-approval",
      name: "主管创建、两位经理审批",
      groupId: "group-approval",
      description: "验证创建项目后需两位经理审批，最后触发邮件通知。",
      defaultHeaders: { "X-Client": "process-check" },
      nodes: [
        { id: "use-a", type: "actor", x: 40, y: 160, data: { actorId: "actor-supervisor" } },
        {
          id: "create-project",
          type: "action",
          x: 340,
          y: 160,
          data: { apiId: "api-create-project", saveAs: "project" },
        },
        {
          id: "assert-create",
          type: "assert",
          x: 640,
          y: 160,
          data: { label: "创建成功", actual: "{{steps.create-project.status}}", operator: "equals", expected: 201 },
        },
        { id: "use-b", type: "actor", x: 40, y: 360, data: { actorId: "actor-manager-b" } },
        {
          id: "approve-b",
          type: "action",
          x: 340,
          y: 360,
          data: { apiId: "api-approve", actorNodeId: "use-b" },
        },
        {
          id: "assert-mail",
          type: "assert",
          x: 640,
          y: 360,
          data: {
            label: "审批触发邮件",
            actual: "{{steps.approve-b.body.emailSent}}",
            operator: "equals",
            expected: true,
          },
        },
      ],
      edges: [
        { source: "use-a", target: "create-project" },
        { source: "create-project", target: "assert-create" },
        { source: "assert-create", target: "use-b" },
        { source: "use-b", target: "approve-b" },
        { source: "approve-b", target: "assert-mail" },
      ],
    },
  ],
});
