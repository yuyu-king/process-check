import assert from "node:assert/strict";
import test from "node:test";
import { executeWorkspace } from "../src/engine.js";

test("random template values are stable within a request and renewed for each action", async () => {
  const requests = [];
  const fetchImpl = async (_url, init) => {
    requests.push({
      headers: init.headers,
      body: JSON.parse(init.body)
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const randomAction = (id) => ({
    id,
    type: "action",
    data: {
      action: {
        name: id,
        request: {
          method: "POST",
          url: "http://example.test/projects",
          headers: { "X-Random": "{{random.string}}" },
          body: {
            name: "yb-{{random.string}}",
            uuid: "{{random.uuid}}",
            timestamp: "{{random.timestamp}}"
          }
        }
      }
    }
  });
  const workspace = {
    version: 2,
    activeEnvironment: "local",
    environments: { local: {} },
    variables: {},
    templates: { actors: [], actions: [] },
    scenarios: [{
      id: "random",
      name: "random",
      nodes: [
        { id: "actor", type: "actor", data: { actor: { name: "No login", variables: {}, login: {} } } },
        randomAction("create-one"),
        randomAction("create-two")
      ],
      edges: [
        { source: "actor", target: "create-one" },
        { source: "create-one", target: "create-two" }
      ]
    }]
  };

  const result = await executeWorkspace(workspace, "random", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(requests.length, 2);
  assert.match(requests[0].body.name, /^yb-[A-Za-z0-9_-]{8}$/);
  assert.equal(requests[0].body.name.slice(3), requests[0].headers["X-Random"]);
  assert.match(requests[0].body.uuid, /^[0-9a-f-]{36}$/);
  assert.equal(typeof requests[0].body.timestamp, "number");
  assert.notEqual(requests[0].body.name, requests[1].body.name);
});
