const TEMPLATE = /\{\{\s*([^}]+?)\s*\}\}/g;

export class FlowError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "FlowError";
    this.details = details;
  }
}

export function validateWorkspace(workspace) {
  const errors = [];
  if (!workspace || typeof workspace !== "object") errors.push("根对象必须是 JSON object");
  if (!Array.isArray(workspace?.scenarios)) errors.push("scenarios 必须是数组");
  if (workspace?.actors !== undefined && !Array.isArray(workspace.actors)) errors.push("actors 必须是数组");
  if (workspace?.actions !== undefined && !Array.isArray(workspace.actions)) errors.push("actions 必须是数组");
  const unique = (items, label) => {
    const seen = new Set();
    for (const item of items || []) {
      if (!item?.id) errors.push(`${label} 中存在缺少 id 的项目`);
      else if (seen.has(item.id)) errors.push(`${label} 中 id 重复: ${item.id}`);
      else seen.add(item.id);
    }
  };
  unique(workspace?.actors || [], "actors");
  unique(workspace?.actions || [], "actions");
  unique(workspace?.scenarios, "scenarios");
  for (const scenario of workspace?.scenarios || []) {
    unique(scenario.nodes, `scenario:${scenario.id}.nodes`);
    const nodeIds = new Set((scenario.nodes || []).map((node) => node.id));
    for (const edge of scenario.edges || []) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        errors.push(`scenario:${scenario.id} 的连线引用了不存在的节点`);
      }
    }
  }
  return errors;
}

function pathTokens(path) {
  return String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

export function readPath(value, path) {
  return pathTokens(path).reduce((current, key) => current?.[key], value);
}

export function renderTemplate(value, context) {
  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, context)]));
  }
  if (typeof value !== "string") return value;
  const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (exact) return readPath(context, exact[1]);
  return value.replace(TEMPLATE, (_, path) => {
    const resolved = readPath(context, path);
    if (resolved === undefined) throw new FlowError(`变量不存在: ${path}`);
    return typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved);
  });
}

function topologicalNodes(scenario) {
  const nodes = scenario.nodes || [];
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of scenario.edges || []) {
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const ready = nodes.filter((node) => incoming.get(node.id) === 0);
  ready.sort((a, b) => order.get(a.id) - order.get(b.id));
  const result = [];
  while (ready.length) {
    const node = ready.shift();
    result.push(node);
    for (const target of outgoing.get(node.id) || []) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) {
        ready.push(nodes.find((item) => item.id === target));
        ready.sort((a, b) => order.get(a.id) - order.get(b.id));
      }
    }
  }
  if (result.length !== nodes.length) throw new FlowError(`场景 ${scenario.name || scenario.id} 存在环路`);
  return result;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function absorbCookies(headers, jar) {
  const values = headers.getSetCookie?.() || (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}

async function httpRequest(config, context, jar, fetchImpl) {
  const rendered = renderTemplate(config, context);
  const method = String(rendered.method || "GET").toUpperCase();
  const headers = { ...(rendered.headers || {}) };
  if (jar.size && !headers.Cookie && !headers.cookie) headers.Cookie = cookieHeader(jar);
  let body;
  if (!["GET", "HEAD"].includes(method) && rendered.body !== undefined && rendered.body !== null) {
    if (typeof rendered.body === "string") body = rendered.body;
    else {
      body = JSON.stringify(rendered.body);
      if (!headers["content-type"] && !headers["Content-Type"]) headers["content-type"] = "application/json";
    }
  }
  const startedAt = Date.now();
  const response = await fetchImpl(rendered.url, {
    method,
    headers,
    body,
    redirect: rendered.redirect || "follow"
  });
  absorbCookies(response.headers, jar);
  const text = await response.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  return {
    request: { method, url: rendered.url, headers: maskHeaders(headers), body: ["GET", "HEAD"].includes(method) ? undefined : rendered.body },
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
    durationMs: Date.now() - startedAt
  };
}

function maskHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) =>
    /authorization|cookie|token|secret/i.test(key) ? [key, "***"] : [key, value]));
}

function assertionPass(operator, actual, expected) {
  switch (operator) {
    case "equals": return Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
    case "notEquals": return !assertionPass("equals", actual, expected);
    case "exists": return actual !== undefined && actual !== null;
    case "truthy": return Boolean(actual);
    case "contains": return typeof actual === "string" || Array.isArray(actual)
      ? actual.includes(expected)
      : actual && typeof actual === "object" ? expected in actual : false;
    case "greaterThan": return Number(actual) > Number(expected);
    case "matches": return new RegExp(expected).test(String(actual));
    default: throw new FlowError(`不支持的断言操作符: ${operator}`);
  }
}

export async function executeWorkspace(workspace, scenarioId, options = {}) {
  const errors = validateWorkspace(workspace);
  if (errors.length) throw new FlowError("工作区 JSON 无效", { errors });
  const actors = new Map((workspace.actors || []).map((item) => [item.id, item]));
  const actions = new Map((workspace.actions || []).map((item) => [item.id, item]));
  const scenarios = new Map(workspace.scenarios.map((item) => [item.id, item]));
  const fetchImpl = options.fetchImpl || fetch;
  const sessions = new Map();
  const context = {
    env: workspace.environments?.[workspace.activeEnvironment || "local"] || {},
    shared: structuredClone(workspace.variables || {}),
    steps: {},
    actors: {}
  };
  const events = [];
  let sequence = 0;
  const log = (event) => events.push({ sequence: ++sequence, timestamp: new Date().toISOString(), ...event });

  async function ensureActor(sessionKey, actor) {
    if (!actor) throw new FlowError(`Actor 配置不存在: ${sessionKey}`);
    if (!sessions.has(sessionKey)) sessions.set(sessionKey, { jar: new Map(), loggedIn: false });
    const session = sessions.get(sessionKey);
    if (session.loggedIn || !actor.login?.url) return session;
    log({ type: "actor:start", actorId: sessionKey, label: actor.name });
    const result = await httpRequest(actor.login, { ...context, actor: actor.variables || {} }, session.jar, fetchImpl);
    context.actors[sessionKey] = { login: result };
    if (!result.ok) throw new FlowError(`Actor ${actor.name} 登录失败: HTTP ${result.status}`, { result });
    session.loggedIn = true;
    log({ type: "actor:success", actorId: sessionKey, label: actor.name, result });
    return session;
  }

  async function runScenario(id, stack = []) {
    if (stack.includes(id)) throw new FlowError(`场景递归引用: ${[...stack, id].join(" -> ")}`);
    const scenario = scenarios.get(id);
    if (!scenario) throw new FlowError(`场景不存在: ${id}`);
    log({ type: "scenario:start", scenarioId: id, label: scenario.name });
    let currentActor = null;
    const actorNodes = new Map();
    for (const node of topologicalNodes(scenario)) {
      try {
        if (node.type === "actor") {
          const actor = node.data?.actor || actors.get(node.data?.actorId);
          const sessionKey = node.data?.actor ? node.id : node.data?.actorId;
          currentActor = { sessionKey, actor };
          actorNodes.set(node.id, currentActor);
          await ensureActor(sessionKey, actor);
        } else if (node.type === "action") {
          const action = node.data?.action || actions.get(node.data?.actionId);
          if (!action) throw new FlowError(`Action 配置不存在: ${node.id}`);
          const selectedActor = node.data?.actorNodeId ? actorNodes.get(node.data.actorNodeId) : currentActor;
          if (!selectedActor) throw new FlowError(`Action ${action.name} 没有可用 Actor`);
          const { sessionKey, actor } = selectedActor;
          const session = await ensureActor(sessionKey, actor);
          log({ type: "action:start", nodeId: node.id, actorId: sessionKey, label: action.name });
          const result = await httpRequest({ ...action.request, ...(node.data?.requestOverride || {}) }, context, session.jar, fetchImpl);
          context.steps[node.id] = result;
          if (node.data?.saveAs) context.shared[node.data.saveAs] = result.body;
          log({ type: result.ok ? "action:success" : "action:failure", nodeId: node.id, actorId: sessionKey, label: action.name, result });
          if (!result.ok && node.data?.continueOnFailure !== true) {
            throw new FlowError(`Action ${action.name} 失败: HTTP ${result.status}`, { result });
          }
        } else if (node.type === "assert") {
          const actual = renderTemplate(node.data?.actual, context);
          const expected = renderTemplate(node.data?.expected, context);
          const operator = node.data?.operator || "equals";
          const passed = assertionPass(operator, actual, expected);
          context.steps[node.id] = { passed, actual, expected, operator };
          log({ type: passed ? "assert:success" : "assert:failure", nodeId: node.id, label: node.data?.label || "断言", result: context.steps[node.id] });
          if (!passed) throw new FlowError(`断言失败: ${node.data?.label || node.id}`, context.steps[node.id]);
        } else if (node.type === "scenario") {
          await runScenario(node.data?.scenarioId, [...stack, id]);
        }
      } catch (error) {
        log({ type: "node:error", nodeId: node.id, label: node.data?.label || node.id, error: error.message, details: error.details });
        throw error;
      }
    }
    log({ type: "scenario:success", scenarioId: id, label: scenario.name });
  }

  try {
    await runScenario(scenarioId);
    return { ok: true, context, events };
  } catch (error) {
    return { ok: false, error: error.message, details: error.details, context, events };
  }
}
