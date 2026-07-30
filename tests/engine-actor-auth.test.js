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

test("actor logs in, calls a separate token endpoint, then injects that token", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/login")) {
      return new Response(JSON.stringify({ loggedIn: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "session=actor-session; Path=/"
        }
      });
    }
    if (url.endsWith("/token")) {
      assert.match(init.headers.Cookie, /session=actor-session/);
      return new Response(JSON.stringify({ data: { accessToken: "separate-token" } }), {
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
    version: 3,
    activeEnvironment: "local",
    environments: { local: { baseUrl: "http://example.test" } },
    variables: {},
    templates: { actors: [], actions: [] },
    caseSets: [],
    scenarios: [{
      id: "separate-token",
      name: "Separate token",
      nodes: [
        {
          id: "manager",
          type: "actor",
          data: {
            actor: {
              name: "Manager",
              variables: { username: "manager" },
              login: {
                method: "POST",
                url: "{{env.baseUrl}}/login",
                headers: {},
                body: { username: "{{actor.username}}" }
              },
              auth: {
                enabled: true,
                request: {
                  method: "GET",
                  url: "{{env.baseUrl}}/token",
                  headers: {}
                },
                tokenPath: "body.data.accessToken",
                headerName: "Authorization",
                prefix: "Bearer "
              }
            }
          }
        },
        {
          id: "business-request",
          type: "action",
          data: {
            action: {
              name: "Business request",
              request: { method: "GET", url: "{{env.baseUrl}}/projects", headers: {} }
            }
          }
        }
      ],
      edges: [{ source: "manager", target: "business-request" }]
    }]
  };

  const result = await executeWorkspace(workspace, "separate-token", { fetchImpl });

  assert.equal(result.ok, true, result.error);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/login", "/token", "/projects"]);
  assert.equal(calls[2].init.headers.Authorization, "Bearer separate-token");
  assert.match(calls[2].init.headers.Cookie, /session=actor-session/);
});
