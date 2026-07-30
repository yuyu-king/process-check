import assert from "node:assert/strict";
import test from "node:test";
import { executeCaseSet } from "../src/engine.js";

function workspaceWithCases(cases) {
  return {
    version: 3,
    activeEnvironment: "local",
    environments: { local: { baseUrl: "http://example.test" } },
    variables: {},
    templates: {
      actors: [],
      actions: [{
        id: "create-project",
        name: "Create project",
        config: {
          name: "Create project",
          request: {
            method: "POST",
            url: "{{env.baseUrl}}/projects",
            headers: { "x-suite": "condition-validation" },
            body: { name: "base-name", options: { audited: true, level: 1 } }
          }
        }
      }]
    },
    scenarios: [],
    caseSets: [{
      id: "project-conditions",
      name: "Project conditions",
      actorTemplateId: "",
      actionTemplateId: "create-project",
      cases
    }]
  };
}

test("case set runs enabled parameter variants and evaluates each response independently", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, headers: init.headers, body });
    const valid = body.name !== "";
    return new Response(JSON.stringify(valid ? { id: "project-1" } : { error: "name required" }), {
      status: valid ? 201 : 400,
      headers: { "content-type": "application/json" }
    });
  };
  const workspace = workspaceWithCases([
    {
      id: "normal",
      name: "normal",
      enabled: true,
      overrides: { body: { name: "yb-{{random.string}}", options: { level: 2 } } },
      assertions: [
        { source: "status", operator: "equals", expected: 201 },
        { source: "body.id", operator: "exists" }
      ]
    },
    {
      id: "empty-name",
      name: "empty name",
      enabled: true,
      overrides: { body: { name: "" } },
      assertions: [{ source: "status", operator: "equals", expected: 400 }]
    },
    {
      id: "disabled",
      name: "disabled",
      enabled: false,
      overrides: {},
      assertions: []
    }
  ]);

  const result = await executeCaseSet(workspace, "project-conditions", { fetchImpl });

  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, { total: 2, passed: 2, failed: 0, skipped: 1 });
  assert.equal(requests.length, 2);
  assert.match(requests[0].body.name, /^yb-/);
  assert.deepEqual(requests[0].body.options, { audited: true, level: 2 });
  assert.equal(requests[1].body.name, "");
  assert.deepEqual(requests[1].body.options, { audited: true, level: 1 });
  assert.equal(result.cases[1].response.status, 400);
});

test("case set reports a failed assertion without preventing other cases from running", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const workspace = workspaceWithCases([
    {
      id: "wrong-expectation",
      name: "wrong expectation",
      enabled: true,
      overrides: {},
      assertions: [{ source: "status", operator: "equals", expected: 201 }]
    },
    {
      id: "correct-expectation",
      name: "correct expectation",
      enabled: true,
      overrides: {},
      assertions: [{ source: "status", operator: "equals", expected: 200 }]
    }
  ]);

  const result = await executeCaseSet(workspace, "project-conditions", { fetchImpl });

  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.deepEqual(result.summary, { total: 2, passed: 1, failed: 1, skipped: 0 });
  assert.equal(result.cases[0].ok, false);
  assert.equal(result.cases[1].ok, true);
});

test("case set reuses Actor login and automatic token injection", async () => {
  const workspace = workspaceWithCases([{
    id: "authenticated",
    name: "authenticated",
    enabled: true,
    overrides: {},
    assertions: [{ source: "status", operator: "equals", expected: 200 }]
  }]);
  workspace.templates.actors.push({
    id: "supervisor",
    name: "Supervisor",
    config: {
      name: "Supervisor",
      variables: { username: "supervisor" },
      login: {
        method: "POST",
        url: "{{env.baseUrl}}/token",
        headers: {},
        body: { username: "{{actor.username}}" }
      },
      auth: {
        enabled: true,
        tokenPath: "body.accessToken",
        headerName: "Authorization",
        prefix: "Bearer "
      }
    }
  });
  workspace.caseSets[0].actorTemplateId = "supervisor";
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ accessToken: "case-token" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const result = await executeCaseSet(workspace, "project-conditions", { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers.Authorization, "Bearer case-token");
});
