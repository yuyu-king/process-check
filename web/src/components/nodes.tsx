import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNodeData, NodeType } from "../types";
import { NODE_META } from "../lib/format";

export type NodeStatus = "idle" | "running" | "success" | "failure";

export interface RFNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  title: string;
  subtitle: string;
  status: NodeStatus;
  raw: FlowNodeData;
}

const statusRing: Record<NodeStatus, string> = {
  idle: "",
  running: "ring-2 ring-amber-300 animate-pulse",
  success: "ring-2 ring-emerald-300",
  failure: "ring-2 ring-red-300",
};

const statusDot: Record<NodeStatus, string> = {
  idle: "bg-line",
  running: "bg-amber-400",
  success: "bg-emerald-500",
  failure: "bg-red-500",
};

function NodeCard({ data, selected }: NodeProps) {
  const d = data as RFNodeData;
  const meta = NODE_META[d.nodeType];
  return (
    <div
      className={`group relative w-[210px] rounded-xl border bg-white shadow-sm transition ${
        selected ? "border-brand shadow-md" : "border-line hover:border-ink-faint"
      } ${statusRing[d.status]}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!-left-1.5 !h-3 !w-3 !border-2"
        style={{ borderColor: meta.color }}
      />
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold text-white"
          style={{ background: meta.color }}
        >
          {meta.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-ink">{d.title}</div>
          <div className="text-[11px] text-ink-faint">{meta.label}</div>
        </div>
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[d.status]}`} />
      </div>
      <div className="mx-3 my-2.5 truncate rounded-md bg-line-soft px-2 py-1.5 font-mono text-[11px] text-ink-soft">
        {d.subtitle || meta.hint}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!-right-1.5 !h-3 !w-3 !border-2"
        style={{ borderColor: meta.color }}
      />
    </div>
  );
}

export const nodeTypes = {
  actor: NodeCard,
  action: NodeCard,
  assert: NodeCard,
  scenario: NodeCard,
};
