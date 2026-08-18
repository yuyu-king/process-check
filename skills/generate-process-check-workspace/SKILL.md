---
name: generate-process-check-workspace
description: Analyze a backend codebase (routes, DTOs, auth, workflows) and generate an importable Process Check v5 workspace JSON with API case sets for boundary/condition tests and DAG flow scenarios for multi-actor workflows. Use when the user asks for Process Check tests, 接口用例, 流程验证, 边界条件, 场景 JSON, or after implementing APIs and wanting validation cases.
---

# Generate Process Check Workspace

Generate a **version 5** Process Check workspace JSON from the **current** backend repository. Evidence only: do not invent contracts.

## Output

Write one file (default `process-check.workspace.json` in the repo root, or the path the user gives). Chat response: file path, coverage summary, and a separate **Assumptions** list. Do not put comments in the JSON.

## Workflow

### 1. Collect interfaces

Read [references/evidence-sources.md](references/evidence-sources.md). Inspect routes, controllers, DTO/validation, OpenAPI, auth, and tests. Prefer implementation and tests over guesses.

**Scope**

- User named a feature or flow → only that slice.
- User said “all / 全部” → public HTTP endpoints.
- After a code change with no scope given → changed endpoints plus the workflow that uses them.

Build an internal inventory (do not write it to disk unless asked):

- method, path, auth requirement
- request fields: type, required, constraints
- success and error status codes actually returned
- response fields later steps consume
- actors/roles, login request, session vs token

Configure token acquisition on Actor `auth` (`request` + `bindings`). Do **not** add a canvas Action whose only job is fetching a token.

Credentials: `<TEST_USERNAME>`, `<TEST_PASSWORD>`, or `{{env.*}}`. Never copy real secrets.

Unclear required field, path, or status → `<TODO_...>` and list it under Assumptions.

### 2. Boundary cases → `caseSets`

Read [references/boundary-checklist.md](references/boundary-checklist.md).

For selected write APIs (POST/PUT/PATCH first), add one `caseSet` per API. Include a case only when code or spec **shows** that validation. Do not guess HTTP 400.

Each case stores only request `overrides` relative to the API library entry. Assertion `source` is relative to that one response (`status`, `ok`, `body.*`).

Anonymous endpoints: omit `actorId`. Authenticated endpoints: set `actorId` to a library actor.

### 3. Flows → `scenarios`

Trace call order from services, state machines, and existing integration tests.

- Nodes: `actor` (`actorId`) → `action` (`apiId`, optional `saveAs` / `requestOverride`) → `assert`
- Switch roles with another actor node; make every required order an edge
- Prefer one complete happy-path DAG plus a few evidenced failure flows
- Assert side effects (email, jobs) only if an API, mock, outbox, or test hook exposes them
- Layout: left to right in execution order, about 250px apart; stable lowercase kebab-case IDs

### 4. Emit and validate

1. Read [references/workspace-schema.md](references/workspace-schema.md) and [assets/workspace.example.json](assets/workspace.example.json).
2. Write a single v5 object: top-level `actors`, `apis`, `caseSets`, `scenarios`. Nodes reference IDs; do not embed `data.actor` or `data.action`.
3. Run the sibling validator:

```text
node <this-skill>/scripts/validate-workspace.mjs <workspace.json>
```

`<this-skill>` is the directory that contains this `SKILL.md` (for example `~/.claude/skills/generate-process-check-workspace` or a copy under the business repo). Fix every error before finishing.

## Rules

- Preserve exact field names from code or specs.
- Put `baseUrl` in `environments`; use `{{env.baseUrl}}` in URLs.
- GET/HEAD never send a body; put query params in the URL.
- Exact `{{steps.<nodeId>.body.id}}` keeps non-string types; embedding in a larger string stringifies.
- Action `saveAs` writes the response **body** to `shared.<name>`.
- JSON must parse (no comments, no trailing commas).

## Final checks

- Every Action is reachable from an Actor when the endpoint requires auth (directly or via the chain). Public APIs may omit Actor.
- `caseSets[].apiId` / `actorId` and every node `apiId` / `actorId` resolve.
- Assertions only use response fields the project actually returns.
- Secrets remain placeholders.
