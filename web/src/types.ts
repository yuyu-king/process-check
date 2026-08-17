export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type Json = Record<string, unknown>;

export interface RequestConfig {
  method: HttpMethod;
  url: string;
  headers: Json;
  body?: unknown;
}

/** 角色 / 账号：登录拿 cookie，或注入鉴权 header */
export interface HeaderBinding {
  path: string;
  headerName: string;
  prefix?: string;
}

export interface ActorAuth {
  enabled: boolean;
  request: RequestConfig;
  /** 从引导请求（或兼容：登录）响应注入的 Header */
  bindings: HeaderBinding[];
  /** @deprecated 迁移为 bindings[0] */
  tokenPath?: string;
  headerName?: string;
  prefix?: string;
}

export interface Actor {
  id: string;
  name: string;
  groupId?: string;
  variables: Json;
  login: RequestConfig;
  auth: ActorAuth;
  /** 该角色后续请求自动带上的静态头（Referer / Origin 等） */
  defaultHeaders?: Json;
}

export interface Api {
  id: string;
  name: string;
  groupId?: string;
  request: RequestConfig;
  defaultAssertions?: Assertion[];
}

export type NodeType = "actor" | "action" | "assert" | "scenario";

export type AssertOperator =
  | "equals"
  | "notEquals"
  | "exists"
  | "truthy"
  | "contains"
  | "greaterThan"
  | "matches";

export interface FlowNodeData {
  /** 引用角色库 */
  actorId?: string;
  /** 引用 API 库 */
  apiId?: string;
  /** 指定流程中的角色节点（覆盖「最近角色」） */
  actorNodeId?: string;
  /** 步骤级请求覆盖（UI 仅编辑 body，深合并到 API.request） */
  requestOverride?: Partial<RequestConfig> & Json;
  saveAs?: string;
  continueOnFailure?: boolean;
  /** 执行后把返回值写入场景默认 header */
  setDefaultHeaders?: Json;
  // assert
  label?: string;
  actual?: string;
  operator?: AssertOperator;
  expected?: unknown;
  // scenario ref
  scenarioId?: string;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  data: FlowNodeData;
}

export interface FlowEdge {
  source: string;
  target: string;
}

export interface Scenario {
  id: string;
  name: string;
  groupId?: string;
  description?: string;
  defaultHeaders: Json;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Group {
  id: string;
  name: string;
}

export interface Assertion {
  label?: string;
  source?: string;
  operator?: AssertOperator;
  expected?: unknown;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  overrides: Json;
  assertions: Assertion[];
}

export interface CaseSet {
  id: string;
  name: string;
  apiId: string;
  actorId?: string;
  cases: TestCase[];
}

export interface Environment {
  baseUrl?: string;
  [key: string]: unknown;
}

export interface Workspace {
  version: number;
  name: string;
  activeEnvironment: string;
  environments: Record<string, Environment>;
  variables: Json;
  scenarioGroups: Group[];
  apiGroups: Group[];
  actorGroups: Group[];
  actors: Actor[];
  apis: Api[];
  caseSets: CaseSet[];
  scenarios: Scenario[];
}

/** 引擎回传的执行事件 */
export interface RunEvent {
  sequence: number;
  timestamp: string;
  type: string;
  label?: string;
  nodeId?: string;
  actorId?: string;
  scenarioId?: string;
  error?: string;
  details?: unknown;
  result?: unknown;
}

export interface RunResult {
  ok: boolean;
  error?: string;
  details?: unknown;
  context?: unknown;
  events?: RunEvent[];
}

export interface CaseLayerHttp {
  label?: string;
  ok?: boolean;
  error?: string;
  request?: unknown;
  status?: number;
  headers?: unknown;
  body?: unknown;
  durationMs?: number;
}

export interface CaseAssertionResult {
  id?: string;
  label?: string;
  passed: boolean;
  operator?: string;
  actual?: unknown;
  expected?: unknown;
}

export interface CaseRunLayers {
  login: CaseLayerHttp | null;
  auth: CaseLayerHttp | null;
  call: CaseLayerHttp | null;
  assertions: CaseAssertionResult[];
}

export interface CaseRunResult {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
  details?: unknown;
  response?: unknown;
  assertions?: CaseAssertionResult[];
  layers?: CaseRunLayers;
  events?: RunEvent[];
}

export interface CaseSetRunResult {
  ok: boolean;
  summary: { total: number; passed: number; failed: number; skipped: number };
  cases: CaseRunResult[];
}

/** @deprecated 兼容旧类型别名 */
export type ActorConfig = Omit<Actor, "id" | "groupId">;
export type ActionConfig = { name: string; request: RequestConfig };
