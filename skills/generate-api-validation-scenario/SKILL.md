---
name: generate-api-validation-scenario
description: Analyze a backend codebase, API specification, routes, authentication flow, and business workflow to generate or update an importable Process Check JSON workspace. Use when Codex needs to model multi-account or multi-role API validation, chained requests, response-variable propagation, assertions, reusable sub-scenarios, or complete approval workflows.
---

# Generate API Validation Scenario

Generate a safe, evidence-based Process Check workspace from the target project.

## Workflow

1. Inspect the repository's route declarations, controllers, request/response types, authentication code, tests, API specs, and environment examples. Prefer implementation and tests over guesses.
2. Identify the requested actors, their roles, login request, session mechanism, and token response path. When later APIs use the login token, configure Actor `auth` injection instead of generating a separate token Action. Use placeholder credentials only; never copy real secrets.
3. Trace the business workflow end to end. Record each request's method, URL, body, expected status, output fields consumed later, and externally visible side effects.
4. Read [references/workspace-schema.md](references/workspace-schema.md) before generating JSON.
5. Create Actor and Action node instances with inline configuration. Use stable lowercase kebab-case node IDs. Keep `templates` empty unless the user explicitly asks to save reusable templates.
6. Build one or more scenario DAGs. Place nodes left to right in execution order, generally 250 pixels apart. Make every required ordering relation explicit with an edge.
7. Add assertions for HTTP status, critical response fields, state transitions, authorization failures, and requested side effects. Do not claim an email was sent unless an observable API response, outbox endpoint, mock, event, or test hook exposes it.
8. Validate all references: actor IDs, action IDs, scenario IDs, edge endpoints, and every `steps.<nodeId>` path.
9. Return one raw JSON object when the user asks for an import file. If writing to the repository, use a descriptive `.json` filename and report assumptions separately.

## Evidence and uncertainty

- Preserve exact request and response field names found in code or specs.
- Put the deployment-specific base URL in `environments`; do not hardcode it into every action.
- Use `<TEST_USERNAME>`, `<TEST_PASSWORD>`, or environment templates for credentials.
- If a required endpoint, payload, response path, or side-effect observation point is unclear, mark the value with an obvious `<TODO_...>` placeholder and list the uncertainty. Do not invent a plausible contract.
- Prefer a small complete happy-path scenario plus focused failure scenarios over one graph with unrelated branches.

## Final checks

- Ensure the JSON parses without comments or trailing commas.
- Ensure each Action is reachable from an Actor, directly or through the ordered chain.
- Ensure exact template expressions preserve non-string request values where needed.
- Ensure secrets remain placeholders.
- Ensure assertions reference response fields that the inspected project actually exposes.
