import { useRef } from "react";
import { selectCurrentScenario, useStore, type ViewMode } from "../store";
import { executeScenario } from "../lib/api";
import { Button, Segmented } from "./ui";
import type { RunEvent } from "../types";

let controller: AbortController | null = null;

export default function Topbar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const workspace = useStore((s) => s.workspace);
  const scenario = useStore(selectCurrentScenario);
  const runState = useStore((s) => s.runState);
  const setRun = useStore((s) => s.setRun);
  const setWorkspace = useStore((s) => s.setWorkspace);
  const updateWorkspaceMeta = useStore((s) => s.updateWorkspaceMeta);
  const fileRef = useRef<HTMLInputElement>(null);

  const runScenario = async () => {
    if (!scenario) return;
    controller?.abort();
    controller = new AbortController();
    setRun({ runState: "running", events: [], selectedEvent: null, runOpen: true });
    try {
      const result = await executeScenario(structuredClone(workspace), scenario.id, controller.signal);
      const events: RunEvent[] =
        result.events ||
        [{ sequence: 0, timestamp: "", type: "node:error", label: result.error || "执行失败" }];
      setRun({
        runState: result.ok ? "success" : "failure",
        events,
        selectedEvent: events.length ? events.length - 1 : null,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setRun({
        runState: "failure",
        events: [
          {
            sequence: 0,
            timestamp: "",
            type: "node:error",
            label: "无法连接执行器",
            error: (e as Error).message,
          },
        ],
        selectedEvent: 0,
      });
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${workspace.name || "process-check"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.scenarios)) throw new Error("缺少 scenarios 数组");
      setWorkspace(data);
    } catch (e) {
      alert(`导入失败：${(e as Error).message}`);
    }
  };

  const running = runState === "running";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand font-mono text-sm font-bold text-white">
          P
        </span>
        <input
          value={workspace.name}
          onChange={(e) => updateWorkspaceMeta({ name: e.target.value })}
          className="w-40 rounded-md bg-transparent px-1 text-sm font-semibold text-ink outline-none hover:bg-line-soft focus:bg-line-soft"
        />
      </div>

      <div className="mx-1">
        <Segmented<ViewMode>
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: "flow", label: "流程编排" },
            { value: "apis", label: "API 库" },
            { value: "actors", label: "角色库" },
          ]}
        />
      </div>

      <div className="flex-1" />

      <select
        value={workspace.activeEnvironment}
        onChange={(e) => updateWorkspaceMeta({ activeEnvironment: e.target.value })}
        className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm text-ink-soft outline-none"
        title="当前环境"
      >
        {Object.keys(workspace.environments).map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
      />
      <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
        导入
      </Button>
      <Button variant="ghost" size="sm" onClick={exportJson}>
        导出
      </Button>

      {view === "flow" && (
        <Button variant="primary" onClick={runScenario} disabled={!scenario || running}>
          {running ? "运行中…" : "▶ 运行场景"}
        </Button>
      )}
    </header>
  );
}
