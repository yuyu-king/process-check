import { selectCurrentScenario, useStore, findNode } from "../store";
import type { AssertOperator, FlowNode, Json, Scenario } from "../types";
import { NODE_META } from "../lib/format";
import { Button, Field, JsonField, Select, TextInput, Toggle } from "./ui";

const OPERATORS: AssertOperator[] = [
  "equals",
  "notEquals",
  "exists",
  "truthy",
  "contains",
  "greaterThan",
  "matches",
];

export default function Inspector() {
  const scenario = useStore(selectCurrentScenario);
  const selection = useStore((s) => s.selection);

  let body = <ScenarioPanel scenario={scenario} />;
  if (selection?.kind === "node" && scenario) {
    const node = findNode(scenario, selection.id);
    if (node) body = <NodePanel key={node.id} node={node} scenario={scenario} />;
  } else if (selection?.kind === "edge") {
    body = <EdgePanel source={selection.source} target={selection.target} scenario={scenario} />;
  }

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}

function PanelHeader({ title, subtitle, color }: { title: string; subtitle?: string; color?: string }) {
  return (
    <div className="border-b border-line px-4 py-3.5">
      <div className="flex items-center gap-2">
        {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
    </div>
  );
}

function ScenarioPanel({ scenario }: { scenario?: Scenario }) {
  const workspace = useStore((s) => s.workspace);
  const updateScenario = useStore((s) => s.updateScenario);
  const updateWorkspaceMeta = useStore((s) => s.updateWorkspaceMeta);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);

  if (!scenario) {
    return (
      <>
        <PanelHeader title="工作区" subtitle="选择或新建场景开始编排" />
        <div className="p-4 text-sm text-ink-faint">左侧新建一个场景。</div>
      </>
    );
  }

  const actors = scenario.nodes.filter((n) => n.type === "actor");
  const env = workspace.environments[workspace.activeEnvironment] || {};

  return (
    <>
      <PanelHeader title="场景设置" subtitle="默认 Header、环境变量对整个场景生效" />
      <div className="space-y-4 p-4">
        <Field label="场景名称">
          <TextInput
            value={scenario.name}
            onChange={(e) => updateScenario(scenario.id, { name: e.target.value })}
          />
        </Field>
        <Field label="描述">
          <TextInput
            value={scenario.description || ""}
            placeholder="这个场景验证什么…"
            onChange={(e) => updateScenario(scenario.id, { description: e.target.value })}
          />
        </Field>
        <Field label="所属分组">
          <Select
            value={scenario.groupId || ""}
            onChange={(e) => updateScenario(scenario.id, { groupId: e.target.value || undefined })}
          >
            <option value="">未分组</option>
            {workspace.scenarioGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>

        <Divider label="场景默认 Header" />
        <JsonField
          label="默认 Header（每个 API 都会自动带上）"
          value={scenario.defaultHeaders}
          rows={4}
          hint='例如 {"X-Tenant":"acme"}。节点自身 Header / Override 可覆盖同名值。'
          onCommit={(v) => updateScenario(scenario.id, { defaultHeaders: v as Json })}
        />

        <Divider label="流程中的角色节点" />
        {actors.length ? (
          <div className="space-y-1.5">
            {actors.map((a) => {
              const lib = workspace.actors.find((x) => x.id === a.data.actorId);
              return (
                <button
                  key={a.id}
                  onClick={() => select({ kind: "node", id: a.id })}
                  className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm transition hover:border-brand hover:bg-brand-soft"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-md font-mono text-[11px] font-bold text-white"
                    style={{ background: NODE_META.actor.color }}
                  >
                    @
                  </span>
                  <span className="flex-1 truncate">{lib?.name || "未选择角色"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ink-faint">
            从左侧面板拖入角色以切换会话。公共 API 可不选角色。
          </p>
        )}
        <Button size="sm" variant="ghost" onClick={() => setView("actors")}>
          打开角色库 →
        </Button>

        <Divider label="环境 / 变量" />
        <Field label="当前环境 baseUrl" hint="模板中用 {{env.baseUrl}} 引用">
          <TextInput
            value={(env.baseUrl as string) || ""}
            placeholder="http://127.0.0.1:4321"
            onChange={(e) =>
              updateWorkspaceMeta({
                environments: {
                  ...workspace.environments,
                  [workspace.activeEnvironment]: { ...env, baseUrl: e.target.value },
                },
              })
            }
          />
        </Field>
        <JsonField
          label="共享初始变量"
          value={workspace.variables}
          rows={3}
          hint="运行期用 {{shared.xxx}}；接口可通过 saveAs 写回。"
          onCommit={(v) => updateWorkspaceMeta({ variables: v as Json })}
        />
      </div>
    </>
  );
}

function NodePanel({ node, scenario }: { node: FlowNode; scenario: Scenario }) {
  const meta = NODE_META[node.type];
  const deleteNode = useStore((s) => s.deleteNode);
  const renameNode = useStore((s) => s.renameNode);

  return (
    <>
      <PanelHeader title={meta.label} subtitle={meta.hint} color={meta.color} />
      <div className="space-y-4 p-4">
        <Field label="节点 ID" hint="变量路径使用此值，如 {{steps.<id>.body}}">
          <TextInput
            defaultValue={node.id}
            onBlur={(e) => {
              if (e.target.value !== node.id && !renameNode(node.id, e.target.value.trim())) {
                e.target.value = node.id;
                alert("节点 ID 不能为空或重复");
              }
            }}
          />
        </Field>

        {node.type === "actor" && <ActorRefFields node={node} />}
        {node.type === "action" && <ActionRefFields node={node} scenario={scenario} />}
        {node.type === "assert" && <AssertFields node={node} />}
        {node.type === "scenario" && <ScenarioRefFields node={node} scenario={scenario} />}

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="danger" className="ml-auto" onClick={() => deleteNode(node.id)}>
            删除节点
          </Button>
        </div>
      </div>
    </>
  );
}

function ActorRefFields({ node }: { node: FlowNode }) {
  const workspace = useStore((s) => s.workspace);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const setView = useStore((s) => s.setView);
  const selectActor = useStore((s) => s.selectActor);
  const actor = workspace.actors.find((a) => a.id === node.data.actorId);

  return (
    <>
      <Field label="引用角色" hint="在角色库中维护登录与 Token 配置">
        <Select
          value={node.data.actorId || ""}
          onChange={(e) => updateNodeData(node.id, { actorId: e.target.value })}
        >
          <option value="">请选择…</option>
          {workspace.actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      {actor && (
        <div className="rounded-lg border border-line bg-line-soft/40 px-3 py-2 text-xs text-ink-soft">
          <div className="font-medium text-ink">{actor.name}</div>
          <div className="mt-1 font-mono text-[11px]">
            {actor.login.method} {actor.login.url || "（无登录地址）"}
          </div>
          {actor.auth.enabled && (
            <div className="mt-1 text-[11px] text-brand">Token → {actor.auth.headerName}</div>
          )}
          <button
            className="mt-2 text-[11px] text-brand"
            onClick={() => {
              selectActor(actor.id);
              setView("actors");
            }}
          >
            在角色库中编辑 →
          </button>
        </div>
      )}
    </>
  );
}

function ActionRefFields({ node, scenario }: { node: FlowNode; scenario: Scenario }) {
  const workspace = useStore((s) => s.workspace);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const setView = useStore((s) => s.setView);
  const selectApi = useStore((s) => s.selectApi);
  const api = workspace.apis.find((a) => a.id === node.data.apiId);
  const actorNodes = scenario.nodes.filter((n) => n.type === "actor");

  return (
    <>
      <Field label="引用 API" hint="在 API 库中维护请求定义">
        <Select
          value={node.data.apiId || ""}
          onChange={(e) => updateNodeData(node.id, { apiId: e.target.value })}
        >
          <option value="">请选择…</option>
          {workspace.apis.map((a) => (
            <option key={a.id} value={a.id}>
              {a.request.method} · {a.name}
            </option>
          ))}
        </Select>
      </Field>
      {api && (
        <div className="rounded-lg border border-line bg-line-soft/40 px-3 py-2 text-xs text-ink-soft">
          <div className="font-medium text-ink">{api.name}</div>
          <div className="mt-1 break-all font-mono text-[11px]">
            {api.request.method} {api.request.url}
          </div>
          <button
            className="mt-2 text-[11px] text-brand"
            onClick={() => {
              selectApi(api.id);
              setView("apis");
            }}
          >
            在 API 库中编辑 →
          </button>
        </div>
      )}

      <Field label="使用角色节点" hint="留空则沿用链路中最近的角色；也可不选（公共接口）">
        <Select
          value={node.data.actorNodeId || ""}
          onChange={(e) => updateNodeData(node.id, { actorNodeId: e.target.value || undefined })}
        >
          <option value="">自动（最近角色）</option>
          {actorNodes.map((a) => {
            const name = workspace.actors.find((x) => x.id === a.data.actorId)?.name || a.id;
            return (
              <option key={a.id} value={a.id}>
                {name}
              </option>
            );
          })}
        </Select>
      </Field>

      <Divider label="步骤覆盖" />
      <JsonField
        label="请求覆盖 (requestOverride)"
        value={node.data.requestOverride ?? {}}
        rows={4}
        hint={`深合并到 API 定义，如 {"body":{"name":"场景专用"}}`}
        onCommit={(v) =>
          updateNodeData(node.id, {
            requestOverride: Object.keys(v as Json).length
              ? (v as FlowNode["data"]["requestOverride"])
              : undefined,
          })
        }
      />
      <Field label="保存响应到共享变量">
        <TextInput
          value={node.data.saveAs || ""}
          placeholder="project"
          onChange={(e) => updateNodeData(node.id, { saveAs: e.target.value || undefined })}
        />
      </Field>
      <JsonField
        label="写入场景默认 Header"
        value={node.data.setDefaultHeaders ?? {}}
        rows={2}
        hint={`如 {"X-Token":"{{steps.${node.id}.body.token}}"}`}
        onCommit={(v) =>
          updateNodeData(node.id, {
            setDefaultHeaders: Object.keys(v as Json).length ? (v as Json) : undefined,
          })
        }
      />
      <Toggle
        checked={node.data.continueOnFailure === true}
        onChange={(v) => updateNodeData(node.id, { continueOnFailure: v })}
        label="失败也继续执行后续节点"
      />
    </>
  );
}

function AssertFields({ node }: { node: FlowNode }) {
  const updateNodeData = useStore((s) => s.updateNodeData);
  return (
    <>
      <Field label="断言名称">
        <TextInput
          value={node.data.label || ""}
          onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
        />
      </Field>
      <Field label="实际值" hint="如 {{steps.create-project.status}}">
        <TextInput
          value={node.data.actual || ""}
          onChange={(e) => updateNodeData(node.id, { actual: e.target.value })}
        />
      </Field>
      <Field label="操作符">
        <Select
          value={node.data.operator || "equals"}
          onChange={(e) => updateNodeData(node.id, { operator: e.target.value as AssertOperator })}
        >
          {OPERATORS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      </Field>
      <JsonField
        label="期望值 (JSON)"
        value={node.data.expected ?? null}
        rows={2}
        onCommit={(v) => updateNodeData(node.id, { expected: v })}
      />
    </>
  );
}

function ScenarioRefFields({ node, scenario }: { node: FlowNode; scenario: Scenario }) {
  const workspace = useStore((s) => s.workspace);
  const updateNodeData = useStore((s) => s.updateNodeData);
  const options = workspace.scenarios.filter((s) => s.id !== scenario.id);
  return (
    <Field label="引用子场景" hint="子场景与父场景共享 shared 变量与会话">
      <Select
        value={node.data.scenarioId || ""}
        onChange={(e) => updateNodeData(node.id, { scenarioId: e.target.value })}
      >
        <option value="">请选择…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function EdgePanel({
  source,
  target,
}: {
  source: string;
  target: string;
  scenario?: Scenario;
}) {
  const deleteEdge = useStore((s) => s.deleteEdge);
  return (
    <>
      <PanelHeader title="连线" subtitle="定义执行顺序，可一对多 / 多对一" />
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm">
          <span className="truncate font-medium">{source}</span>
          <span className="text-ink-faint">→</span>
          <span className="truncate font-medium">{target}</span>
        </div>
        <Button variant="danger" onClick={() => deleteEdge(source, target)}>
          删除连线
        </Button>
      </div>
    </>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
