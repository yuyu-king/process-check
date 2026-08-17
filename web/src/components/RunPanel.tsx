import { useStore } from "../store";
import { safeStringify } from "../lib/format";
import { IconButton } from "./ui";

function eventTone(type: string): "ok" | "fail" | "info" {
  if (type.endsWith("success")) return "ok";
  if (type.includes("failure") || type === "node:error") return "fail";
  return "info";
}

export default function RunPanel() {
  const events = useStore((s) => s.events);
  const runState = useStore((s) => s.runState);
  const runOpen = useStore((s) => s.runOpen);
  const selectedEvent = useStore((s) => s.selectedEvent);
  const setRun = useStore((s) => s.setRun);

  if (!runOpen) return null;

  const detail = selectedEvent !== null ? events[selectedEvent] : null;

  return (
    <div className="flex h-72 shrink-0 flex-col border-t border-line bg-panel">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2">
        <h3 className="text-sm font-semibold text-ink">运行日志</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            runState === "success"
              ? "bg-emerald-50 text-emerald-600"
              : runState === "failure"
                ? "bg-red-50 text-fail"
                : runState === "running"
                  ? "bg-amber-50 text-amber-600"
                  : "bg-line-soft text-ink-soft"
          }`}
        >
          {runState === "running"
            ? "运行中…"
            : runState === "success"
              ? "验证通过"
              : runState === "failure"
                ? "验证失败"
                : "未运行"}
        </span>
        <span className="text-xs text-ink-faint">{events.length} 个事件</span>
        <IconButton className="ml-auto" title="关闭" onClick={() => setRun({ runOpen: false })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </IconButton>
      </div>
      <div className="grid flex-1 grid-cols-[300px_1fr] overflow-hidden">
        <div className="overflow-y-auto border-r border-line">
          {events.length ? (
            events.map((e, i) => {
              const tone = eventTone(e.type);
              return (
                <button
                  key={i}
                  onClick={() => setRun({ selectedEvent: i })}
                  className={`flex w-full items-center gap-2 border-b border-line-soft px-3 py-2 text-left text-sm transition ${
                    selectedEvent === i ? "bg-brand-soft" : "hover:bg-line-soft"
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      tone === "ok" ? "bg-emerald-500" : tone === "fail" ? "bg-red-500" : "bg-ink-faint"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">{e.label || e.type}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">{e.type}</span>
                </button>
              );
            })
          ) : (
            <p className="p-4 text-sm text-ink-faint">运行场景后，这里显示每个角色、接口和断言的详情。</p>
          )}
        </div>
        <div className="overflow-auto bg-[#0f1117] p-4">
          <pre className="font-mono text-xs leading-relaxed text-[#d5d8e0]">
            {detail ? safeStringify(detail) : "选择左侧一条事件查看请求 / 响应 / 断言详情。"}
          </pre>
        </div>
      </div>
    </div>
  );
}
