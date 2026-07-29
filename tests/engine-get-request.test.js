import assert from "node:assert/strict";
import test from "node:test";
import { executeWorkspace } from "../src/engine.js";

test("GET and HEAD actions never pass a body to fetch", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    if (["GET", "HEAD"].includes(init.method) && init.body !== undefined) {
      throw new TypeError("Request with GET/HEAD method cannot have body");
    }
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const action = (method, id) => ({
    id,
    type: "action",
    data: { action: { name: method, request: { method, url: `http://example.test/${id}`, body: {} } } }
  });
  const workspace = {
    version: 2,
    environments: { local: {} },
    activeEnvironment: "local",
    variables: {},
    templates: { actors: [], actions: [] },
    scenarios: [{
      id: "request-methods",
      name: "GET and HEAD",
      nodes: [
        { id: "actor", type: "actor", data: { actor: { name: "No login", variables: {}, login: {} } } },
        action("GET", "get"),
        action("HEAD", "head")
      ],
      edges: [
        { source: "actor", target: "get" },
        { source: "get", target: "head" }
      ]
    }]
  };

  const result = await executeWorkspace(workspace, "request-methods", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[1].init.body, undefined);
});
