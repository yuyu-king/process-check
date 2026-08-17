import { create } from "zustand";
import { clone, newApi, newActor, newNode, newScenario, normalizeWorkspace, seedWorkspace, uid } from "./seed";
import type {
  Actor,
  Api,
  CaseRunResult,
  CaseSet,
  FlowNode,
  FlowNodeData,
  Group,
  NodeType,
  RunEvent,
  Scenario,
  TestCase,
  Workspace,
} from "./types";

const STORAGE_KEY = "process-check.workspace.v5";

export type ViewMode = "flow" | "apis" | "actors";
export type RunState = "idle" | "running" | "success" | "failure";
export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; source: string; target: string }
  | { kind: "scenario" }
  | null;

function loadWorkspace(): Workspace {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("process-check.workspace.v4");
    if (!raw) return clone(seedWorkspace);
    return normalizeWorkspace(JSON.parse(raw));
  } catch {
    return clone(seedWorkspace);
  }
}

function persist(ws: Workspace) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  } catch {
    /* ignore */
  }
}

interface StoreState {
  workspace: Workspace;
  view: ViewMode;
  scenarioId: string | null;
  selectedApiId: string | null;
  selectedActorId: string | null;
  caseSetId: string | null;
  selection: Selection;
  runState: RunState;
  events: RunEvent[];
  selectedEvent: number | null;
  runOpen: boolean;
  caseRunState: RunState;
  caseResults: CaseRunResult[];
  selectedCaseId: string | null;
  selectedCaseResultId: string | null;

  setView: (v: ViewMode) => void;
  select: (s: Selection) => void;
  selectScenario: (id: string) => void;
  selectApi: (id: string | null) => void;
  selectActor: (id: string | null) => void;
  setWorkspace: (ws: Workspace) => void;
  updateWorkspaceMeta: (patch: Partial<Workspace>) => void;

  // scenario groups
  addScenarioGroup: (name: string) => void;
  renameScenarioGroup: (id: string, name: string) => void;
  deleteScenarioGroup: (id: string) => void;

  addApiGroup: (name: string) => void;
  renameApiGroup: (id: string, name: string) => void;
  deleteApiGroup: (id: string) => void;

  addActorGroup: (name: string) => void;
  renameActorGroup: (id: string, name: string) => void;
  deleteActorGroup: (id: string) => void;

  // scenarios
  addScenario: (name: string, groupId?: string) => void;
  renameScenario: (id: string, name: string) => void;
  deleteScenario: (id: string) => void;
  duplicateScenario: (id: string) => void;
  moveScenario: (id: string, groupId: string | undefined) => void;
  updateScenario: (id: string, patch: Partial<Scenario>) => void;

  // actors library
  addActor: (name?: string) => string;
  updateActor: (id: string, patch: Partial<Actor>) => void;
  deleteActor: (id: string) => void;
  duplicateActor: (id: string) => void;

  // apis library
  addApi: (name?: string) => string;
  updateApi: (id: string, patch: Partial<Api>) => void;
  deleteApi: (id: string) => void;
  duplicateApi: (id: string) => void;

  // nodes & edges
  addNode: (type: NodeType, x: number, y: number, data?: FlowNodeData) => string;
  updateNodeData: (id: string, patch: FlowNodeData) => void;
  renameNode: (id: string, newId: string) => boolean;
  moveNode: (id: string, x: number, y: number) => void;
  deleteNode: (id: string) => void;
  addEdge: (source: string, target: string) => void;
  deleteEdge: (source: string, target: string) => void;

  // case sets (owned by api)
  setCaseSet: (id: string | null) => void;
  addCaseSet: (apiId: string, name: string) => void;
  renameCaseSet: (id: string, name: string) => void;
  deleteCaseSet: (id: string) => void;
  updateCaseSet: (id: string, patch: Partial<CaseSet>) => void;
  selectCase: (id: string | null) => void;
  addCase: () => void;
  updateCase: (caseId: string, patch: Partial<TestCase>) => void;
  duplicateCase: (caseId: string) => void;
  deleteCase: (caseId: string) => void;

  setRun: (patch: Partial<Pick<StoreState, "runState" | "events" | "selectedEvent" | "runOpen">>) => void;
  setCaseRun: (
    patch: Partial<Pick<StoreState, "caseRunState" | "caseResults" | "selectedCaseResultId">>,
  ) => void;
}

const initial = loadWorkspace();

export const useStore = create<StoreState>((set, get) => {
  const commit = (mutator: (ws: Workspace) => void, extra?: Partial<StoreState>) => {
    const ws = clone(get().workspace);
    mutator(ws);
    persist(ws);
    set({ workspace: ws, ...(extra || {}) });
  };
  const currentScenario = (ws: Workspace) => ws.scenarios.find((s) => s.id === get().scenarioId);

  const groupHelpers = (
    key: "scenarioGroups" | "apiGroups" | "actorGroups",
    clearOnDelete: (ws: Workspace, id: string) => void,
  ) => ({
    add: (name: string) => commit((ws) => ws[key].push({ id: uid("group"), name } as Group)),
    rename: (id: string, name: string) =>
      commit((ws) => {
        const g = ws[key].find((x) => x.id === id);
        if (g) g.name = name;
      }),
    remove: (id: string) =>
      commit((ws) => {
        ws[key] = ws[key].filter((g) => g.id !== id);
        clearOnDelete(ws, id);
      }),
  });

  const scenarioG = groupHelpers("scenarioGroups", (ws, id) => {
    for (const s of ws.scenarios) if (s.groupId === id) s.groupId = undefined;
  });
  const apiG = groupHelpers("apiGroups", (ws, id) => {
    for (const a of ws.apis) if (a.groupId === id) a.groupId = undefined;
  });
  const actorG = groupHelpers("actorGroups", (ws, id) => {
    for (const a of ws.actors) if (a.groupId === id) a.groupId = undefined;
  });

  return {
    workspace: initial,
    view: "flow",
    scenarioId: initial.scenarios[0]?.id ?? null,
    selectedApiId: initial.apis[0]?.id ?? null,
    selectedActorId: initial.actors[0]?.id ?? null,
    caseSetId: initial.caseSets[0]?.id ?? null,
    selection: null,
    runState: "idle",
    events: [],
    selectedEvent: null,
    runOpen: false,
    caseRunState: "idle",
    caseResults: [],
    selectedCaseId: initial.caseSets[0]?.cases[0]?.id ?? null,
    selectedCaseResultId: null,

    setView: (v) => set({ view: v, selection: null }),
    select: (s) => set({ selection: s }),
    selectScenario: (id) =>
      set({ scenarioId: id, selection: null, runState: "idle", events: [], selectedEvent: null }),
    selectApi: (id) => {
      const cs = get().workspace.caseSets.find((c) => c.apiId === id);
      set({
        selectedApiId: id,
        caseSetId: cs?.id ?? null,
        selectedCaseId: cs?.cases[0]?.id ?? null,
        caseResults: [],
        selectedCaseResultId: null,
        caseRunState: "idle",
      });
    },
    selectActor: (id) => set({ selectedActorId: id }),
    setWorkspace: (ws) => {
      const normalized = normalizeWorkspace(ws);
      persist(normalized);
      set({
        workspace: normalized,
        scenarioId: normalized.scenarios[0]?.id ?? null,
        selectedApiId: normalized.apis[0]?.id ?? null,
        selectedActorId: normalized.actors[0]?.id ?? null,
        caseSetId: normalized.caseSets[0]?.id ?? null,
        selection: null,
        selectedCaseId: normalized.caseSets[0]?.cases[0]?.id ?? null,
      });
    },
    updateWorkspaceMeta: (patch) => commit((ws) => Object.assign(ws, patch)),

    addScenarioGroup: scenarioG.add,
    renameScenarioGroup: scenarioG.rename,
    deleteScenarioGroup: scenarioG.remove,
    addApiGroup: apiG.add,
    renameApiGroup: apiG.rename,
    deleteApiGroup: apiG.remove,
    addActorGroup: actorG.add,
    renameActorGroup: actorG.rename,
    deleteActorGroup: actorG.remove,

    addScenario: (name, groupId) => {
      const s = newScenario(name, groupId);
      commit((ws) => ws.scenarios.push(s), { scenarioId: s.id, view: "flow", selection: null });
    },
    renameScenario: (id, name) =>
      commit((ws) => {
        const s = ws.scenarios.find((x) => x.id === id);
        if (s) s.name = name;
      }),
    deleteScenario: (id) => {
      const remaining = get().workspace.scenarios.filter((s) => s.id !== id);
      commit(
        (ws) => {
          ws.scenarios = ws.scenarios.filter((s) => s.id !== id);
        },
        {
          scenarioId: get().scenarioId === id ? remaining[0]?.id ?? null : get().scenarioId,
          selection: null,
        },
      );
    },
    duplicateScenario: (id) => {
      const src = get().workspace.scenarios.find((s) => s.id === id);
      if (!src) return;
      const copy = clone(src);
      copy.id = uid("scenario");
      copy.name = `${src.name} 副本`;
      commit((ws) => ws.scenarios.push(copy), { scenarioId: copy.id });
    },
    moveScenario: (id, groupId) =>
      commit((ws) => {
        const s = ws.scenarios.find((x) => x.id === id);
        if (s) s.groupId = groupId;
      }),
    updateScenario: (id, patch) =>
      commit((ws) => {
        const s = ws.scenarios.find((x) => x.id === id);
        if (s) Object.assign(s, patch);
      }),

    addActor: (name) => {
      const actor = newActor(name);
      commit((ws) => ws.actors.push(actor), { selectedActorId: actor.id });
      return actor.id;
    },
    updateActor: (id, patch) =>
      commit((ws) => {
        const a = ws.actors.find((x) => x.id === id);
        if (a) Object.assign(a, patch);
      }),
    deleteActor: (id) => {
      const remaining = get().workspace.actors.filter((a) => a.id !== id);
      commit(
        (ws) => {
          ws.actors = ws.actors.filter((a) => a.id !== id);
          for (const cs of ws.caseSets) if (cs.actorId === id) cs.actorId = undefined;
        },
        { selectedActorId: remaining[0]?.id ?? null },
      );
    },
    duplicateActor: (id) => {
      const src = get().workspace.actors.find((a) => a.id === id);
      if (!src) return;
      const copy = clone(src);
      copy.id = uid("actor");
      copy.name = `${src.name} 副本`;
      commit((ws) => ws.actors.push(copy), { selectedActorId: copy.id });
    },

    addApi: (name) => {
      const api = newApi(name);
      commit((ws) => ws.apis.push(api), { selectedApiId: api.id });
      return api.id;
    },
    updateApi: (id, patch) =>
      commit((ws) => {
        const a = ws.apis.find((x) => x.id === id);
        if (a) Object.assign(a, patch);
      }),
    deleteApi: (id) => {
      const remaining = get().workspace.apis.filter((a) => a.id !== id);
      commit(
        (ws) => {
          ws.apis = ws.apis.filter((a) => a.id !== id);
          ws.caseSets = ws.caseSets.filter((c) => c.apiId !== id);
        },
        {
          selectedApiId: remaining[0]?.id ?? null,
          caseSetId: get().workspace.caseSets.find((c) => c.apiId === remaining[0]?.id)?.id ?? null,
        },
      );
    },
    duplicateApi: (id) => {
      const src = get().workspace.apis.find((a) => a.id === id);
      if (!src) return;
      const copy = clone(src);
      copy.id = uid("api");
      copy.name = `${src.name} 副本`;
      commit((ws) => ws.apis.push(copy), { selectedApiId: copy.id });
    },

    addNode: (type, x, y, data) => {
      const node = newNode(type, x, y, data);
      commit((ws) => currentScenario(ws)?.nodes.push(node), {
        selection: { kind: "node", id: node.id },
      });
      return node.id;
    },
    updateNodeData: (id, patch) =>
      commit((ws) => {
        const node = currentScenario(ws)?.nodes.find((n) => n.id === id);
        if (node) node.data = { ...node.data, ...patch };
      }),
    renameNode: (id, newId) => {
      const s = currentScenario(get().workspace);
      if (!newId || !s || s.nodes.some((n) => n.id === newId && n.id !== id)) return false;
      commit(
        (ws) => {
          const sc = currentScenario(ws);
          if (!sc) return;
          for (const e of sc.edges) {
            if (e.source === id) e.source = newId;
            if (e.target === id) e.target = newId;
          }
          const node = sc.nodes.find((n) => n.id === id);
          if (node) node.id = newId;
        },
        { selection: { kind: "node", id: newId } },
      );
      return true;
    },
    moveNode: (id, x, y) =>
      commit((ws) => {
        const node = currentScenario(ws)?.nodes.find((n) => n.id === id);
        if (node) {
          node.x = x;
          node.y = y;
        }
      }),
    deleteNode: (id) =>
      commit((ws) => {
        const s = currentScenario(ws);
        if (!s) return;
        s.nodes = s.nodes.filter((n) => n.id !== id);
        s.edges = s.edges.filter((e) => e.source !== id && e.target !== id);
      }, { selection: null }),
    addEdge: (source, target) =>
      commit((ws) => {
        const s = currentScenario(ws);
        if (!s || source === target) return;
        if (s.edges.some((e) => e.source === source && e.target === target)) return;
        s.edges.push({ source, target });
      }),
    deleteEdge: (source, target) =>
      commit((ws) => {
        const s = currentScenario(ws);
        if (s) s.edges = s.edges.filter((e) => !(e.source === source && e.target === target));
      }, { selection: null }),

    setCaseSet: (id) =>
      set({
        caseSetId: id,
        selectedCaseId: get().workspace.caseSets.find((c) => c.id === id)?.cases[0]?.id ?? null,
        caseResults: [],
        selectedCaseResultId: null,
        caseRunState: "idle",
      }),
    addCaseSet: (apiId, name) => {
      const cs: CaseSet = { id: uid("caseset"), name, apiId, cases: [] };
      commit((ws) => ws.caseSets.push(cs), { caseSetId: cs.id, selectedCaseId: null });
    },
    renameCaseSet: (id, name) =>
      commit((ws) => {
        const c = ws.caseSets.find((x) => x.id === id);
        if (c) c.name = name;
      }),
    deleteCaseSet: (id) => {
      const apiId = get().workspace.caseSets.find((c) => c.id === id)?.apiId;
      const remaining = get().workspace.caseSets.filter((c) => c.id !== id && c.apiId === apiId);
      commit(
        (ws) => {
          ws.caseSets = ws.caseSets.filter((c) => c.id !== id);
        },
        { caseSetId: remaining[0]?.id ?? null, selectedCaseId: remaining[0]?.cases[0]?.id ?? null },
      );
    },
    updateCaseSet: (id, patch) =>
      commit((ws) => {
        const c = ws.caseSets.find((x) => x.id === id);
        if (c) Object.assign(c, patch);
      }),
    selectCase: (id) => set({ selectedCaseId: id }),
    addCase: () => {
      const csId = get().caseSetId;
      const tc: TestCase = {
        id: uid("case"),
        name: `用例 ${(get().workspace.caseSets.find((c) => c.id === csId)?.cases.length || 0) + 1}`,
        enabled: true,
        overrides: {},
        assertions: [{ source: "status", operator: "equals", expected: 200 }],
      };
      commit((ws) => ws.caseSets.find((c) => c.id === csId)?.cases.push(tc), {
        selectedCaseId: tc.id,
      });
    },
    updateCase: (caseId, patch) =>
      commit((ws) => {
        const csId = get().caseSetId;
        const tc = ws.caseSets.find((c) => c.id === csId)?.cases.find((x) => x.id === caseId);
        if (tc) Object.assign(tc, patch);
      }),
    duplicateCase: (caseId) => {
      const csId = get().caseSetId;
      const src = get().workspace.caseSets.find((c) => c.id === csId)?.cases.find((x) => x.id === caseId);
      if (!src) return;
      const copy = clone(src);
      copy.id = uid("case");
      copy.name = `${src.name} 副本`;
      commit((ws) => ws.caseSets.find((c) => c.id === csId)?.cases.push(copy), {
        selectedCaseId: copy.id,
      });
    },
    deleteCase: (caseId) => {
      const csId = get().caseSetId;
      const cs = get().workspace.caseSets.find((c) => c.id === csId);
      const remaining = (cs?.cases || []).filter((x) => x.id !== caseId);
      commit((ws) => {
        const target = ws.caseSets.find((c) => c.id === csId);
        if (target) target.cases = target.cases.filter((x) => x.id !== caseId);
      }, { selectedCaseId: remaining[0]?.id ?? null });
    },

    setRun: (patch) => set(patch),
    setCaseRun: (patch) => set(patch),
  };
});

export const selectCurrentScenario = (s: StoreState): Scenario | undefined =>
  s.workspace.scenarios.find((x) => x.id === s.scenarioId);
export const selectCurrentCaseSet = (s: StoreState): CaseSet | undefined =>
  s.workspace.caseSets.find((x) => x.id === s.caseSetId);
export const selectCurrentApi = (s: StoreState): Api | undefined =>
  s.workspace.apis.find((x) => x.id === s.selectedApiId);
export const selectCurrentActor = (s: StoreState): Actor | undefined =>
  s.workspace.actors.find((x) => x.id === s.selectedActorId);
export const findNode = (scenario: Scenario | undefined, id: string): FlowNode | undefined =>
  scenario?.nodes.find((n) => n.id === id);
