import { useEffect, type ReactNode } from "react";
import { selectCurrentApi, selectCurrentCaseSet, useStore } from "../store";
import { executeCaseSet } from "../lib/api";
import { safeStringify, summarizeJson } from "../lib/format";
import type { Assertion, CaseRunResult, HttpMethod, Json } from "../types";
import { Button, Field, IconButton, JsonField, OptionalJsonField, Select, TextInput, Toggle, usePrompt } from "./ui";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

function summarizeAssertions(assertions: Assertion[]): string {
  if (!assertions?.length) return "HTTP 请求成功";
  return assertions
    .map((a) => `${a.source || "ok"} ${a.operator || "equals"} ${JSON.stringify(a.expected ?? "")}`)
    .join(" · ");
}

export default function ApisLibrary() {
  const workspace = useStore((s) => s.workspace);
  const selectedApiId = useStore((s) => s.selectedApiId);
  const api = useStore(selectCurrentApi);
  const selectApi = useStore((s) => s.selectApi);
  const addApi = useStore((s) => s.addApi);
  const updateApi = useStore((s) => s.updateApi);
  const deleteApi = useStore((s) => s.deleteApi);
  const duplicateApi = useStore((s) => s.duplicateApi);
  const addApiGroup = useStore((s) => s.addApiGroup);
  const { prompt, node: promptNode } = usePrompt();

  const onAdd = async () => {
    const name = await prompt("新建 API", `接口 ${workspace.apis.length + 1}`);
    if (name) addApi(name);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="flex-1 text-sm font-semibold text-ink">API 库</h2>
          <IconButton
            title="新建分组"
            onClick={async () => {
              const name = await prompt("新建 API 分组", `分组 ${workspace.apiGroups.length + 1}`);
              if (name) addApiGroup(name);
            }}
          >
            <FolderIcon />
          </IconButton>
          <IconButton title="新建 API" onClick={onAdd}>
            <PlusIcon />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {workspace.apiGroups.map((g) => (
            <div key={g.id} className="mb-2">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {g.name}
              </div>
              {workspace.apis
                .filter((a) => a.groupId === g.id)
                .map((a) => (
                  <ApiRow
                    key={a.id}
                    name={a.name}
                    method={a.request.method}
                    selected={a.id === selectedApiId}
                    onClick={() => selectApi(a.id)}
                  />
                ))}
            </div>
          ))}
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            未分组
          </div>
          {workspace.apis
            .filter((a) => !a.groupId || !workspace.apiGroups.some((g) => g.id === a.groupId))
            .map((a) => (
              <ApiRow
                key={a.id}
                name={a.name}
                method={a.request.method}
                selected={a.id === selectedApiId}
                onClick={() => selectApi(a.id)}
              />
            ))}
          {!workspace.apis.length && (
            <p className="px-2 py-4 text-xs text-ink-faint">先定义 API，再在流程中引用，或挂用例集。</p>
          )}
        </div>
        <div className="border-t border-line p-3">
          <Button className="w-full" onClick={onAdd}>
            <PlusIcon /> 新建 API
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {api ? (
          <>
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <div className="flex-1 min-w-0">
                <h2 className="truncate text-sm font-semibold text-ink">{api.name}</h2>
                <p className="truncate font-mono text-xs text-ink-faint">
                  {api.request.method} {api.request.url}
                </p>
              </div>
              <Button size="sm" onClick={() => duplicateApi(api.id)}>
                复制
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (confirm(`删除 API「${api.name}」及其用例集？`)) deleteApi(api.id);
                }}
              >
                删除
              </Button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="w-[360px] shrink-0 overflow-y-auto border-r border-line p-4 space-y-4">
                <Field label="接口名称">
                  <TextInput
                    value={api.name}
                    onChange={(e) => updateApi(api.id, { name: e.target.value })}
                  />
                </Field>
                <Field label="分组">
                  <Select
                    value={api.groupId || ""}
                    onChange={(e) => updateApi(api.id, { groupId: e.target.value || undefined })}
                  >
                    <option value="">未分组</option>
                    {workspace.apiGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <Field label="方法">
                    <Select
                      value={api.request.method}
                      onChange={(e) =>
                        updateApi(api.id, {
                          request: { ...api.request, method: e.target.value as HttpMethod },
                        })
                      }
                    >
                      {METHODS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="URL">
                    <TextInput
                      value={api.request.url}
                      onChange={(e) =>
                        updateApi(api.id, { request: { ...api.request, url: e.target.value } })
                      }
                    />
                  </Field>
                </div>
                <OptionalJsonField
                  label="请求头"
                  emptyHint="未配置请求头 · 点击添加"
                  value={
                    api.request.headers && Object.keys(api.request.headers).length
                      ? api.request.headers
                      : undefined
                  }
                  rows={2}
                  onCommit={(v) =>
                    updateApi(api.id, { request: { ...api.request, headers: (v as Json) || {} } })
                  }
                />
                {!["GET", "HEAD"].includes(api.request.method) ? (
                  <OptionalJsonField
                    label="请求体"
                    emptyHint="未配置请求体 · 点击添加"
                    value={api.request.body}
                    rows={5}
                    hint="支持 {{env.baseUrl}} {{shared.x}} {{random.uuid}}"
                    onCommit={(v) =>
                      updateApi(api.id, {
                        request: {
                          ...api.request,
                          ...(v === undefined ? { body: undefined } : { body: v }),
                        },
                      })
                    }
                  />
                ) : (
                  <p className="text-[11px] text-ink-faint">GET/HEAD 不发送请求体；查询参数写在 URL 中。</p>
                )}
              </div>
              <ApiCaseSets apiId={api.id} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p className="text-sm text-ink-faint">选择或创建一个 API</p>
            <Button variant="primary" onClick={onAdd}>
              ＋ 新建 API
            </Button>
          </div>
        )}
      </div>
      {promptNode}
    </div>
  );
}

function ApiCaseSets({ apiId }: { apiId: string }) {
  const workspace = useStore((s) => s.workspace);
  const caseSets = workspace.caseSets.filter((c) => c.apiId === apiId);
  const caseSet = useStore(selectCurrentCaseSet);
  const caseSetId = useStore((s) => s.caseSetId);
  const setCaseSet = useStore((s) => s.setCaseSet);
  const addCaseSet = useStore((s) => s.addCaseSet);
  const deleteCaseSet = useStore((s) => s.deleteCaseSet);
  const updateCaseSet = useStore((s) => s.updateCaseSet);
  const selectedCaseId = useStore((s) => s.selectedCaseId);
  const selectCase = useStore((s) => s.selectCase);
  const addCase = useStore((s) => s.addCase);
  const caseResults = useStore((s) => s.caseResults);
  const caseRunState = useStore((s) => s.caseRunState);
  const setCaseRun = useStore((s) => s.setCaseRun);
  const { prompt, node: promptNode } = usePrompt();

  useEffect(() => {
    if (caseSet?.apiId === apiId) return;
    if (caseSets[0]) setCaseSet(caseSets[0].id);
    else if (caseSetId) setCaseSet(null);
  }, [apiId, caseSet?.apiId, caseSets, caseSetId, setCaseSet]);

  const active = caseSet?.apiId === apiId ? caseSet : undefined;

  const onAddSet = async () => {
    const name = await prompt("新建用例集", `用例集 ${caseSets.length + 1}`);
    if (name) addCaseSet(apiId, name);
  };

  const run = async (caseIds?: string[]) => {
    if (!active) return;
    const single = Boolean(caseIds?.length);
    if (!single) {
      setCaseRun({ caseRunState: "running", caseResults: [], selectedCaseResultId: null });
    } else {
      setCaseRun({ caseRunState: "running", selectedCaseResultId: caseIds![0] });
    }
    try {
      const result = await executeCaseSet(
        structuredClone(workspace),
        active.id,
        undefined,
        caseIds ? { caseIds } : undefined,
      );
      if (single) {
        const prev = useStore.getState().caseResults;
        const merged = [...prev];
        for (const c of result.cases) {
          const idx = merged.findIndex((x) => x.id === c.id);
          if (idx >= 0) merged[idx] = c;
          else merged.push(c);
        }
        setCaseRun({
          caseRunState: result.ok ? "success" : "failure",
          caseResults: merged,
          selectedCaseResultId: result.cases[0]?.id || caseIds![0],
        });
      } else {
        setCaseRun({
          caseRunState: result.ok ? "success" : "failure",
          caseResults: result.cases,
          selectedCaseResultId: result.cases.find((c) => !c.ok)?.id || result.cases[0]?.id || null,
        });
      }
    } catch (e) {
      setCaseRun({
        caseRunState: "failure",
        caseResults: single
          ? [
              ...useStore.getState().caseResults.filter((c) => !caseIds!.includes(c.id)),
              { id: caseIds![0], name: "执行失败", ok: false, error: (e as Error).message },
            ]
          : [{ id: "err", name: "无法执行", ok: false, error: (e as Error).message }],
        selectedCaseResultId: single ? caseIds![0] : "err",
      });
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h3 className="text-sm font-semibold text-ink">单接口用例集</h3>
        <span className="text-xs text-ink-faint">边界参数校验</span>
        <div className="flex-1" />
        {active && (
          <Button size="sm" variant="primary" onClick={() => run()} disabled={caseRunState === "running"}>
            {caseRunState === "running" ? "运行中…" : "▶ 批量运行"}
          </Button>
        )}
        <Button size="sm" onClick={onAddSet}>
          <PlusIcon /> 用例集
        </Button>
      </div>

      {!caseSets.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm text-ink-faint">为此 API 添加用例集，配置多组参数与断言。</p>
          <Button variant="primary" onClick={onAddSet}>
            ＋ 新建用例集
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 shrink-0 overflow-y-auto border-r border-line p-2">
            {caseSets.map((cs) => (
              <button
                key={cs.id}
                onClick={() => setCaseSet(cs.id)}
                className={`mb-1 flex w-full items-center gap-1 rounded-lg px-2.5 py-2 text-left text-sm ${
                  (active?.id || caseSetId) === cs.id
                    ? "bg-brand-soft text-brand"
                    : "text-ink-soft hover:bg-line-soft"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{cs.name}</span>
                <span className="text-[10px] text-ink-faint">{cs.cases.length}</span>
              </button>
            ))}
          </div>
          {active && (
            <>
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                  <TextInput
                    className="!h-8 !py-1"
                    value={active.name}
                    onChange={(e) => updateCaseSet(active.id, { name: e.target.value })}
                  />
                  <Select
                    className="!h-8 max-w-[160px] !py-1"
                    value={active.actorId || ""}
                    onChange={(e) =>
                      updateCaseSet(active.id, { actorId: e.target.value || undefined })
                    }
                  >
                    <option value="">匿名（无需登录）</option>
                    {workspace.actors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" onClick={addCase}>
                    ＋ 用例
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (confirm(`删除用例集「${active.name}」？`)) deleteCaseSet(active.id);
                    }}
                  >
                    删除
                  </Button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-faint">
                        <th className="border-b border-line pb-2 pl-2 font-medium">启用</th>
                        <th className="border-b border-line pb-2 font-medium">名称</th>
                        <th className="border-b border-line pb-2 font-medium">覆盖</th>
                        <th className="border-b border-line pb-2 font-medium">断言</th>
                        <th className="border-b border-line pb-2 font-medium">结果</th>
                        <th className="border-b border-line pb-2 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.cases.map((c) => {
                        const r = caseResults.find((x) => x.id === c.id);
                        return (
                          <tr
                            key={c.id}
                            onClick={() => {
                              selectCase(c.id);
                              if (r) setCaseRun({ selectedCaseResultId: c.id });
                            }}
                            className={`cursor-pointer ${
                              selectedCaseId === c.id ? "bg-brand-soft" : "hover:bg-line-soft"
                            }`}
                          >
                            <td className="border-b border-line-soft py-2 pl-2">
                              {c.enabled === false ? "—" : "✓"}
                            </td>
                            <td className="border-b border-line-soft py-2 font-medium">{c.name}</td>
                            <td className="border-b border-line-soft py-2">
                              <code className="mono text-ink-soft">
                                {summarizeJson(c.overrides) || "—"}
                              </code>
                            </td>
                            <td className="border-b border-line-soft py-2 text-ink-soft">
                              {summarizeAssertions(c.assertions)}
                            </td>
                            <td className="border-b border-line-soft py-2">
                              {r ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    r.ok ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-fail"
                                  }`}
                                >
                                  {r.ok ? "通过" : "失败"}
                                </span>
                              ) : (
                                <span className="text-ink-faint">未运行</span>
                              )}
                            </td>
                            <td className="border-b border-line-soft py-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={caseRunState === "running"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectCase(c.id);
                                  void run([c.id]);
                                }}
                              >
                                ▶ 运行
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {!active.cases.length && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-sm text-ink-faint">
                            添加用例开始边界测试
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <CaseResults />
              </div>
              <CaseEditor onRunOne={(id) => run([id])} running={caseRunState === "running"} />
            </>
          )}
        </div>
      )}
      {promptNode}
    </div>
  );
}

function CaseEditor({
  onRunOne,
  running,
}: {
  onRunOne: (id: string) => void;
  running: boolean;
}) {
  const caseSet = useStore(selectCurrentCaseSet);
  const selectedCaseId = useStore((s) => s.selectedCaseId);
  const updateCase = useStore((s) => s.updateCase);
  const duplicateCase = useStore((s) => s.duplicateCase);
  const deleteCase = useStore((s) => s.deleteCase);
  const testCase = caseSet?.cases.find((c) => c.id === selectedCaseId);

  return (
    <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">用例编辑</h3>
      </div>
      {testCase ? (
        <div className="space-y-4 p-4">
          <Button
            className="w-full"
            variant="primary"
            size="sm"
            disabled={running}
            onClick={() => onRunOne(testCase.id)}
          >
            {running ? "运行中…" : "▶ 运行此用例"}
          </Button>
          <Toggle
            checked={testCase.enabled !== false}
            onChange={(v) => updateCase(testCase.id, { enabled: v })}
            label="批量运行时启用"
          />
          <Field label="用例名称">
            <TextInput
              value={testCase.name}
              onChange={(e) => updateCase(testCase.id, { name: e.target.value })}
            />
          </Field>
          <OptionalJsonField
            label="参数覆盖"
            emptyHint="不覆盖 API 参数 · 需要时点击添加"
            value={
              testCase.overrides && Object.keys(testCase.overrides).length
                ? testCase.overrides
                : undefined
            }
            rows={5}
            hint='与 API 定义深合并，如 {"body":{"amount":-1}}'
            onCommit={(v) =>
              updateCase(testCase.id, { overrides: (v as Record<string, unknown>) || {} })
            }
          />
          <JsonField
            label="断言"
            value={testCase.assertions}
            rows={4}
            onCommit={(v) =>
              Array.isArray(v) && updateCase(testCase.id, { assertions: v as Assertion[] })
            }
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => duplicateCase(testCase.id)}>
              复制
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              onClick={() => deleteCase(testCase.id)}
            >
              删除
            </Button>
          </div>
        </div>
      ) : (
        <p className="p-4 text-xs text-ink-faint">选择一条用例进行编辑。</p>
      )}
    </aside>
  );
}

function LayerSection({
  title,
  ok,
  defaultOpen,
  children,
}: {
  title: string;
  ok?: boolean | null;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen ?? ok === false}
      className="group border-b border-white/10 last:border-0"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-[#d5d8e0] hover:bg-white/5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            ok === true ? "bg-emerald-400" : ok === false ? "bg-red-400" : "bg-zinc-500"
          }`}
        />
        <span className="flex-1 font-medium">{title}</span>
        <span className="text-[10px] text-zinc-500 group-open:hidden">展开</span>
        <span className="hidden text-[10px] text-zinc-500 group-open:inline">收起</span>
      </summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </details>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <pre className="overflow-x-auto rounded-md bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-[#c8ccd6]">
        {safeStringify(value)}
      </pre>
    </div>
  );
}

function CaseResultDetail({ detail }: { detail: CaseRunResult }) {
  const layers = detail.layers;
  if (!layers && !detail.error) {
    return (
      <pre className="p-3 font-mono text-xs leading-relaxed text-[#d5d8e0]">
        {safeStringify(detail)}
      </pre>
    );
  }

  const callOk = layers?.call ? layers.call.ok !== false && !layers.call.error : null;
  const assertOk =
    layers?.assertions?.length
      ? layers.assertions.every((a) => a.passed)
      : null;

  return (
    <div className="text-[#d5d8e0]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            detail.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
          }`}
        >
          {detail.ok ? "通过" : "失败"}
        </span>
        <span className="text-sm font-medium">{detail.name}</span>
        {detail.error && <span className="truncate text-xs text-red-300">{detail.error}</span>}
      </div>

      {layers?.login && (
        <LayerSection title={`登录 · ${layers.login.label || ""}`} ok={layers.login.ok} defaultOpen={layers.login.ok === false}>
          {layers.login.error && <p className="text-xs text-red-300">{layers.login.error}</p>}
          {layers.login.status !== undefined && (
            <p className="font-mono text-xs text-zinc-400">
              HTTP {layers.login.status}
              {layers.login.durationMs != null ? ` · ${layers.login.durationMs}ms` : ""}
            </p>
          )}
          <JsonBlock label="请求入参" value={layers.login.request} />
          <JsonBlock label="响应出参" value={{ headers: layers.login.headers, body: layers.login.body }} />
        </LayerSection>
      )}

      {layers?.auth && (
        <LayerSection title={`Token · ${layers.auth.label || ""}`} ok={layers.auth.ok} defaultOpen={layers.auth.ok === false}>
          {layers.auth.error && <p className="text-xs text-red-300">{layers.auth.error}</p>}
          {layers.auth.status !== undefined && (
            <p className="font-mono text-xs text-zinc-400">
              HTTP {layers.auth.status}
              {layers.auth.durationMs != null ? ` · ${layers.auth.durationMs}ms` : ""}
            </p>
          )}
          <JsonBlock label="请求入参" value={layers.auth.request} />
          <JsonBlock label="响应出参" value={{ headers: layers.auth.headers, body: layers.auth.body }} />
        </LayerSection>
      )}

      {layers?.call && (
        <LayerSection title="接口调用" ok={callOk} defaultOpen>
          {layers.call.error && <p className="text-xs text-red-300">{layers.call.error}</p>}
          {layers.call.status !== undefined && (
            <p className="font-mono text-xs text-zinc-400">
              HTTP {layers.call.status}
              {layers.call.durationMs != null ? ` · ${layers.call.durationMs}ms` : ""}
            </p>
          )}
          <JsonBlock label="调用入参" value={layers.call.request} />
          <JsonBlock
            label="调用出参"
            value={{ status: layers.call.status, headers: layers.call.headers, body: layers.call.body }}
          />
        </LayerSection>
      )}

      <LayerSection
        title={`断言结果${layers?.assertions?.length ? ` (${layers.assertions.filter((a) => a.passed).length}/${layers.assertions.length})` : ""}`}
        ok={assertOk}
        defaultOpen={assertOk === false || !layers?.call}
      >
        {layers?.assertions?.length ? (
          <div className="space-y-2">
            {layers.assertions.map((a, i) => (
              <div
                key={a.id || i}
                className={`rounded-md border p-2 ${
                  a.passed ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className={a.passed ? "text-emerald-300" : "text-red-300"}>
                    {a.passed ? "通过" : "失败"}
                  </span>
                  <span className="text-zinc-300">{a.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                  <div>
                    <div className="text-zinc-500">operator</div>
                    <div>{a.operator}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">actual</div>
                    <div className="break-all">{safeStringify(a.actual)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">expected</div>
                    <div className="break-all">{safeStringify(a.expected)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">无断言结果（可能在断言前已失败）</p>
        )}
      </LayerSection>

      {detail.error && !layers?.call && (
        <LayerSection title="错误信息" ok={false} defaultOpen>
          <pre className="font-mono text-xs text-red-300">{detail.error}</pre>
          {detail.details !== undefined && <JsonBlock label="details" value={detail.details} />}
        </LayerSection>
      )}
    </div>
  );
}

function CaseResults() {
  const caseResults = useStore((s) => s.caseResults);
  const selectedCaseResultId = useStore((s) => s.selectedCaseResultId);
  const setCaseRun = useStore((s) => s.setCaseRun);
  if (!caseResults.length) return null;
  const detail: CaseRunResult | undefined = caseResults.find((r) => r.id === selectedCaseResultId);

  return (
    <div className="grid h-72 shrink-0 grid-cols-[220px_1fr] border-t border-line">
      <div className="overflow-y-auto border-r border-line bg-panel">
        <div className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          运行结果
        </div>
        {caseResults.map((r) => (
          <button
            key={r.id}
            onClick={() => setCaseRun({ selectedCaseResultId: r.id })}
            className={`flex w-full items-center gap-2 border-b border-line-soft px-3 py-2 text-left text-sm ${
              selectedCaseResultId === r.id ? "bg-brand-soft" : "hover:bg-line-soft"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${r.ok ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
          </button>
        ))}
      </div>
      <div className="overflow-auto bg-[#0f1117]">
        {detail ? (
          <CaseResultDetail detail={detail} />
        ) : (
          <p className="p-3 text-sm text-zinc-500">选择左侧一条结果查看分层详情</p>
        )}
      </div>
    </div>
  );
}

function ApiRow({
  name,
  method,
  selected,
  onClick,
}: {
  name: string;
  method: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
        selected ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-line-soft"
      }`}
    >
      <span className="w-10 shrink-0 font-mono text-[10px] font-semibold text-ink-faint">{method}</span>
      <span className="truncate">{name}</span>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2z" />
    </svg>
  );
}
