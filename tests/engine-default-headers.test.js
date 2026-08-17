import assert from "node:assert/strict";
import test from "node:test";
import { executeWorkspace } from "../src/engine.js";

test("scenario default headers apply to every action and can be overridden per node", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const workspace = {
    version: 4,
    activeEnvironment: "local",
    environments: { local: { baseUrl: "http://example.test" } },
    variables: {},
    templates: { actors: [], actions: [] },
    caseSets: [],
    scenarios: [{
      id: "defaults",
      name: "Defaults",
      defaultHeaders: { "X-Tenant": "acme", "X-Client": "process-check" },
      nodes: [
        {
          id: "anon",
          type: "actor",
          data: { actor: { name: "Anon", variables: {}, login: { method: "GET", url: "", headers: {} }, auth: { enabled: false } } }
        },
        {
          id: "first",
          type: "action",
          data: { action: { name: "First", request: { method: "GET", url: "{{env.baseUrl}}/a", headers: {} } } }
        },
        {
          id: "second",
          type: "action",
          data: {
            action: {
              name: "Second",
              request: { method: "GET", url: "{{env.baseUrl}}/b", headers: { "X-Tenant": "override" } }
            }
          }
        }
      ],
      edges: [
        { source: "anon", target: "first" },
        { source: "first", target: "second" }
      ]
    }]
  };

  const result = await executeWorkspace(workspace, "defaults", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(calls[0].init.headers["X-Tenant"], "acme");
  assert.equal(calls[0].init.headers["X-Client"], "process-check");
  // node header wins over scenario default for the same key
  assert.equal(calls[1].init.headers["X-Tenant"], "override");
  assert.equal(calls[1].init.headers["X-Client"], "process-check");
});

test("an action can write a response value into the dynamic default headers for later requests", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/trace")) {
      return new Response(JSON.stringify({ traceId: "trace-123" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const workspace = {
    version: 4,
    activeEnvironment: "local",
    environments: { local: { baseUrl: "http://example.test" } },
    variables: {},
    templates: { actors: [], actions: [] },
    caseSets: [],
    scenarios: [{
      id: "dynamic",
      name: "Dynamic",
      defaultHeaders: {},
      nodes: [
        {
          id: "anon",
          type: "actor",
          data: { actor: { name: "Anon", variables: {}, login: { method: "GET", url: "", headers: {} }, auth: { enabled: false } } }
        },
        {
          id: "seed",
          type: "action",
          data: {
            action: { name: "Seed", request: { method: "GET", url: "{{env.baseUrl}}/trace", headers: {} } },
            setDefaultHeaders: { "X-Trace": "{{steps.seed.body.traceId}}" }
          }
        },
        {
          id: "consumer",
          type: "action",
          data: { action: { name: "Consumer", request: { method: "GET", url: "{{env.baseUrl}}/work", headers: {} } } }
        }
      ],
      edges: [
        { source: "anon", target: "seed" },
        { source: "seed", target: "consumer" }
      ]
    }]
  };

  const result = await executeWorkspace(workspace, "dynamic", { fetchImpl });

  const trace = calls.find((c) => c.url.endsWith("/trace"));
  const work = calls.find((c) => c.url.endsWith("/work"));
  assert.equal(result.ok, true, result.error);
  assert.equal(trace.init.headers["X-Trace"], undefined);
  assert.equal(work.init.headers["X-Trace"], "trace-123");
});
