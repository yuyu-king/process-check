import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge as rfAddEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useStore, selectCurrentScenario } from "../store";
import { NODE_META } from "../lib/format";
import { nodeTypes, type NodeStatus, type RFNodeData } from "./nodes";
import type { FlowNode, FlowNodeData, NodeType, RunEvent, Scenario, Workspace } from "../types";

function nodeTitle(node: FlowNode, ws: Workspace): string {
  if (node.type === "actor") {
    return ws.actors.find((a) => a.id === node.data.actorId)?.name || "未选择角色";
  }
  if (node.type === "action") {
    return ws.apis.find((a) => a.id === node.data.apiId)?.name || "未选择 API";
  }
  if (node.type === "scenario")
    return ws.scenarios.find((s) => s.id === node.data.scenarioId)?.name || "未选择子场景";
  return node.data.label || "断言";
}

function nodeSubtitle(node: FlowNode, ws: Workspace): string {
  if (node.type === "actor") {
    const actor = ws.actors.find((a) => a.id === node.data.actorId);
    if (!actor) return "从角色库选择";
    return actor.auth?.enabled ? "登录 + 注入 Token" : "切换会话";
  }
  if (node.type === "action") {
    const api = ws.apis.find((a) => a.id === node.data.apiId);
    if (!api) return "从 API 库选择";
    const ov =
      node.data.requestOverride &&
      typeof node.data.requestOverride === "object" &&
      node.data.requestOverride.body != null
        ? " · 有覆盖"
        : "";
    return `${api.request.method} ${api.request.url}${ov}`;
  }
  if (node.type === "scenario") return "执行并共享变量";
  return `${node.data.operator || "equals"} ${JSON.stringify(node.data.expected ?? "")}`;
}

function computeStatuses(events: RunEvent[]): Record<string, NodeStatus> {
  const map: Record<string, NodeStatus> = {};
  for (const e of events) {
    if (!e.nodeId) continue;
    if (e.type.endsWith("success")) map[e.nodeId] = "success";
    else if (e.type.includes("failure") || e.type === "node:error") map[e.nodeId] = "failure";
    else if (e.type.endsWith("start")) map[e.nodeId] = "running";
  }
  return map;
}

function toRFNodes(
  scenario: Scenario,
  ws: Workspace,
  statuses: Record<string, NodeStatus>,
  selectedId: string | null,
): Node<RFNodeData>[] {
  return scenario.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    selected: n.id === selectedId,
    data: {
      nodeType: n.type,
      title: nodeTitle(n, ws),
      subtitle: nodeSubtitle(n, ws),
      status: statuses[n.id] || "idle",
      raw: n.data,
    },
  }));
}

function toRFEdges(scenario: Scenario, running: boolean): Edge[] {
  return scenario.edges.map((e) => ({
    id: `${e.source}=>${e.target}`,
    source: e.source,
    target: e.target,
    animated: running,
    type: "smoothstep",
  }));
}

type DragPayload =
  | { kind: "nodeType"; type: NodeType }
  | { kind: "actor"; actorId: string }
  | { kind: "api"; apiId: string };

function Canvas() {
  const scenario = useStore(selectCurrentScenario);
  const workspace = useStore((s) => s.workspace);
  const events = useStore((s) => s.events);
  const runState = useStore((s) => s.runState);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const moveNode = useStore((s) => s.moveNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const deleteEdge = useStore((s) => s.deleteEdge);
  const addEdge = useStore((s) => s.addEdge);
  const addNode = useStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const statuses = useMemo(() => computeStatuses(events), [events]);
  const selectedId = selection?.kind === "node" ? selection.id : null;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RFNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!scenario) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes(toRFNodes(scenario, workspace, statuses, selectedId));
    setEdges(toRFEdges(scenario, runState === "running"));
  }, [scenario, workspace, statuses, selectedId, runState, setNodes, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) {
        addEdge(c.source, c.target);
        setEdges((eds) => rfAddEdge({ ...c, type: "smoothstep" }, eds));
      }
    },
    [addEdge, setEdges],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      let payload: DragPayload | null = null;
      try {
        payload = JSON.parse(event.dataTransfer.getData("application/process-check")) as DragPayload;
      } catch {
        const legacy = event.dataTransfer.getData("application/reactflow") as NodeType;
        if (legacy) payload = { kind: "nodeType", type: legacy };
      }
      if (!payload) return;
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      if (payload.kind === "actor") {
        addNode("actor", x, y, { actorId: payload.actorId });
      } else if (payload.kind === "api") {
        addNode("action", x, y, { apiId: payload.apiId });
      } else if (payload.kind === "nodeType") {
        const data: FlowNodeData | undefined =
          payload.type === "actor"
            ? { actorId: workspace.actors[0]?.id || "" }
            : payload.type === "action"
              ? { apiId: workspace.apis[0]?.id || "" }
              : undefined;
        addNode(payload.type, x, y, data);
      }
    },
    [screenToFlowPosition, addNode, workspace.actors, workspace.apis],
  );

  if (!scenario) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-faint">
        请选择或创建一个场景
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select({ kind: "node", id: n.id })}
        onNodeDragStop={(_, n) => moveNode(n.id, Math.round(n.position.x), Math.round(n.position.y))}
        onEdgeClick={(_, e) => select({ kind: "edge", source: e.source, target: e.target })}
        onPaneClick={() => select({ kind: "scenario" })}
        onNodesDelete={(ns) => ns.forEach((n) => deleteNode(n.id))}
        onEdgesDelete={(es) => es.forEach((e) => deleteEdge(e.source, e.target))}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.75}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#dcdce3" />
        <Controls showInteractive={false} className="!shadow-md" />
        <MiniMap
          pannable
          zoomable
          className="!rounded-lg !border !border-line"
          nodeColor={(n) => NODE_META[(n.data as RFNodeData).nodeType]?.color || "#ccc"}
        />
      </ReactFlow>
      <Palette />
    </div>
  );
}

function Palette() {
  const workspace = useStore((s) => s.workspace);
  const setView = useStore((s) => s.setView);

  const drag = (payload: DragPayload) => (e: React.DragEvent) => {
    e.dataTransfer.setData("application/process-check", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="absolute left-4 top-4 z-10 flex max-h-[calc(100%-2rem)] w-56 flex-col gap-2 overflow-hidden">
      <div className="rounded-xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          添加节点
        </div>
        <div className="flex flex-col gap-1.5">
          {(
            [
              { type: "assert" as const },
              { type: "scenario" as const },
            ] as const
          ).map(({ type }) => {
            const meta = NODE_META[type];
            return (
              <div
                key={type}
                draggable
                onDragStart={drag({ kind: "nodeType", type })}
                className="flex cursor-grab items-center gap-2.5 rounded-lg border border-line bg-white px-2.5 py-2 transition hover:border-brand hover:bg-brand-soft active:cursor-grabbing"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold text-white"
                  style={{ background: meta.color }}
                >
                  {meta.glyph}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">{meta.label}</div>
                  <div className="truncate text-[10px] text-ink-faint">{meta.hint}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">角色</span>
          <button className="text-[10px] text-brand" onClick={() => setView("actors")}>
            管理
          </button>
        </div>
        {workspace.actors.length ? (
          workspace.actors.map((a) => (
            <div
              key={a.id}
              draggable
              onDragStart={drag({ kind: "actor", actorId: a.id })}
              className="mb-1 flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-line-soft active:cursor-grabbing"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded font-mono text-[10px] font-bold text-white"
                style={{ background: NODE_META.actor.color }}
              >
                @
              </span>
              <span className="truncate">{a.name}</span>
            </div>
          ))
        ) : (
          <p className="mb-2 text-[11px] text-ink-faint">先在角色库创建</p>
        )}

        <div className="mb-1 mt-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">API</span>
          <button className="text-[10px] text-brand" onClick={() => setView("apis")}>
            管理
          </button>
        </div>
        {workspace.apis.length ? (
          workspace.apis.map((a) => (
            <div
              key={a.id}
              draggable
              onDragStart={drag({ kind: "api", apiId: a.id })}
              className="mb-1 flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-line-soft active:cursor-grabbing"
            >
              <span className="w-8 shrink-0 font-mono text-[9px] text-ink-faint">{a.request.method}</span>
              <span className="truncate">{a.name}</span>
            </div>
          ))
        ) : (
          <p className="text-[11px] text-ink-faint">先在 API 库创建</p>
        )}
      </div>
    </div>
  );
}

export default function FlowEditor() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
