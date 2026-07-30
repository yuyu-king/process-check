import assert from "node:assert/strict";
import test from "node:test";
import { executeWorkspace } from "../src/engine.js";

test("actor extracts a login token and injects it into subsequent action headers", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ data: { accessToken: "token-for-manager" } }), {
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
    version: 2,
    activeEnvironment: "local",
    environments: { local: { baseUrl: "http://example.test" } },
    variables: {},
    templates: { actors: [], actions: [] },
    scenarios: [{
      id: "actor-auth",
      name: "Actor auth",
      nodes: [
        {
          id: "manager",
          type: "actor",
          data: {
            actor: {
              name: "Manager",
              variables: {},
              login: { method: "POST", url: "{{env.baseUrl}}/token", headers: {}, body: {} },
              auth: {
                enabled: true,
                tokenPath: "body.data.accessToken",
                headerName: "Authorization",
                prefix: "Bearer "
              }
            }
          }
        },
        {
          id: "automatic",
          type: "action",
          data: {
            action: {
              name: "Automatic header",
              request: { method: "GET", url: "{{env.baseUrl}}/automatic", headers: {} }
            }
          }
        },
        {
          id: "override",
          type: "action",
          data: {
            action: {
              name: "Override header",
              request: {
                method: "GET",
                url: "{{env.baseUrl}}/override",
                headers: { authorization: "Custom token" }
              }
            }
          }
        }
      ],
      edges: [
        { source: "manager", target: "automatic" },
        { source: "automatic", target: "override" }
      ]
    }]
  };

  const result = await executeWorkspace(workspace, "actor-auth", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(calls.filter((call) => call.url.endsWith("/token")).length, 1);
  assert.equal(calls[1].init.headers.Authorization, "Bearer token-for-manager");
  assert.equal(calls[2].init.headers.authorization, "Custom token");
  assert.equal(calls[2].init.headers.Authorization, undefined);
});
