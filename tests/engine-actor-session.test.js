import assert from "node:assert/strict";
import test from "node:test";
import { executeWorkspace } from "../src/engine.js";

test("actor defaultHeaders and separate token bindings inject into subsequent APIs", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith("/login")) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "sid=abc; Path=/"
        }
      });
    }
    if (String(url).endsWith("/csrf")) {
      assert.match(init.headers.Cookie || "", /sid=abc/);
      return new Response(JSON.stringify({ csrfToken: "csrf-999" }), {
        status: 200,
        headers: { "content-type": "application/json" }
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
      id: "user",
      name: "User",
      variables: { username: "u" },
      login: {
        method: "POST",
        url: "{{env.baseUrl}}/login",
        headers: {},
        body: { username: "{{actor.username}}" }
      },
      defaultHeaders: {
        Referer: "{{env.baseUrl}}/",
        Origin: "{{env.baseUrl}}"
      },
      auth: {
        enabled: true,
        request: { method: "GET", url: "{{env.baseUrl}}/csrf", headers: {} },
        bindings: [
          { path: "body.csrfToken", headerName: "X-CSRF-Token", prefix: "" }
        ]
      }
    }],
    apis: [{
      id: "biz",
      name: "Biz",
      request: { method: "POST", url: "{{env.baseUrl}}/biz", headers: {}, body: { a: 1 } }
    }],
    scenarios: [{
      id: "s",
      name: "S",
      defaultHeaders: {},
      nodes: [
        { id: "switch", type: "actor", data: { actorId: "user" } },
        { id: "call", type: "action", data: { apiId: "biz" } }
      ],
      edges: [{ source: "switch", target: "call" }]
    }]
  }, "s", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(calls.length, 3);
  const biz = calls[2].init.headers;
  assert.equal(biz["X-CSRF-Token"], "csrf-999");
  assert.equal(biz.Referer, "http://example.test/");
  assert.equal(biz.Origin, "http://example.test");
  assert.match(biz.Cookie, /sid=abc/);
});

test("actor defaultHeaders apply even when auth is disabled", async () => {
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
    actors: [{
      id: "anon-like",
      name: "A",
      variables: {},
      login: { method: "GET", url: "", headers: {} },
      defaultHeaders: { "X-Client": "process-check" },
      auth: { enabled: false, request: { method: "GET", url: "", headers: {} }, bindings: [] }
    }],
    apis: [{
      id: "ping",
      name: "Ping",
      request: { method: "GET", url: "{{env.baseUrl}}/ping", headers: {} }
    }],
    scenarios: [{
      id: "s",
      name: "S",
      defaultHeaders: {},
      nodes: [
        { id: "a", type: "actor", data: { actorId: "anon-like" } },
        { id: "p", type: "action", data: { apiId: "ping" } }
      ],
      edges: [{ source: "a", target: "p" }]
    }]
  }, "s", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(calls[0].init.headers["X-Client"], "process-check");
});
