---
name: generate-api-validation-scenario
description: Deprecated alias. Use generate-process-check-workspace to analyze a backend codebase and generate Process Check v5 workspace JSON (接口用例, 流程验证, 边界条件, 场景 JSON).
---

# Deprecated

This skill is retired. Follow [../generate-process-check-workspace/SKILL.md](../generate-process-check-workspace/SKILL.md).

The old v3 `templates` / inline `data.actor` schema is outdated. New output must be Process Check **version 5** (`actors[]`, `apis[]`, `caseSets[].apiId`, scenario nodes with `actorId` / `apiId`).
