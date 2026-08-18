#!/usr/bin/env node
/**
 * Structural validator for Process Check v5 workspace JSON.
 * Does not execute HTTP or depend on the process-check engine.
 *
 * Usage: node validate-workspace.mjs <workspace.json>
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
const OPERATORS = new Set([
  "equals",
  "notEquals",
  "exists",
  "truthy",
  "contains",
  "greaterThan",
  "matches"
]);
const NODE_TYPES = new Set(["actor", "action", "assert", "scenario"]);

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uniqueIds(items, label) {
  if (!Array.isArray(items)) {
    fail(`${label} 必须是数组`);
    return new Set();
  }
  const seen = new Set();
  for (const item of items) {
    if (!isObject(item)) {
      fail(`${label} 中存在非对象项`);
      continue;
    }
    if (!item.id || typeof item.id !== "string") fail(`${label} 中存在缺少 id 的项目`);
    else if (seen.has(item.id)) fail(`${label} 中 id 重复: ${item.id}`);
    else seen.add(item.id);
  }
  return seen;
}

function checkRequest(request, label, { allowEmptyUrl = false } = {}) {
  if (!isObject(request)) {
    fail(`${label} 缺少 request 对象`);
    return;
  }
  const method = String(request.method || "").toUpperCase();
  if (!METHODS.has(method)) fail(`${label} method 无效: ${request.method}`);
  if (!allowEmptyUrl && (!request.url || typeof request.url !== "string")) {
    fail(`${label} 缺少 url`);
  }
  if (request.headers !== undefined && !isObject(request.headers)) {
    fail(`${label} headers 必须是对象`);
  }
  if (["GET", "HEAD"].includes(method) && request.body !== undefined && request.body !== null) {
    warn(`${label} 为 ${method}，执行器会忽略 body；查询参数应写入 URL`);
  }
}

function checkActor(actor) {
  const label = `actors.${actor.id || "?"}`;
  if (!actor.name) warn(`${label} 缺少 name`);
  if (!isObject(actor.variables)) fail(`${label} variables 必须是对象`);
  checkRequest(actor.login, `${label}.login`);
  if (!isObject(actor.auth)) {
    fail(`${label} 缺少 auth 对象`);
    return;
  }
  if (typeof actor.auth.enabled !== "boolean") fail(`${label}.auth.enabled 必须是 boolean`);
  const tokenUrlEmpty = !actor.auth.request?.url;
  checkRequest(actor.auth.request, `${label}.auth.request`, { allowEmptyUrl: true });
  const bindings = actor.auth.bindings;
  if (bindings !== undefined && !Array.isArray(bindings)) {
    fail(`${label}.auth.bindings 必须是数组`);
  }
  if (actor.auth.enabled && (!bindings || bindings.length === 0) && !actor.auth.tokenPath) {
    warn(`${label} 启用了 auth 但没有 bindings / tokenPath，不会注入 Header`);
  }
  if (actor.auth.tokenPath || actor.auth.headerName) {
    warn(`${label} 使用了已弃用的 tokenPath/headerName，请改为 auth.bindings`);
  }
  if (actor.auth.enabled && tokenUrlEmpty && !actor.login?.url) {
    warn(`${label} auth 从登录响应取 Token，但 login.url 为空`);
  }
}

function checkApi(api) {
  const label = `apis.${api.id || "?"}`;
  if (!api.name) warn(`${label} 缺少 name`);
  checkRequest(api.request, `${label}.request`);
}

function checkCaseSet(caseSet, apiIds, actorIds) {
  const label = `caseSets.${caseSet.id || "?"}`;
  if (!caseSet.apiId) fail(`${label} 缺少 apiId`);
  else if (!apiIds.has(caseSet.apiId)) fail(`${label} apiId 不存在: ${caseSet.apiId}`);
  if (caseSet.actionTemplateId) fail(`${label} 不要使用 actionTemplateId，改用 apiId`);
  if (caseSet.actorTemplateId) fail(`${label} 不要使用 actorTemplateId，改用 actorId`);
  if (caseSet.actorId && !actorIds.has(caseSet.actorId)) {
    fail(`${label} actorId 不存在: ${caseSet.actorId}`);
  }
  if (!Array.isArray(caseSet.cases)) {
    fail(`${label} cases 必须是数组`);
    return;
  }
  uniqueIds(caseSet.cases, `${label}.cases`);
  for (const testCase of caseSet.cases) {
    const caseLabel = `${label}.cases.${testCase.id || "?"}`;
    if (!testCase.name) warn(`${caseLabel} 缺少 name`);
    if (typeof testCase.enabled !== "boolean") fail(`${caseLabel} enabled 必须是 boolean`);
    if (!isObject(testCase.overrides)) fail(`${caseLabel} overrides 必须是对象`);
    if (!Array.isArray(testCase.assertions)) fail(`${caseLabel} assertions 必须是数组`);
    else {
      for (const assertion of testCase.assertions) {
        if (!isObject(assertion)) {
          fail(`${caseLabel} 断言不是对象`);
          continue;
        }
        if (assertion.operator && !OPERATORS.has(assertion.operator)) {
          fail(`${caseLabel} operator 无效: ${assertion.operator}`);
        }
        if (!assertion.source) warn(`${caseLabel} 断言缺少 source`);
      }
    }
  }
}

function checkScenario(scenario, apiIds, actorIds, scenarioIds) {
  const label = `scenarios.${scenario.id || "?"}`;
  if (!Array.isArray(scenario.nodes)) {
    fail(`${label} nodes 必须是数组`);
    return;
  }
  if (!Array.isArray(scenario.edges)) fail(`${label} edges 必须是数组`);
  const nodeIds = uniqueIds(scenario.nodes, `${label}.nodes`);
  for (const node of scenario.nodes) {
    const nodeLabel = `${label}.nodes.${node.id || "?"}`;
    if (!NODE_TYPES.has(node.type)) fail(`${nodeLabel} type 无效: ${node.type}`);
    if (!isObject(node.data)) {
      fail(`${nodeLabel} 缺少 data 对象`);
      continue;
    }
    if (node.data.actor) fail(`${nodeLabel} 不要内嵌 data.actor，使用 data.actorId`);
    if (node.data.action) fail(`${nodeLabel} 不要内嵌 data.action，使用 data.apiId`);
    if (node.type === "actor") {
      if (!node.data.actorId) fail(`${nodeLabel} 缺少 actorId`);
      else if (!actorIds.has(node.data.actorId)) fail(`${nodeLabel} actorId 不存在: ${node.data.actorId}`);
    }
    if (node.type === "action") {
      if (!node.data.apiId) fail(`${nodeLabel} 缺少 apiId`);
      else if (!apiIds.has(node.data.apiId)) fail(`${nodeLabel} apiId 不存在: ${node.data.apiId}`);
      if (node.data.actorNodeId && !nodeIds.has(node.data.actorNodeId)) {
        fail(`${nodeLabel} actorNodeId 不存在: ${node.data.actorNodeId}`);
      }
    }
    if (node.type === "assert") {
      if (!node.data.actual) fail(`${nodeLabel} 缺少 actual`);
      if (node.data.operator && !OPERATORS.has(node.data.operator)) {
        fail(`${nodeLabel} operator 无效: ${node.data.operator}`);
      }
    }
    if (node.type === "scenario") {
      if (!node.data.scenarioId) fail(`${nodeLabel} 缺少 scenarioId`);
      else if (!scenarioIds.has(node.data.scenarioId)) fail(`${nodeLabel} scenarioId 不存在: ${node.data.scenarioId}`);
      else if (node.data.scenarioId === scenario.id) fail(`${nodeLabel} 不能引用自身`);
    }
  }
  for (const edge of scenario.edges || []) {
    if (!edge?.source || !edge?.target) {
      fail(`${label} 连线缺少 source/target`);
      continue;
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      fail(`${label} 的连线引用了不存在的节点: ${edge.source} -> ${edge.target}`);
    }
  }
  if (hasCycle(scenario.nodes, scenario.edges || [])) {
    fail(`${label} 存在环路`);
  }
}

function hasCycle(nodes, edges) {
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!incoming.has(edge.target) || !outgoing.has(edge.source)) continue;
    incoming.set(edge.target, incoming.get(edge.target) + 1);
    outgoing.get(edge.source).push(edge.target);
  }
  const ready = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  let seen = 0;
  while (ready.length) {
    const id = ready.pop();
    seen += 1;
    for (const target of outgoing.get(id) || []) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) ready.push(target);
    }
  }
  return seen !== nodes.length;
}

function validate(workspace) {
  if (!isObject(workspace)) {
    fail("根对象必须是 JSON object");
    return;
  }
  if (workspace.version !== 5) fail(`version 必须为 5，当前: ${JSON.stringify(workspace.version)}`);
  if (!workspace.activeEnvironment || !isObject(workspace.environments)) {
    fail("需要 activeEnvironment 和 environments 对象");
  } else if (!workspace.environments[workspace.activeEnvironment]) {
    fail(`activeEnvironment 不存在: ${workspace.activeEnvironment}`);
  } else if (!workspace.environments[workspace.activeEnvironment].baseUrl) {
    warn(`environments.${workspace.activeEnvironment} 缺少 baseUrl`);
  }
  if (workspace.templates) fail("不要使用 templates；角色和接口放到 actors[] / apis[]");
  if (workspace.variables !== undefined && !isObject(workspace.variables)) fail("variables 必须是对象");

  for (const key of ["scenarioGroups", "apiGroups", "actorGroups"]) {
    if (workspace[key] !== undefined && !Array.isArray(workspace[key])) fail(`${key} 必须是数组`);
  }

  const actorIds = uniqueIds(workspace.actors, "actors");
  const apiIds = uniqueIds(workspace.apis, "apis");
  uniqueIds(workspace.caseSets, "caseSets");
  const scenarioIds = uniqueIds(workspace.scenarios, "scenarios");

  for (const actor of workspace.actors || []) checkActor(actor);
  for (const api of workspace.apis || []) checkApi(api);
  for (const caseSet of workspace.caseSets || []) checkCaseSet(caseSet, apiIds, actorIds);
  for (const scenario of workspace.scenarios || []) checkScenario(scenario, apiIds, actorIds, scenarioIds);

  if (Array.isArray(workspace.scenarios) && workspace.scenarios.length === 0
    && Array.isArray(workspace.caseSets) && workspace.caseSets.length === 0) {
    warn("scenarios 与 caseSets 都为空");
  }
}

const file = process.argv[2];
if (!file) {
  console.error("用法: node validate-workspace.mjs <workspace.json>");
  process.exit(2);
}

let workspace;
try {
  workspace = JSON.parse(readFileSync(resolve(file), "utf8"));
} catch (error) {
  console.error(`无法解析 JSON: ${error.message}`);
  process.exit(1);
}

validate(workspace);

for (const message of warnings) console.warn(`警告: ${message}`);
for (const message of errors) console.error(`错误: ${message}`);

if (errors.length) {
  console.error(`校验失败: ${errors.length} 个错误, ${warnings.length} 个警告`);
  process.exit(1);
}

console.log(`校验通过: ${file}${warnings.length ? ` (${warnings.length} 个警告)` : ""}`);
