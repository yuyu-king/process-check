const STORAGE_KEY = "process-check.workspace.v1";
const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const seed = {
  version: 2,
  name: "项目审批链路验证",
  activeEnvironment: "local",
  environments: {
    local: { baseUrl: "http://127.0.0.1:4321" }
  },
  variables: {},
  templates: { actors: [], actions: [] },
  scenarios: [
    {
      id: "scenario-full-approval",
      name: "主管创建、两位经理审批",
      nodes: [
        { id: "use-a", type: "actor", x: 80, y: 150, data: { actor: { name: "稽查主管 A", variables: { username: "supervisor_a", password: "change-me" }, login: { method: "POST", url: "{{env.baseUrl}}/login", headers: {}, body: { username: "{{actor.username}}", password: "{{actor.password}}" } } } } },
        { id: "create-project", type: "action", x: 330, y: 150, data: { action: { name: "创建项目", request: { method: "POST", url: "{{env.baseUrl}}/projects", headers: {}, body: { name: "自动化验证项目", approvers: ["manager_b", "manager_c"] } } } } },
        { id: "assert-create", type: "assert", x: 580, y: 150, data: { label: "创建成功", actual: "{{steps.create-project.status}}", operator: "equals", expected: 201 } },
        { id: "use-b", type: "actor", x: 830, y: 150, data: { actor: { name: "稽查经理 B", variables: { username: "manager_b", password: "change-me" }, login: { method: "POST", url: "{{env.baseUrl}}/login", headers: {}, body: { username: "{{actor.username}}", password: "{{actor.password}}" } } } } },
        { id: "approve-b", type: "action", x: 1080, y: 150, data: { action: { name: "审批项目", request: { method: "POST", url: "{{env.baseUrl}}/projects/{{steps.create-project.body.id}}/approve", headers: {}, body: { approved: true } } } } },
        { id: "use-c", type: "actor", x: 1330, y: 150, data: { actor: { name: "稽查经理 C", variables: { username: "manager_c", password: "change-me" }, login: { method: "POST", url: "{{env.baseUrl}}/login", headers: {}, body: { username: "{{actor.username}}", password: "{{actor.password}}" } } } } },
        { id: "approve-c", type: "action", x: 1580, y: 150, data: { action: { name: "审批项目", request: { method: "POST", url: "{{env.baseUrl}}/projects/{{steps.create-project.body.id}}/approve", headers: {}, body: { approved: true } } } } },
        { id: "assert-mail", type: "assert", x: 1830, y: 150, data: { label: "最后审批触发邮件", actual: "{{steps.approve-c.body.emailSent}}", operator: "equals", expected: true } }
      ],
      edges: [
        { source: "use-a", target: "create-project" },
        { source: "create-project", target: "assert-create" },
        { source: "assert-create", target: "use-b" },
        { source: "use-b", target: "approve-b" },
        { source: "approve-b", target: "use-c" },
        { source: "use-c", target: "approve-c" },
        { source: "approve-c", target: "assert-mail" }
      ]
    }
  ]
};

let workspace = loadWorkspace();
let scenarioId = workspace.scenarios[0]?.id;
let selection = null;
let pendingEdgeSource = null;
let runState = "idle";
let events = [];
let selectedEvent = null;
let drag = null;
let runRevision = 0;
let activeRunController = null;

function loadWorkspace() {
  try { return normalizeWorkspace(JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(seed)); }
  catch { return clone(seed); }
}
function normalizeWorkspace(value) {
  const result = value && typeof value === "object" ? value : clone(seed);
  result.templates ||= { actors: [], actions: [] };
  result.templates.actors ||= [];
  result.templates.actions ||= [];
  if ((result.version || 1) < 2 || result.actors || result.actions) {
    const actors = new Map((result.actors || []).map((item) => [item.id, item]));
    const actions = new Map((result.actions || []).map((item) => [item.id, item]));
    for (const scenario of result.scenarios || []) {
      for (const node of scenario.nodes || []) {
        if (node.type === "actor" && !node.data?.actor && actors.has(node.data?.actorId)) node.data = { actor: clone(actors.get(node.data.actorId)) };
        if (node.type === "action" && !node.data?.action && actions.has(node.data?.actionId)) node.data = { ...node.data, action: clone(actions.get(node.data.actionId)) };
      }
    }
    delete result.actors;
    delete result.actions;
  }
  result.version = 2;
  return result;
}
function save() {
  invalidateRunResults();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}
function invalidateRunResults() {
  runRevision += 1;
  activeRunController?.abort();
  activeRunController = null;
  runState = "idle";
  events = [];
  selectedEvent = null;
}
function currentScenario() {
  return workspace.scenarios.find((item) => item.id === scenarioId);
}
function template(type, id) {
  return workspace.templates?.[`${type}s`]?.find((item) => item.id === id);
}
function nodeLabel(node) {
  if (node.type === "actor") return node.data.actor?.name || "未配置 Actor";
  if (node.type === "action") return node.data.action?.name || "未配置 Action";
  if (node.type === "scenario") return workspace.scenarios.find((item) => item.id === node.data.scenarioId)?.name || "未选择子场景";
  return node.data.label || "断言";
}
function nodeSubtitle(node) {
  if (node.type === "actor") return "登录并切换会话";
  if (node.type === "action") {
    const action = node.data.action;
    return `${action?.request?.method || "GET"} ${action?.request?.url || ""}`;
  }
  if (node.type === "scenario") return "执行并共享变量";
  return `${node.data.operator || "equals"} ${JSON.stringify(node.data.expected)}`;
}
function ensureActorAuth(actor) {
  actor.auth ||= {
    enabled: false,
    tokenPath: "body.token",
    headerName: "Authorization",
    prefix: "Bearer "
  };
  return actor.auth;
}
function glyph(type) {
  return { actor: "A", action: "→", assert: "✓", scenario: "S" }[type];
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function render() {
  const scenario = currentScenario();
  document.querySelector("#app").innerHTML = `
    <main class="app">
      <header class="topbar">
        <div class="brand">Process Check <small>PROTOTYPE</small></div>
        <select id="scenarioSelect" class="scenario-select">
          ${workspace.scenarios.map((item) => `<option value="${item.id}" ${item.id === scenarioId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <input id="scenarioName" class="scenario-name" value="${escapeHtml(scenario?.name || "")}" placeholder="输入场景名称">
        <button id="addScenario">＋ 场景</button>
        <span class="status ${runState}">${statusText()}</span>
        <div class="spacer"></div>
        <button id="importButton">导入 JSON</button>
        <button id="exportButton">导出 JSON</button>
        <button id="runButton" class="primary">▶ 运行场景</button>
        <input id="fileInput" class="hidden" type="file" accept=".json,application/json">
      </header>
      <section class="workspace">
        ${renderSidebar()}
        <div id="canvas" class="canvas">
          <div class="canvas-inner">
            ${scenario?.nodes?.length ? "" : `<div class="empty-canvas"><strong>把节点拖到这里</strong>Actor → Action → Assert，也可以嵌套其他场景</div>`}
            ${renderEdges(scenario)}
            ${(scenario?.nodes || []).map(renderNode).join("")}
          </div>
        </div>
        <aside class="inspector">${renderInspector()}</aside>
      </section>
      ${renderLogs()}
    </main>`;
  bindEvents();
}

function renderSidebar() {
  return `<aside class="sidebar">
    <div class="section">
      <div class="section-head"><h3>添加节点</h3></div>
      ${libraryItem("actor", { id: "new-actor", name: "Actor", detail: "登录与独立会话" })}
      ${libraryItem("action", { id: "new-action", name: "Action", detail: "配置 HTTP 请求" })}
      ${libraryItem("assert", { id: "new-assert", name: "Assert", detail: "验证响应值" })}
      ${libraryItem("scenario", { id: "new-scenario", name: "子场景", detail: "复用其他场景" })}
    </div>
    <div class="section">
      <div class="section-head"><h3>我的模板</h3></div>
      ${["actor", "action"].flatMap((type) => (workspace.templates?.[`${type}s`] || []).map((item) => templateItem(type, item))).join("") || `<p class="hint">配置好节点后，可在右侧属性面板保存为模板。</p>`}
    </div>
    <p class="hint">先拖入节点类型，再在右侧配置。点击右侧端口，再点击另一个节点的左侧端口完成连线。</p>
  </aside>`;
}
function libraryItem(type, item) {
  const detail = item.detail || (type === "actor" ? "独立 Cookie 会话" : type === "action" ? item.request?.method : "共享上下文");
  return `<div class="library-item" draggable="true" data-library-type="${type}" data-library-id="${item.id}">
    <div class="glyph ${type}">${glyph(type)}</div>
    <div class="meta"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(detail || "")}</small></div>
  </div>`;
}
function templateItem(type, item) {
  return `<div class="template-row">
    <div class="library-item" draggable="true" data-library-type="${type}" data-template-id="${item.id}">
      <div class="glyph ${type}">${glyph(type)}</div>
      <div class="meta"><strong>${escapeHtml(item.name)}</strong><small>${type} 模板</small></div>
    </div>
    <button class="template-delete" data-delete-template="${type}:${item.id}" title="删除模板">×</button>
  </div>`;
}
function renderNode(node) {
  const selected = selection?.kind === "node" && selection.id === node.id;
  return `<article class="node ${selected ? "selected" : ""}" data-node-id="${node.id}" style="left:${node.x}px;top:${node.y}px">
    <button class="port in" data-port-in="${node.id}" aria-label="输入端口"></button>
    <button class="node-delete" data-node-delete="${node.id}" title="删除节点">×</button>
    <div class="node-head">
      <div class="glyph ${node.type}">${glyph(node.type)}</div>
      <div style="min-width:0"><div class="node-title">${escapeHtml(nodeLabel(node))}</div><div class="node-subtitle">${escapeHtml(node.type)}</div></div>
    </div>
    <div class="node-body">${escapeHtml(nodeSubtitle(node))}</div>
    <button class="port out ${pendingEdgeSource === node.id ? "pending" : ""}" data-port-out="${node.id}" aria-label="输出端口"></button>
  </article>`;
}
function renderEdges(scenario) {
  const nodes = new Map((scenario?.nodes || []).map((node) => [node.id, node]));
  return `<svg class="edges">${(scenario?.edges || []).map((edge) => {
    const source = nodes.get(edge.source), target = nodes.get(edge.target);
    if (!source || !target) return "";
    const x1 = source.x + 188, y1 = source.y + 38, x2 = target.x, y2 = target.y + 38;
    const bend = Math.max(60, Math.abs(x2 - x1) * .45);
    const selected = selection?.kind === "edge" && selection.source === edge.source && selection.target === edge.target;
    return `<path class="edge ${selected ? "selected" : ""}" data-edge-source="${edge.source}" data-edge-target="${edge.target}" d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}"/>`;
  }).join("")}</svg>`;
}

function renderInspector() {
  if (!selection) return `<h3>属性</h3><p class="muted">选择画布节点进行编辑，或从左侧拖入一个新节点。</p>
    <div class="field"><label>环境变量</label><textarea data-json="environments">${escapeHtml(JSON.stringify(workspace.environments, null, 2))}</textarea></div>
    <div class="field"><label>共享初始变量</label><textarea data-json="variables">${escapeHtml(JSON.stringify(workspace.variables, null, 2))}</textarea></div>`;
  if (selection.kind === "edge") {
    const source = currentScenario().nodes.find((item) => item.id === selection.source);
    const target = currentScenario().nodes.find((item) => item.id === selection.target);
    return `<h3>连线</h3>
      <div class="edge-summary"><strong>${escapeHtml(nodeLabel(source))}</strong><span>→</span><strong>${escapeHtml(nodeLabel(target))}</strong></div>
      <p class="hint">选中连线后，也可以按 Delete 或 Backspace 删除。</p>
      <div class="inspector-actions"><button class="danger" id="deleteEdge">删除连线</button></div>`;
  }
  const node = currentScenario().nodes.find((item) => item.id === selection.id);
  if (!node) return "";
  const common = `<div class="field"><label>节点 ID（变量路径使用此值）</label><input data-node-field="id" value="${escapeHtml(node.id)}"></div>`;
  let fields = "";
  if (node.type === "actor") {
    const actor = node.data.actor;
    const auth = ensureActorAuth(actor);
    fields = `<div class="field"><label>名称</label><input data-config-field="name" value="${escapeHtml(actor.name)}"></div>
      <div class="row"><div class="field"><label>登录方法</label><select data-config-request-field="method">${["POST","GET","PUT","PATCH"].map((method) => `<option ${actor.login.method === method ? "selected" : ""}>${method}</option>`).join("")}</select></div>
      <div class="field"><label>登录地址</label><input data-config-request-field="url" value="${escapeHtml(actor.login.url)}"></div></div>
      <div class="field"><label>Actor 变量</label><textarea data-config-json="variables">${escapeHtml(JSON.stringify(actor.variables || {}, null, 2))}</textarea></div>
      <div class="field"><label>请求头 JSON</label><textarea data-config-request-json="headers">${escapeHtml(JSON.stringify(actor.login.headers || {}, null, 2))}</textarea></div>
      <div class="field"><label>请求体 JSON</label><textarea data-config-request-json="body">${escapeHtml(JSON.stringify(actor.login.body || {}, null, 2))}</textarea></div>
      <div class="auth-box">
        <label class="check-row"><input type="checkbox" data-auth-enabled ${auth.enabled ? "checked" : ""}> 将登录响应中的 Token 自动注入后续 Action</label>
        ${auth.enabled ? `
          <div class="field"><label>Token 路径（相对于完整登录响应）</label><input data-auth-field="tokenPath" value="${escapeHtml(auth.tokenPath)}" placeholder="body.data.accessToken"></div>
          <div class="field"><label>Header 名称</label><input data-auth-field="headerName" value="${escapeHtml(auth.headerName)}" placeholder="Authorization"></div>
          <div class="field"><label>值前缀</label><input data-auth-field="prefix" value="${escapeHtml(auth.prefix)}" placeholder="Bearer "></div>
          <p class="hint">例如登录响应为 {"data":{"accessToken":"..."}}，Token 路径填写 body.data.accessToken。</p>
        ` : ""}
      </div>`;
  }
  if (node.type === "action") {
    const action = node.data.action;
    const actors = currentScenario().nodes.filter((item) => item.type === "actor");
    const supportsBody = !["GET", "HEAD"].includes(String(action.request.method).toUpperCase());
    fields = `<div class="field"><label>名称</label><input data-config-field="name" value="${escapeHtml(action.name)}"></div>
      <div class="row"><div class="field"><label>方法</label><select data-config-request-field="method">${["GET","POST","PUT","PATCH","DELETE"].map((method) => `<option ${action.request.method === method ? "selected" : ""}>${method}</option>`).join("")}</select></div>
      <div class="field"><label>地址</label><input data-config-request-field="url" value="${escapeHtml(action.request.url)}"></div></div>
      <div class="field"><label>指定 Actor（留空则使用链路中最近 Actor）</label><select data-node-data="actorNodeId"><option value="">自动</option>${actors.map((item) => `<option value="${item.id}" ${node.data.actorNodeId === item.id ? "selected" : ""}>${escapeHtml(nodeLabel(item))}</option>`).join("")}</select></div>
      <div class="field"><label>请求头 JSON</label><textarea data-config-request-json="headers">${escapeHtml(JSON.stringify(action.request.headers || {}, null, 2))}</textarea></div>
      ${supportsBody
        ? `<div class="field"><label>请求体 JSON</label><textarea data-config-request-json="body">${escapeHtml(JSON.stringify(action.request.body ?? {}, null, 2))}</textarea></div>`
        : `<p class="hint">GET/HEAD 请求不会发送请求体；查询参数请写在 URL 中。</p>`}
      <div class="field"><label>保存响应 body 到 shared（可选）</label><input data-node-data="saveAs" value="${escapeHtml(node.data.saveAs || "")}" placeholder="project"></div>
      <p class="hint">变量示例：{{env.baseUrl}}、{{steps.create-project.body.id}}、{{shared.project.id}}、{{random.string}}</p>`;
  }
  if (node.type === "scenario") fields = selectField("子场景", "scenarioId", workspace.scenarios.filter((item) => item.id !== scenarioId), node.data.scenarioId);
  if (node.type === "assert") fields = `
    <div class="field"><label>名称</label><input data-node-data="label" value="${escapeHtml(node.data.label || "")}"></div>
    <div class="field"><label>实际值（支持 {{steps.nodeId.body.id}}）</label><input data-node-data="actual" value="${escapeHtml(node.data.actual || "")}"></div>
    <div class="field"><label>操作符</label><select data-node-data="operator">${["equals","notEquals","exists","truthy","contains","greaterThan","matches"].map((item) => `<option ${node.data.operator === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
    <div class="field"><label>期望值（JSON）</label><input data-node-expected value="${escapeHtml(JSON.stringify(node.data.expected))}"></div>`;
  return `<h3>${escapeHtml(node.type)} 节点</h3>${common}${fields}
    <div class="inspector-actions">
      ${["actor", "action"].includes(node.type) ? `<button id="saveTemplate">保存为模板</button>` : ""}
      <button class="danger" id="deleteNode">删除节点</button>
    </div>`;
}
function selectField(label, key, items, selected) {
  return `<div class="field"><label>${label}</label><select data-node-data="${key}">${items.map((item) => `<option value="${item.id}" ${selected === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>`;
}
function renderLogs() {
  return `<section class="logs">
    <div class="log-list">${events.length ? events.map((event, index) => {
      const result = event.type.includes("success") ? "success" : event.type.includes("failure") || event.type === "node:error" ? "failure" : "";
      return `<div class="log-row ${selectedEvent === index ? "selected" : ""}" data-event="${index}">
        <span class="log-dot ${result}"></span><span>${escapeHtml(event.label || event.type)}</span><small class="muted">${escapeHtml(event.type)}</small>
      </div>`;
    }).join("") : `<span class="muted">运行场景后，这里会显示每个 Actor、Action 和 Assert 的完整状态。</span>`}</div>
    <div class="log-detail"><pre>${selectedEvent === null ? "选择一条日志查看请求、响应和断言详情。" : escapeHtml(JSON.stringify(events[selectedEvent], null, 2))}</pre></div>
  </section>`;
}
function statusText() {
  return { idle: "未运行", running: "运行中…", success: "验证通过", failure: "验证失败" }[runState];
}

function bindEvents() {
  document.querySelector("#scenarioSelect").onchange = (event) => { scenarioId = event.target.value; selection = null; pendingEdgeSource = null; render(); };
  document.querySelector("#scenarioName").onchange = (event) => {
    currentScenario().name = event.target.value.trim() || "未命名场景";
    save(); render();
  };
  document.querySelector("#addScenario").onclick = addScenario;
  document.querySelector("#runButton").onclick = runScenario;
  document.querySelector("#exportButton").onclick = exportJson;
  document.querySelector("#importButton").onclick = () => document.querySelector("#fileInput").click();
  document.querySelector("#fileInput").onchange = importJson;
  document.querySelectorAll(".library-item").forEach((item) => {
    item.ondragstart = (event) => event.dataTransfer.setData("application/json", JSON.stringify({
      type: item.dataset.libraryType,
      templateId: item.dataset.templateId || null
    }));
  });
  document.querySelectorAll("[data-delete-template]").forEach((button) => button.onclick = (event) => {
    event.stopPropagation();
    const [type, id] = button.dataset.deleteTemplate.split(":");
    workspace.templates[`${type}s`] = workspace.templates[`${type}s`].filter((item) => item.id !== id);
    save(); render();
  });
  const canvas = document.querySelector("#canvas");
  canvas.ondragover = (event) => event.preventDefault();
  canvas.ondrop = dropNode;
  document.querySelectorAll(".node").forEach((element) => {
    element.onpointerdown = startNodeDrag;
  });
  document.querySelectorAll("[data-node-delete]").forEach((button) => button.onclick = (event) => {
    event.stopPropagation(); deleteNode(button.dataset.nodeDelete);
  });
  document.querySelectorAll("[data-edge-source]").forEach((edge) => edge.onclick = (event) => {
    event.stopPropagation();
    selection = { kind: "edge", source: edge.dataset.edgeSource, target: edge.dataset.edgeTarget };
    render();
  });
  document.querySelectorAll("[data-port-out]").forEach((port) => port.onclick = (event) => {
    event.stopPropagation(); pendingEdgeSource = port.dataset.portOut; render();
  });
  document.querySelectorAll("[data-port-in]").forEach((port) => port.onclick = (event) => {
    event.stopPropagation();
    if (pendingEdgeSource && pendingEdgeSource !== port.dataset.portIn) {
      const scenario = currentScenario();
      scenario.edges = scenario.edges.filter((edge) => edge.target !== port.dataset.portIn);
      scenario.edges.push({ source: pendingEdgeSource, target: port.dataset.portIn });
      pendingEdgeSource = null; save(); render();
    }
  });
  bindInspectorEvents();
  document.querySelectorAll("[data-event]").forEach((row) => row.onclick = () => { selectedEvent = Number(row.dataset.event); render(); });
  document.onkeydown = (event) => {
    if (!["Delete", "Backspace"].includes(event.key)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable) return;
    if (selection?.kind === "edge") {
      event.preventDefault();
      deleteEdge(selection.source, selection.target);
    } else if (selection?.kind === "node") {
      event.preventDefault();
      deleteNode(selection.id);
    }
  };
}

function bindInspectorEvents() {
  document.querySelectorAll("[data-json]").forEach((field) => field.onchange = () => updateJson(field, workspace, field.dataset.json));
  if (selection?.kind === "edge") {
    document.querySelector("#deleteEdge")?.addEventListener("click", () => deleteEdge(selection.source, selection.target));
    return;
  }
  if (selection?.kind === "node") {
    const node = currentScenario().nodes.find((item) => item.id === selection.id);
    document.querySelectorAll("[data-node-data]").forEach((field) => field.onchange = () => { node.data[field.dataset.nodeData] = field.value; save(); render(); });
    document.querySelector("[data-node-field='id']")?.addEventListener("change", (event) => renameNode(node, event.target.value));
    document.querySelector("[data-node-expected]")?.addEventListener("change", (event) => {
      try { node.data.expected = JSON.parse(event.target.value); save(); render(); } catch { alert("期望值必须是有效 JSON，例如 true、201 或 \"approved\""); }
    });
    const config = node.type === "actor" ? node.data.actor : node.type === "action" ? node.data.action : null;
    const request = node.type === "actor" ? config?.login : config?.request;
    document.querySelectorAll("[data-config-field]").forEach((field) => field.onchange = () => { config[field.dataset.configField] = field.value; save(); render(); });
    document.querySelectorAll("[data-config-json]").forEach((field) => field.onchange = () => updateJson(field, config, field.dataset.configJson));
    document.querySelectorAll("[data-config-request-field]").forEach((field) => field.onchange = () => { request[field.dataset.configRequestField] = field.value; save(); render(); });
    document.querySelectorAll("[data-config-request-json]").forEach((field) => field.onchange = () => updateJson(field, request, field.dataset.configRequestJson));
    if (node.type === "actor") {
      const auth = ensureActorAuth(config);
      document.querySelector("[data-auth-enabled]")?.addEventListener("change", (event) => {
        auth.enabled = event.target.checked; save(); render();
      });
      document.querySelectorAll("[data-auth-field]").forEach((field) => field.onchange = () => {
        auth[field.dataset.authField] = field.value; save(); render();
      });
    }
    document.querySelector("#saveTemplate")?.addEventListener("click", () => saveNodeTemplate(node));
    document.querySelector("#deleteNode")?.addEventListener("click", () => deleteNode(node.id));
  }
}
function updateJson(field, owner, key) {
  try { owner[key] = JSON.parse(field.value); save(); render(); }
  catch { alert("请输入有效 JSON"); }
}
function renameNode(node, newId) {
  if (!newId || currentScenario().nodes.some((item) => item.id === newId && item !== node)) return alert("节点 ID 不能为空或重复");
  for (const edge of currentScenario().edges) {
    if (edge.source === node.id) edge.source = newId;
    if (edge.target === node.id) edge.target = newId;
  }
  node.id = newId; selection.id = newId; save(); render();
}
function dropNode(event) {
  event.preventDefault();
  let payload;
  try { payload = JSON.parse(event.dataTransfer.getData("application/json")); } catch { return; }
  const rect = document.querySelector(".canvas-inner").getBoundingClientRect();
  const id = uid(payload.type);
  const savedTemplate = payload.templateId ? template(payload.type, payload.templateId) : null;
  const data = payload.type === "actor" ? { actor: savedTemplate ? clone(savedTemplate.config) : { name: "新 Actor", variables: { username: "", password: "" }, login: { method: "POST", url: "{{env.baseUrl}}/login", headers: {}, body: {} }, auth: { enabled: false, tokenPath: "body.token", headerName: "Authorization", prefix: "Bearer " } } }
    : payload.type === "action" ? { action: savedTemplate ? clone(savedTemplate.config) : { name: "新 Action", request: { method: "GET", url: "{{env.baseUrl}}/", headers: {}, body: {} } } }
    : payload.type === "scenario" ? { scenarioId: workspace.scenarios.find((item) => item.id !== scenarioId)?.id || "" }
    : { label: "响应状态正确", actual: "{{steps.action-id.status}}", operator: "equals", expected: 200 };
  currentScenario().nodes.push({ id, type: payload.type, x: Math.max(20, event.clientX - rect.left - 90), y: Math.max(20, event.clientY - rect.top - 35), data });
  selection = { kind: "node", id }; save(); render();
}
function startNodeDrag(event) {
  if (event.target.classList.contains("port") || event.target.classList.contains("node-delete")) return;
  const element = event.currentTarget;
  const node = currentScenario().nodes.find((item) => item.id === element.dataset.nodeId);
  drag = { node, element, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, moved: false };
  element.setPointerCapture(event.pointerId);
  element.onpointermove = moveNode;
  element.onpointerup = endNodeDrag;
}
function moveNode(event) {
  if (!drag) return;
  if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
  drag.node.x = Math.max(0, drag.x + event.clientX - drag.startX);
  drag.node.y = Math.max(0, drag.y + event.clientY - drag.startY);
  drag.element.style.left = `${drag.node.x}px`;
  drag.element.style.top = `${drag.node.y}px`;
}
function endNodeDrag() {
  if (!drag) return;
  const { node, moved } = drag;
  drag = null;
  if (moved) save();
  else selection = { kind: "node", id: node.id };
  render();
}
function saveNodeTemplate(node) {
  const defaultName = nodeLabel(node);
  const name = window.prompt("模板名称", defaultName)?.trim();
  if (!name) return;
  const config = clone(node.type === "actor" ? node.data.actor : node.data.action);
  workspace.templates[`${node.type}s`].push({ id: uid(`${node.type}-template`), name, config });
  save(); render();
}
function addScenario() {
  const name = window.prompt("场景名称", `新场景 ${workspace.scenarios.length + 1}`)?.trim();
  if (!name) return;
  const id = uid("scenario");
  workspace.scenarios.push({ id, name, nodes: [], edges: [] });
  scenarioId = id; selection = null; save(); render();
}
function deleteNode(id) {
  const scenario = currentScenario();
  scenario.nodes = scenario.nodes.filter((node) => node.id !== id);
  scenario.edges = scenario.edges.filter((edge) => edge.source !== id && edge.target !== id);
  selection = null; save(); render();
}
function deleteEdge(source, target) {
  const scenario = currentScenario();
  scenario.edges = scenario.edges.filter((edge) => edge.source !== source || edge.target !== target);
  selection = null; save(); render();
}
async function runScenario() {
  activeRunController?.abort();
  const controller = new AbortController();
  activeRunController = controller;
  const revision = ++runRevision;
  const workspaceSnapshot = clone(workspace);
  runState = "running"; events = []; selectedEvent = null; render();
  try {
    const response = await fetch("/api/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: workspaceSnapshot, scenarioId }),
      signal: controller.signal
    });
    const result = await response.json();
    if (revision !== runRevision) return;
    events = result.events || [{ type: "node:error", label: result.error || "执行失败", details: result }];
    runState = result.ok ? "success" : "failure";
    selectedEvent = events.length ? events.length - 1 : null;
  } catch (error) {
    if (revision !== runRevision || error.name === "AbortError") return;
    events = [{ type: "node:error", label: "无法连接本地执行器", error: error.message }];
    runState = "failure"; selectedEvent = 0;
  }
  if (revision === runRevision) activeRunController = null;
  render();
}
function exportJson() {
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${workspace.name || "process-check"}.json`;
  link.click(); URL.revokeObjectURL(link.href);
}
async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.actors) || !Array.isArray(imported.actions) || !Array.isArray(imported.scenarios)) throw new Error("缺少 actors、actions 或 scenarios 数组");
    workspace = normalizeWorkspace(imported); scenarioId = workspace.scenarios[0]?.id; selection = null; save(); render();
  } catch (error) { alert(`导入失败：${error.message}`); }
}

render();
