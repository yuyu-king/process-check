import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { Scenario } from "../types";
import { Button, IconButton, usePrompt } from "./ui";

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
  const { prompt, node: promptNode } = usePrompt();

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

  const scenarioRow = (s: Scenario) => (
    <div
      key={s.id}
      onClick={() => selectScenario(s.id)}
      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
        s.id === scenarioId ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-line-soft"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          s.id === scenarioId ? "bg-brand" : "bg-ink-faint"
        }`}
      />
      <span className="min-w-0 flex-1 truncate">{s.name}</span>
      <span className="hidden items-center gap-0.5 group-hover:flex">
        <IconButton
          title="复制"
          onClick={(e) => {
            e.stopPropagation();
            duplicateScenario(s.id);
          }}
        >
          <CopyIcon />
        </IconButton>
        <IconButton
          title="删除"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`删除场景「${s.name}」？`)) deleteScenario(s.id);
          }}
        >
          <TrashIcon />
        </IconButton>
      </span>
    </div>
  );

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
          return (
            <div key={g.id} className="mb-1">
              <div className="group flex items-center gap-1 rounded-md px-1.5 py-1.5">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                  className="flex flex-1 items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
                >
                  <ChevronIcon open={!isCollapsed} />
                  <span className="truncate">{g.name}</span>
                  <span className="text-ink-faint/70">{items.length}</span>
                </button>
                <span className="hidden items-center group-hover:flex">
                  <IconButton
                    title="新增场景到该分组"
                    onClick={() => onAddScenario(g.id)}
                  >
                    <PlusIcon />
                  </IconButton>
                  <IconButton
                    title="重命名分组"
                    onClick={async () => {
                      const name = await prompt("重命名分组", g.name);
                      if (name) renameGroup(g.id, name);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    title="删除分组（场景移到未分组）"
                    onClick={() => {
                      if (confirm(`删除分组「${g.name}」？场景将移到未分组。`)) deleteGroup(g.id);
                    }}
                  >
                    <TrashIcon />
                  </IconButton>
                </span>
              </div>
              {!isCollapsed && (
                <div className="ml-1.5 border-l border-line pl-1.5">
                  {items.length ? (
                    items.map(scenarioRow)
                  ) : (
                    <p className="px-2.5 py-2 text-xs text-ink-faint">拖拽或新增场景到此</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="mb-1 mt-2">
          <div className="px-1.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            未分组
          </div>
          <div className="ml-1.5 border-l border-line pl-1.5">
            {grouped.ungrouped.length ? (
              grouped.ungrouped.map((s) => (
                <div key={s.id}>
                  {scenarioRow(s)}
                  {workspace.scenarioGroups.length > 0 && s.id === scenarioId && (
                    <div className="px-2.5 pb-1">
                      <select
                        value=""
                        onChange={(e) => e.target.value && moveScenario(s.id, e.target.value)}
                        className="w-full rounded-md border border-line bg-white px-2 py-1 text-[11px] text-ink-soft"
                      >
                        <option value="">移动到分组…</option>
                        {workspace.scenarioGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="px-2.5 py-2 text-xs text-ink-faint">暂无未分组场景</p>
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
    </aside>
  );
}

/* --- inline icons (16px) --- */
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
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
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
