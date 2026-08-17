import { useMemo, useState, type DragEvent } from "react";
import { useStore } from "../store";
import type { Scenario } from "../types";
import { Button, GroupHeaderActions, IconButton, MoreMenu, usePickOption, usePrompt } from "./ui";

const UNGROUPED = "";
const DRAG_TYPE = "application/x-process-check-scenario";

export default function Sidebar() {
  const workspace = useStore((s) => s.workspace);
  const scenarioId = useStore((s) => s.scenarioId);
  const selectScenario = useStore((s) => s.selectScenario);
  const addScenario = useStore((s) => s.addScenario);
  const deleteScenario = useStore((s) => s.deleteScenario);
  const duplicateScenario = useStore((s) => s.duplicateScenario);
  const moveScenario = useStore((s) => s.moveScenario);
  const addGroup = useStore((s) => s.addScenarioGroup);
  const deleteGroup = useStore((s) => s.deleteScenarioGroup);
  const renameGroup = useStore((s) => s.renameScenarioGroup);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const { prompt, node: promptNode } = usePrompt();
  const { pick, node: pickNode } = usePickOption();

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (s: Scenario) => !q || s.name.toLowerCase().includes(q);
    const byGroup = new Map<string, Scenario[]>();
    const ungrouped: Scenario[] = [];
    for (const s of workspace.scenarios) {
      if (!match(s)) continue;
      if (s.groupId && workspace.scenarioGroups.some((g) => g.id === s.groupId)) {
        byGroup.set(s.groupId, [...(byGroup.get(s.groupId) || []), s]);
      } else ungrouped.push(s);
    }
    return { byGroup, ungrouped };
  }, [workspace, query]);

  const onAddScenario = async (groupId?: string) => {
    const name = await prompt("新建场景", `场景 ${workspace.scenarios.length + 1}`);
    if (name) addScenario(name, groupId);
  };
  const onAddGroup = async () => {
    const name = await prompt("新建分组", `分组 ${workspace.scenarioGroups.length + 1}`);
    if (name) addGroup(name);
  };

  const onMoveTo = async (s: Scenario) => {
    const options = [
      ...workspace.scenarioGroups.map((g) => ({ value: g.id, label: g.name })),
      { value: UNGROUPED, label: "未分组（移出分组）" },
    ];
    const current = s.groupId && workspace.scenarioGroups.some((g) => g.id === s.groupId) ? s.groupId : UNGROUPED;
    const picked = await pick("移动到分组", options, current);
    if (picked === null) return;
    const next = picked === UNGROUPED ? undefined : picked;
    if (next === s.groupId || (!next && !s.groupId)) return;
    moveScenario(s.id, next);
  };

  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData(DRAG_TYPE, id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOverZone = (e: DragEvent, zoneKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(zoneKey);
  };

  const onDropZone = (e: DragEvent, groupId: string | undefined) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    if (!id) return;
    const s = workspace.scenarios.find((x) => x.id === id);
    if (!s) return;
    const cur = s.groupId && workspace.scenarioGroups.some((g) => g.id === s.groupId) ? s.groupId : undefined;
    if (cur === groupId) return;
    moveScenario(id, groupId);
  };

  const scenarioRow = (s: Scenario) => (
    <div
      key={s.id}
      draggable
      onDragStart={(e) => onDragStart(e, s.id)}
      onDragEnd={() => setDropTarget(null)}
      onClick={() => selectScenario(s.id)}
      className={`group flex cursor-grab items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition active:cursor-grabbing ${
        s.id === scenarioId ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-line-soft"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          s.id === scenarioId ? "bg-brand" : "bg-ink-faint"
        }`}
      />
      <span className="min-w-0 flex-1 truncate">{s.name}</span>
      <span className="hidden group-hover:flex">
        <MoreMenu
          items={[
            { label: "复制", onClick: () => duplicateScenario(s.id) },
            {
              label: "移动到…",
              disabled: workspace.scenarioGroups.length === 0 && !s.groupId,
              onClick: () => void onMoveTo(s),
            },
            {
              label: "删除",
              danger: true,
              onClick: () => {
                if (confirm(`删除场景「${s.name}」？`)) deleteScenario(s.id);
              },
            },
          ]}
        />
      </span>
    </div>
  );

  const dropZoneCls = (key: string) =>
    dropTarget === key ? "rounded-md bg-brand-soft/80 ring-1 ring-brand/40" : "";

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <h2 className="flex-1 text-sm font-semibold text-ink">场景库</h2>
        <IconButton title="新建分组" onClick={onAddGroup}>
          <FolderPlusIcon />
        </IconButton>
        <IconButton title="新建场景" onClick={() => onAddScenario()}>
          <PlusIcon />
        </IconButton>
      </div>
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索场景…"
          className="w-full rounded-lg border border-line bg-line-soft px-3 py-1.5 text-sm outline-none transition focus:border-brand focus:bg-white"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {workspace.scenarioGroups.map((g) => {
          const items = grouped.byGroup.get(g.id) || [];
          const isCollapsed = collapsed[g.id];
          const zoneKey = `g:${g.id}`;
          return (
            <div
              key={g.id}
              className={`mb-1 ${dropZoneCls(zoneKey)}`}
              onDragOver={(e) => onDragOverZone(e, zoneKey)}
              onDragLeave={() => setDropTarget((t) => (t === zoneKey ? null : t))}
              onDrop={(e) => onDropZone(e, g.id)}
            >
              <div className="group flex items-center gap-1 rounded-md px-1.5 py-1.5">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                  className="flex flex-1 items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
                >
                  <ChevronIcon open={!isCollapsed} />
                  <span className="truncate">{g.name}</span>
                  <span className="text-ink-faint/70">{items.length}</span>
                </button>
                <GroupHeaderActions
                  onAdd={() => onAddScenario(g.id)}
                  onRename={async () => {
                    const name = await prompt("重命名分组", g.name);
                    if (name) renameGroup(g.id, name);
                  }}
                  onDelete={() => {
                    if (confirm(`删除分组「${g.name}」？场景将移到未分组。`)) deleteGroup(g.id);
                  }}
                />
              </div>
              {!isCollapsed && (
                <div className="ml-1.5 border-l border-line pl-1.5">
                  {items.length ? (
                    items.map(scenarioRow)
                  ) : (
                    <p className="px-2.5 py-2 text-xs text-ink-faint">拖到此处，或点 + 新增</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div
          className={`mb-1 mt-2 ${dropZoneCls("ungrouped")}`}
          onDragOver={(e) => onDragOverZone(e, "ungrouped")}
          onDragLeave={() => setDropTarget((t) => (t === "ungrouped" ? null : t))}
          onDrop={(e) => onDropZone(e, undefined)}
        >
          <div className="px-1.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            未分组
          </div>
          <div className="ml-1.5 border-l border-line pl-1.5">
            {grouped.ungrouped.length ? (
              grouped.ungrouped.map(scenarioRow)
            ) : (
              <p className="px-2.5 py-2 text-xs text-ink-faint">拖到此处，或点 + 新增</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-line p-3">
        <Button className="w-full" variant="default" onClick={() => onAddScenario()}>
          <PlusIcon /> 新建场景
        </Button>
      </div>
      {promptNode}
      {pickNode}
    </aside>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function FolderPlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2z" />
      <path d="M12 11v4M10 13h4" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? "" : "-rotate-90"}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
