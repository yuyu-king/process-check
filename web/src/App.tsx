import { useStore } from "./store";
import Topbar from "./components/Topbar";
import Sidebar from "./components/Sidebar";
import FlowEditor from "./components/FlowEditor";
import Inspector from "./components/Inspector";
import RunPanel from "./components/RunPanel";
import ApisLibrary from "./components/ApisLibrary";
import ActorsLibrary from "./components/ActorsLibrary";

export default function App() {
  const view = useStore((s) => s.view);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar />
      {view === "flow" && (
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden bg-canvas">
              <FlowEditor />
            </div>
            <RunPanel />
          </div>
          <Inspector />
        </div>
      )}
      {view === "apis" && <ApisLibrary />}
      {view === "actors" && <ActorsLibrary />}
    </div>
  );
}
