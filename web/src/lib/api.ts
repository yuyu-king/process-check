import type { CaseSetRunResult, RunResult, Workspace } from "../types";

export async function executeScenario(
  workspace: Workspace,
  scenarioId: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  const res = await fetch("/api/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace, scenarioId }),
    signal,
  });
  return res.json();
}

export async function executeCaseSet(
  workspace: Workspace,
  caseSetId: string,
  signal?: AbortSignal,
): Promise<CaseSetRunResult> {
  const res = await fetch("/api/execute-case-set", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace, caseSetId }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}
