import assert from "node:assert/strict";
import test from "node:test";
import { executeWorkspace } from "../src/engine.js";

test("public API can run without an actor node", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const result = await executeWorkspace({
    version: 5,
    activeEnvironment: "local",
    environments: { local: { baseUrl: "http://example.test" } },
    variables: {},
    actors: [],
    apis: [{
      id: "health",
      name: "Health",
      request: { method: "GET", url: "{{env.baseUrl}}/health", headers: {} }
    }],
    scenarios: [{
      id: "public",
      name: "Public",
      defaultHeaders: {},
      nodes: [{ id: "check", type: "action", data: { apiId: "health" } }],
      edges: []
    }]
  }, "public", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://example.test/health");
});

test("step requestOverride deep-merges onto library API request", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const result = await executeWorkspace({
    version: 5,
    activeEnvironment: "local",
    environments: { local: { baseUrl: "http://example.test" } },
    variables: {},
    actors: [],
    apis: [{
      id: "create",
      name: "Create",
      request: {
        method: "POST",
        url: "{{env.baseUrl}}/items",
        headers: {},
        body: { name: "base", meta: { a: 1, b: 2 } }
      }
    }],
    scenarios: [{
      id: "override",
      name: "Override",
      defaultHeaders: {},
      nodes: [{
        id: "step",
        type: "action",
        data: {
          apiId: "create",
          requestOverride: { body: { name: "overridden", meta: { b: 9 } } }
        }
      }],
      edges: []
    }]
  }, "override", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.deepEqual(calls[0].body, { name: "overridden", meta: { a: 1, b: 9 } });
});

test("flow resolves actorId and apiId from workspace libraries", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/login")) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "sid=1; Path=/" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const result = await executeWorkspace({
    version: 5,
    activeEnvironment: "local",
    environments: { local: { baseUrl: "http://example.test" } },
    variables: {},
    actors: [{
      id: "user-a",
      name: "User A",
      variables: { username: "a" },
      login: {
        method: "POST",
        url: "{{env.baseUrl}}/login",
        headers: {},
        body: { username: "{{actor.username}}" }
      },
      auth: { enabled: false }
    }],
    apis: [{
      id: "list",
      name: "List",
      request: { method: "GET", url: "{{env.baseUrl}}/items", headers: {} }
    }],
    scenarios: [{
      id: "ref",
      name: "Ref",
      defaultHeaders: {},
      nodes: [
        { id: "switch", type: "actor", data: { actorId: "user-a" } },
        { id: "call", type: "action", data: { apiId: "list" } }
      ],
      edges: [{ source: "switch", target: "call" }]
    }]
  }, "ref", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(calls.length, 2);
  assert.match(calls[1].init.headers.Cookie, /sid=1/);
});
