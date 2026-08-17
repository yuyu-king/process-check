import { randomBytes, randomUUID } from "node:crypto";

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
  if (workspace?.apis !== undefined && !Array.isArray(workspace.apis)) errors.push("apis 必须是数组");
  if (workspace?.actions !== undefined && !Array.isArray(workspace.actions)) errors.push("actions 必须是数组");
  if (workspace?.caseSets !== undefined && !Array.isArray(workspace.caseSets)) errors.push("caseSets 必须是数组");
  const unique = (items, label) => {
    const seen = new Set();
    for (const item of items || []) {
      if (!item?.id) errors.push(`${label} 中存在缺少 id 的项目`);
      else if (seen.has(item.id)) errors.push(`${label} 中 id 重复: ${item.id}`);
      else seen.add(item.id);
    }
  };
  unique(workspace?.actors || [], "actors");
  unique(workspace?.apis || [], "apis");
  unique(workspace?.actions || [], "actions");
  unique(workspace?.scenarios, "scenarios");
  unique(workspace?.caseSets || [], "caseSets");
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

function mergeObjects(base, override) {
  if (Array.isArray(override)) return structuredClone(override);
  if (!override || typeof override !== "object") return override;
  const result = base && typeof base === "object" && !Array.isArray(base) ? structuredClone(base) : {};
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergeObjects(result[key], value)
      : structuredClone(value);
  }
  return result;
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

function createRandomValues() {
  return {
    string: randomBytes(6).toString("base64url"),
    uuid: randomUUID(),
    timestamp: Date.now()
  };
}

async function httpRequest(config, context, jar, fetchImpl) {
  const rendered = renderTemplate(config, { ...context, random: createRandomValues() });
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

function resolveAuthBindings(auth) {
  if (Array.isArray(auth?.bindings) && auth.bindings.length) return auth.bindings;
  if (auth?.tokenPath || auth?.headerName) {
    return [{
      path: auth.tokenPath || "body.token",
      headerName: auth.headerName || "Authorization",
      prefix: auth.prefix ?? "Bearer "
    }];
  }
  return [];
}

function buildActorHeaders(actor, authResult, loginResult, context) {
  const staticHeaders = actor?.defaultHeaders
    ? renderTemplate(actor.defaultHeaders, { ...context, actor: actor.variables || {} })
    : {};
  const auth = actor?.auth;
  if (!auth?.enabled) return staticHeaders || {};

  const hasTokenRequest = Boolean(auth.request?.url);
  const tokenSource = hasTokenRequest ? authResult : loginResult;
  const sourceLabel = hasTokenRequest ? "引导请求（Token）响应" : "登录响应";
  const bindings = resolveAuthBindings(auth);
  const injected = {};
  for (const binding of bindings) {
    const path = binding.path || "body.token";
    const token = readPath(tokenSource, path);
    if (token === undefined || token === null || token === "") {
      throw new FlowError(`Actor ${actor.name} 无法从${sourceLabel}提取: ${path}`);
    }
    injected[binding.headerName || "Authorization"] = `${binding.prefix || ""}${token}`;
  }
  return mergeHeaders(staticHeaders, injected);
}

function mergeHeaders(...sources) {
  const result = {};
  const keys = new Map();
  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      const normalized = key.toLowerCase();
      const previous = keys.get(normalized);
      if (previous && previous !== key) delete result[previous];
      keys.set(normalized, key);
      result[key] = value;
    }
  }
  return result;
}

function resolveAction(node, apis, actions) {
  if (node.data?.action) return node.data.action;
  if (node.data?.apiId && apis.has(node.data.apiId)) {
    const api = apis.get(node.data.apiId);
    return { name: api.name, request: api.request };
  }
  if (node.data?.actionId && actions.has(node.data.actionId)) return actions.get(node.data.actionId);
  return null;
}

function resolveActor(node, actors) {
  if (node.data?.actor) return node.data.actor;
  if (node.data?.actorId) return actors.get(node.data.actorId) || null;
  return null;
}

export async function executeWorkspace(workspace, scenarioId, options = {}) {
  const errors = validateWorkspace(workspace);
  if (errors.length) throw new FlowError("工作区 JSON 无效", { errors });
  const actors = new Map((workspace.actors || []).map((item) => [item.id, item]));
  const apis = new Map((workspace.apis || []).map((item) => [item.id, item]));
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
  const dynamicDefaultHeaders = {};
  const ANON_KEY = "__anonymous__";

  async function ensureActor(sessionKey, actor) {
    if (!sessions.has(sessionKey)) sessions.set(sessionKey, { jar: new Map(), loggedIn: false, ready: false });
    const session = sessions.get(sessionKey);
    if (session.ready) return session;
    if (!actor) {
      session.ready = true;
      return session;
    }
    context.actors[sessionKey] ||= {};
    if (!session.loggedIn && actor.login?.url) {
      log({ type: "actor:start", actorId: sessionKey, label: actor.name });
      const result = await httpRequest(actor.login, { ...context, actor: actor.variables || {} }, session.jar, fetchImpl);
      context.actors[sessionKey].login = result;
      if (!result.ok) throw new FlowError(`Actor ${actor.name} 登录失败: HTTP ${result.status}`, { result });
      session.loggedIn = true;
      log({ type: "actor:success", actorId: sessionKey, label: actor.name, result });
    }
    if (actor.auth?.enabled && actor.auth.request?.url) {
      log({ type: "actor:auth:start", actorId: sessionKey, label: `${actor.name} 获取 Token` });
      const result = await httpRequest(
        actor.auth.request,
        { ...context, actor: actor.variables || {}, login: context.actors[sessionKey].login },
        session.jar,
        fetchImpl
      );
      context.actors[sessionKey].auth = result;
      if (!result.ok) throw new FlowError(`Actor ${actor.name} 获取 Token 失败: HTTP ${result.status}`, { result });
      log({ type: "actor:auth:success", actorId: sessionKey, label: `${actor.name} 获取 Token`, result });
    } else if (actor.auth?.enabled && !actor.auth.request?.url) {
      // Token 从登录响应提取：确保已登录
      if (!session.loggedIn && actor.login?.url) {
        /* already handled above */
      }
    }
    session.ready = true;
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
          const actor = resolveActor(node, actors);
          if (!actor) throw new FlowError(`角色不存在: ${node.data?.actorId || node.id}`);
          const sessionKey = node.id;
          currentActor = { sessionKey, actor };
          actorNodes.set(node.id, currentActor);
          await ensureActor(sessionKey, actor);
        } else if (node.type === "action") {
          const action = resolveAction(node, apis, actions);
          if (!action) throw new FlowError(`API 不存在: ${node.data?.apiId || node.id}`);
          const selectedActor = node.data?.actorNodeId
            ? actorNodes.get(node.data.actorNodeId)
            : currentActor;
          let sessionKey;
          let actor;
          if (selectedActor) {
            ({ sessionKey, actor } = selectedActor);
            await ensureActor(sessionKey, actor);
          } else {
            sessionKey = ANON_KEY;
            actor = null;
            await ensureActor(sessionKey, null);
          }
          const session = sessions.get(sessionKey);
          log({ type: "action:start", nodeId: node.id, actorId: sessionKey, label: action.name });
          const requestOverride = node.data?.requestOverride || {};
          const mergedRequest = mergeObjects(action.request || {}, requestOverride);
          const requestConfig = {
            ...mergedRequest,
            headers: mergeHeaders(
              scenario.defaultHeaders || {},
              dynamicDefaultHeaders,
              actor
                ? buildActorHeaders(
                  actor,
                  context.actors[sessionKey]?.auth,
                  context.actors[sessionKey]?.login,
                  context
                )
                : {},
              action.request?.headers,
              requestOverride.headers
            )
          };
          const result = await httpRequest(requestConfig, context, session.jar, fetchImpl);
          context.steps[node.id] = result;
          if (node.data?.saveAs) context.shared[node.data.saveAs] = result.body;
          if (node.data?.setDefaultHeaders && typeof node.data.setDefaultHeaders === "object") {
            const injected = renderTemplate(node.data.setDefaultHeaders, context);
            Object.assign(dynamicDefaultHeaders, injected);
          }
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

function buildCaseLayers(execution) {
  const events = execution.events || [];
  const steps = execution.context?.steps || {};
  const httpFrom = (result) => {
    if (!result || typeof result !== "object") return null;
    return {
      request: result.request,
      status: result.status,
      ok: result.ok,
      headers: result.headers,
      body: result.body,
      durationMs: result.durationMs
    };
  };

  let login = null;
  let auth = null;
  for (const event of events) {
    if (event.type === "actor:success" || event.type === "actor:start") {
      if (event.result || event.type === "actor:success") {
        login = {
          label: event.label || "登录",
          ok: event.type === "actor:success",
          ...httpFrom(event.result)
        };
      }
    }
    if (event.type === "actor:failure" || (event.type === "node:error" && event.nodeId === "case-actor" && !login)) {
      login = {
        label: event.label || "登录",
        ok: false,
        error: event.error,
        ...(httpFrom(event.result) || httpFrom(event.details?.result) || {})
      };
    }
    if (event.type === "actor:auth:success" || event.type === "actor:auth:start") {
      if (event.result || event.type === "actor:auth:success") {
        auth = {
          label: event.label || "获取 Token",
          ok: event.type === "actor:auth:success",
          ...httpFrom(event.result)
        };
      }
    }
    if (event.type === "actor:auth:failure") {
      auth = {
        label: event.label || "获取 Token",
        ok: false,
        error: event.error,
        ...httpFrom(event.result)
      };
    }
  }

  const callStep = steps.request;
  const callEvent = events.find((e) => e.nodeId === "request" && (e.type.startsWith("action:") || e.type === "node:error"));
  const call = callStep
    ? {
        label: callEvent?.label || "接口调用",
        ok: callStep.ok !== false && !callEvent?.type?.includes("failure"),
        request: callStep.request,
        status: callStep.status,
        headers: callStep.headers,
        body: callStep.body,
        durationMs: callStep.durationMs,
        error: callEvent?.error
      }
    : callEvent
      ? {
          label: callEvent.label || "接口调用",
          ok: false,
          error: callEvent.error,
          ...httpFrom(callEvent.result)
        }
      : null;

  const assertions = Object.entries(steps)
    .filter(([key, item]) => key.startsWith("assert-") && item && typeof item === "object" && "passed" in item)
    .map(([key, item]) => {
      const ev = events.find((e) => e.nodeId === key);
      return {
        id: key,
        label: ev?.label || key,
        passed: item.passed,
        operator: item.operator,
        actual: item.actual,
        expected: item.expected
      };
    });

  return { login, auth, call, assertions };
}

export async function executeCaseSet(workspace, caseSetId, options = {}) {
  const errors = validateWorkspace(workspace);
  if (errors.length) throw new FlowError("工作区 JSON 无效", { errors });
  const caseSet = (workspace.caseSets || []).find((item) => item.id === caseSetId);
  if (!caseSet) throw new FlowError(`接口用例集不存在: ${caseSetId}`);

  // v5: apiId / actorId；兼容旧 templates
  const apiId = caseSet.apiId || caseSet.actionTemplateId;
  const actorId = caseSet.actorId || caseSet.actorTemplateId || "";
  let api = (workspace.apis || []).find((item) => item.id === apiId);
  if (!api) {
    const actionTemplate = (workspace.templates?.actions || []).find((item) => item.id === apiId);
    if (actionTemplate?.config) {
      api = { id: apiId, name: actionTemplate.config.name, request: actionTemplate.config.request };
    }
  }
  if (!api?.request) throw new FlowError(`接口用例集未选择有效的 API: ${caseSet.name || caseSet.id}`);

  let actor = actorId ? (workspace.actors || []).find((item) => item.id === actorId) : null;
  if (!actor && actorId) {
    const actorTemplate = (workspace.templates?.actors || []).find((item) => item.id === actorId);
    if (actorTemplate?.config) actor = { id: actorId, ...actorTemplate.config };
  }

  const caseIdFilter = Array.isArray(options.caseIds) && options.caseIds.length
    ? new Set(options.caseIds)
    : null;
  const enabledCases = (caseSet.cases || []).filter((item) => {
    if (caseIdFilter) return caseIdFilter.has(item.id);
    return item.enabled !== false;
  });
  if (caseIdFilter && enabledCases.length === 0) {
    throw new FlowError(`未找到要执行的用例: ${[...caseIdFilter].join(", ")}`);
  }

  const results = [];
  for (const testCase of enabledCases) {
    const assertions = testCase.assertions?.length
      ? testCase.assertions
      : (api.defaultAssertions?.length
        ? api.defaultAssertions
        : [{ source: "ok", operator: "equals", expected: true }]);
    const nodes = [];
    const edges = [];
    if (actor) {
      nodes.push({ id: "case-actor", type: "actor", data: { actorId: actor.id } });
    }
    nodes.push({
      id: "request",
      type: "action",
      data: {
        apiId: api.id,
        requestOverride: testCase.overrides || {},
        continueOnFailure: true,
        ...(actor ? { actorNodeId: "case-actor" } : {})
      }
    });
    if (actor) edges.push({ source: "case-actor", target: "request" });
    for (let index = 0; index < assertions.length; index += 1) {
      const assertion = assertions[index];
      const assertId = `assert-${index + 1}`;
      nodes.push({
        id: assertId,
        type: "assert",
        data: {
          label: assertion.label || `${assertion.source || "ok"} ${assertion.operator || "equals"}`,
          actual: `{{steps.request.${assertion.source || "ok"}}}`,
          operator: assertion.operator || "equals",
          expected: assertion.expected
        }
      });
      edges.push({
        source: index === 0 ? "request" : `assert-${index}`,
        target: assertId
      });
    }
    const syntheticScenarioId = `case-run-${testCase.id}`;
    const executionWorkspace = {
      ...structuredClone(workspace),
      actors: actor
        ? [...(workspace.actors || []).filter((a) => a.id !== actor.id), structuredClone(actor)]
        : (workspace.actors || []),
      apis: [...(workspace.apis || []).filter((a) => a.id !== api.id), structuredClone(api)],
      scenarios: [{
        id: syntheticScenarioId,
        name: `${caseSet.name} / ${testCase.name}`,
        defaultHeaders: {},
        nodes,
        edges
      }]
    };
    const execution = await executeWorkspace(executionWorkspace, syntheticScenarioId, options);
    const layers = buildCaseLayers(execution);
    results.push({
      id: testCase.id,
      name: testCase.name,
      ok: execution.ok,
      error: execution.error,
      details: execution.details,
      response: execution.context?.steps?.request,
      assertions: layers.assertions,
      layers,
      events: execution.events
    });
  }

  const passed = results.filter((item) => item.ok).length;
  const skipped = caseIdFilter
    ? (caseSet.cases || []).length - enabledCases.length
    : (caseSet.cases || []).length - enabledCases.length;
  return {
    ok: results.length > 0 && passed === results.length,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      skipped
    },
    cases: results
  };
}
