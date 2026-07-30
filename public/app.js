const STORAGE_KEY = "process-check.workspace.v1";
const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const seed = {
  version: 3,
  name: "项目审批链路验证",
  activeEnvironment: "local",
  environments: {
    local: { baseUrl: "http://127.0.0.1:4321" }
  },
  variables: {},
  templates: { actors: [], actions: [] },
  caseSets: [],
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
let viewMode = "flow";
let caseSetId = workspace.caseSets[0]?.id;
let selectedCaseId = null;
let caseRunState = "idle";
let caseResults = [];
let selectedCaseResultId = null;
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
  result.caseSets ||= [];
  for (const caseSet of result.caseSets) {
    caseSet.actorTemplateId ||= "";
    caseSet.actionTemplateId ||= "";
    caseSet.cases ||= [];
    for (const testCase of caseSet.cases) {
      testCase.overrides ||= {};
      testCase.assertions ||= [];
    }
  }
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
  result.version = 3;
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
  caseRunState = "idle";
  caseResults = [];
  selectedCaseResultId = null;
}
function currentScenario() {
  return workspace.scenarios.find((item) => item.id === scenarioId);
}
function currentCaseSet() {
  return workspace.caseSets.find((item) => item.id === caseSetId);
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
  actor.auth.request ||= {
    method: "GET",
    url: "",
    headers: {}
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
  if (viewMode === "cases") {
    renderCaseSets();
    return;
  }
  const scenario = currentScenario();
  document.querySelector("#app").innerHTML = `
    <main class="app">
      <header class="topbar">
        <div class="brand">Process Check <small>PROTOTYPE</small></div>
        <nav class="mode-tabs">
          <button class="mode-tab active" data-mode="flow">流程验证</button>
          <button class="mode-tab" data-mode="cases">接口用例集</button>
        </nav>
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

function renderCaseSets() {
  const caseSet = currentCaseSet();
  document.querySelector("#app").innerHTML = `
    <main class="app">
      <header class="topbar">
        <div class="brand">Process Check <small>PROTOTYPE</small></div>
        <nav class="mode-tabs">
          <button class="mode-tab" data-mode="flow">流程验证</button>
          <button class="mode-tab active" data-mode="cases">接口用例集</button>
        </nav>
        <select id="caseSetSelect" class="scenario-select" ${caseSet ? "" : "disabled"}>
          ${workspace.caseSets.map((item) => `<option value="${item.id}" ${item.id === caseSetId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
        <input id="caseSetName" class="scenario-name" value="${escapeHtml(caseSet?.name || "")}" placeholder="输入用例集名称" ${caseSet ? "" : "disabled"}>
        <button id="addCaseSet">＋ 用例集</button>
        <span class="status ${caseRunState}">${caseStatusText()}</span>
        <div class="spacer"></div>
        <button id="importButton">导入 JSON</button>
        <button id="exportButton">导出 JSON</button>
        <button id="runCaseSetButton" class="primary" ${caseSet ? "" : "disabled"}>▶ 批量运行</button>
        <input id="fileInput" class="hidden" type="file" accept=".json,application/json">
      </header>
      ${caseSet ? renderCaseSetWorkspace(caseSet) : `
        <section class="case-empty">
          <div><strong>创建第一个接口用例集</strong><p>选择已有的 Actor 和 Action 模板，再为同一个接口添加多组参数与断言。</p><button id="emptyAddCaseSet" class="primary">＋ 新建用例集</button></div>
        </section>`}
      ${renderCaseResults()}
    </main>`;
  bindCaseSetEvents();
}

function renderCaseSetWorkspace(caseSet) {
  const selectedCase = caseSet.cases.find((item) => item.id === selectedCaseId);
  return `<section class="case-workspace">
    <aside class="sidebar">
      <div class="section">
        <div class="section-head"><h3>执行配置</h3></div>
        <div class="field"><label>Actor 模板（可选）</label>
          <select id="caseActorTemplate"><option value="">匿名，无需登录</option>${workspace.templates.actors.map((item) =>
            `<option value="${item.id}" ${caseSet.actorTemplateId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Action 模板</label>
          <select id="caseActionTemplate"><option value="">请选择 Action 模板</option>${workspace.templates.actions.map((item) =>
            `<option value="${item.id}" ${caseSet.actionTemplateId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select>
        </div>
        ${workspace.templates.actions.length ? "" : `<p class="hint">请先在“流程验证”中配置一个 Action 节点，并保存为模板。</p>`}
      </div>
      <div class="section">
        <div class="section-head"><h3>用例</h3><button id="addCase" class="icon-btn">＋</button></div>
        <div class="case-list">${caseSet.cases.map((item) => {
          const result = caseResults.find((entry) => entry.id === item.id);
          return `<button class="case-list-item ${selectedCaseId === item.id ? "selected" : ""}" data-case-id="${item.id}">
            <span class="case-enabled ${item.enabled === false ? "disabled" : ""}"></span>
            <span>${escapeHtml(item.name)}</span>
            ${result ? `<small class="${result.ok ? "success-text" : "failure-text"}">${result.ok ? "通过" : "失败"}</small>` : ""}
          </button>`;
        }).join("") || `<p class="hint">添加一条用例，为接口配置不同的输入和预期结果。</p>`}</div>
      </div>
    </aside>
    <div class="case-main">
      <div class="case-main-head">
        <div><h2>${escapeHtml(caseSet.name)}</h2><p>每一行使用相同 Action 模板，仅覆盖不同的请求参数和断言。</p></div>
        <button id="addCaseMain">＋ 添加用例</button>
      </div>
      <div class="case-table-wrap">
        <table class="case-table">
          <thead><tr><th>启用</th><th>用例名称</th><th>参数覆盖</th><th>断言</th><th>结果</th></tr></thead>
          <tbody>${caseSet.cases.map((item) => {
            const result = caseResults.find((entry) => entry.id === item.id);
            return `<tr data-case-row="${item.id}" class="${selectedCaseId === item.id ? "selected" : ""}">
              <td>${item.enabled === false ? "—" : "✓"}</td>
              <td><strong>${escapeHtml(item.name)}</strong></td>
              <td><code>${escapeHtml(summarizeJson(item.overrides))}</code></td>
              <td>${escapeHtml(summarizeAssertions(item.assertions))}</td>
              <td>${!result ? `<span class="muted">未运行</span>` : `<button class="result-pill ${result.ok ? "passed" : "failed"}" data-result-id="${item.id}">${result.ok ? "通过" : "失败"}</button>`}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="5" class="table-empty">还没有用例，点击“添加用例”开始。</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <aside class="inspector">${renderCaseInspector(selectedCase)}</aside>
  </section>`;
}

function renderCaseInspector(testCase) {
  if (!testCase) return `<h3>用例编辑</h3><p class="muted">选择表格中的一条用例进行编辑。</p>
    <p class="hint">参数覆盖会与 Action 模板的请求配置进行深度合并。可以只填写需要变化的 URL、Header 或 Body 字段。</p>`;
  return `<h3>用例编辑</h3>
    <label class="check-row case-check"><input type="checkbox" id="caseEnabled" ${testCase.enabled === false ? "" : "checked"}> 批量运行时启用</label>
    <div class="field"><label>用例名称</label><input id="caseName" value="${escapeHtml(testCase.name)}"></div>
    <div class="field"><label>参数覆盖 JSON</label><textarea id="caseOverrides" class="case-json">${escapeHtml(JSON.stringify(testCase.overrides || {}, null, 2))}</textarea></div>
    <p class="hint">示例：{"body":{"projectName":"yb-{{random.string}}"}}。GET 查询参数可以覆盖 url。</p>
    <div class="field"><label>断言 JSON</label><textarea id="caseAssertions" class="case-json">${escapeHtml(JSON.stringify(testCase.assertions || [], null, 2))}</textarea></div>
    <p class="hint">source 相对于响应，例如 status、body.success、body.data.id。</p>
    <div class="inspector-actions"><button id="duplicateCase">复制用例</button><button id="deleteCase" class="danger">删除用例</button></div>`;
}

function renderCaseResults() {
  const result = caseResults.find((item) => item.id === selectedCaseResultId);
  return `<section class="logs case-results">
    <div class="log-list">${caseResults.length ? caseResults.map((item) =>
      `<div class="log-row ${selectedCaseResultId === item.id ? "selected" : ""}" data-case-result="${item.id}">
        <span class="log-dot ${item.ok ? "success" : "failure"}"></span><span>${escapeHtml(item.name)}</span><small class="${item.ok ? "success-text" : "failure-text"}">${item.ok ? "通过" : "失败"}</small>
      </div>`).join("") : `<span class="muted">批量运行后，这里会显示每条用例的请求、响应和断言结果。</span>`}</div>
    <div class="log-detail"><pre>${result ? escapeHtml(JSON.stringify(result, null, 2)) : "选择一条运行结果查看详情。"}</pre></div>
  </section>`;
}

function summarizeJson(value) {
  const text = JSON.stringify(value || {});
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}
function summarizeAssertions(assertions) {
  if (!assertions?.length) return "HTTP 请求成功";
  return assertions.map((item) => `${item.source || "ok"} ${item.operator || "equals"} ${JSON.stringify(item.expected)}`).join("；");
}
function caseStatusText() {
  if (caseRunState === "running") return "批量运行中…";
  if (caseRunState === "success") return `${caseResults.filter((item) => item.ok).length}/${caseResults.length} 通过`;
  if (caseRunState === "failure") return `${caseResults.filter((item) => item.ok).length}/${caseResults.length} 通过`;
  return "未运行";
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
        <label class="check-row"><input type="checkbox" data-auth-enabled ${auth.enabled ? "checked" : ""}> 自动获取 Token 并注入后续 Action</label>
        ${auth.enabled ? `
          <div class="auth-request">
            <div class="row"><div class="field"><label>Token 请求方法</label><select data-auth-request-field="method">${["GET","POST","PUT","PATCH"].map((method) => `<option ${auth.request.method === method ? "selected" : ""}>${method}</option>`).join("")}</select></div>
            <div class="field"><label>Token 接口地址（可选）</label><input data-auth-request-field="url" value="${escapeHtml(auth.request.url)}" placeholder="{{env.baseUrl}}/token"></div></div>
            <div class="field"><label>Token 请求头 JSON</label><textarea data-auth-request-json="headers">${escapeHtml(JSON.stringify(auth.request.headers || {}, null, 2))}</textarea></div>
            ${["GET", "HEAD"].includes(String(auth.request.method).toUpperCase())
              ? `<p class="hint">GET/HEAD Token 请求不会发送请求体；查询参数请写在 URL 中。</p>`
              : `<div class="field"><label>Token 请求体 JSON</label><textarea data-auth-request-json="body">${escapeHtml(JSON.stringify(auth.request.body ?? {}, null, 2))}</textarea></div>`}
          </div>
          <div class="field"><label>Token 路径（相对于完整 Token 响应）</label><input data-auth-field="tokenPath" value="${escapeHtml(auth.tokenPath)}" placeholder="body.data.accessToken"></div>
          <div class="field"><label>Header 名称</label><input data-auth-field="headerName" value="${escapeHtml(auth.headerName)}" placeholder="Authorization"></div>
          <div class="field"><label>值前缀</label><input data-auth-field="prefix" value="${escapeHtml(auth.prefix)}" placeholder="Bearer "></div>
          <p class="hint">填写 Token 接口地址时，将在登录后调用它，并从其响应提取 Token；地址留空则兼容旧方式，从登录响应提取。</p>
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
  bindModeTabs();
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

function bindModeTabs() {
  document.querySelectorAll("[data-mode]").forEach((button) => button.onclick = () => {
    viewMode = button.dataset.mode;
    selection = null;
    if (viewMode === "cases" && !caseSetId) caseSetId = workspace.caseSets[0]?.id;
    render();
  });
}

function bindCaseSetEvents() {
  bindModeTabs();
  document.querySelector("#addCaseSet").onclick = addCaseSet;
  document.querySelector("#emptyAddCaseSet")?.addEventListener("click", addCaseSet);
  document.querySelector("#exportButton").onclick = exportJson;
  document.querySelector("#importButton").onclick = () => document.querySelector("#fileInput").click();
  document.querySelector("#fileInput").onchange = importJson;
  const caseSet = currentCaseSet();
  if (!caseSet) return;
  document.querySelector("#caseSetSelect").onchange = (event) => {
    caseSetId = event.target.value;
    selectedCaseId = currentCaseSet()?.cases?.[0]?.id || null;
    caseResults = [];
    selectedCaseResultId = null;
    caseRunState = "idle";
    render();
  };
  document.querySelector("#caseSetName").onchange = (event) => {
    caseSet.name = event.target.value.trim() || "未命名用例集";
    save(); render();
  };
  document.querySelector("#caseActorTemplate").onchange = (event) => {
    caseSet.actorTemplateId = event.target.value;
    save(); render();
  };
  document.querySelector("#caseActionTemplate").onchange = (event) => {
    caseSet.actionTemplateId = event.target.value;
    save(); render();
  };
  document.querySelector("#addCase").onclick = addCase;
  document.querySelector("#addCaseMain").onclick = addCase;
  document.querySelector("#runCaseSetButton").onclick = runCaseSet;
  document.querySelectorAll("[data-case-id], [data-case-row]").forEach((element) => element.onclick = () => {
    selectedCaseId = element.dataset.caseId || element.dataset.caseRow;
    render();
  });
  document.querySelectorAll("[data-result-id], [data-case-result]").forEach((element) => element.onclick = (event) => {
    event.stopPropagation();
    selectedCaseResultId = element.dataset.resultId || element.dataset.caseResult;
    render();
  });
  const testCase = caseSet.cases.find((item) => item.id === selectedCaseId);
  if (!testCase) return;
  document.querySelector("#caseEnabled").onchange = (event) => {
    testCase.enabled = event.target.checked;
    save(); render();
  };
  document.querySelector("#caseName").onchange = (event) => {
    testCase.name = event.target.value.trim() || "未命名用例";
    save(); render();
  };
  document.querySelector("#caseOverrides").onchange = (event) => updateCaseJson(event.target, testCase, "overrides", "参数覆盖");
  document.querySelector("#caseAssertions").onchange = (event) => updateCaseJson(event.target, testCase, "assertions", "断言");
  document.querySelector("#duplicateCase").onclick = () => duplicateCase(testCase);
  document.querySelector("#deleteCase").onclick = () => deleteCase(testCase.id);
}

function addCaseSet() {
  const name = window.prompt("用例集名称", `新用例集 ${workspace.caseSets.length + 1}`)?.trim();
  if (!name) return;
  const id = uid("case-set");
  workspace.caseSets.push({
    id,
    name,
    actorTemplateId: "",
    actionTemplateId: workspace.templates.actions[0]?.id || "",
    cases: []
  });
  caseSetId = id;
  selectedCaseId = null;
  save(); render();
}

function addCase() {
  const caseSet = currentCaseSet();
  const testCase = {
    id: uid("case"),
    name: `用例 ${caseSet.cases.length + 1}`,
    enabled: true,
    overrides: {},
    assertions: [{ source: "status", operator: "equals", expected: 200 }]
  };
  caseSet.cases.push(testCase);
  selectedCaseId = testCase.id;
  save(); render();
}

function duplicateCase(testCase) {
  const copy = clone(testCase);
  copy.id = uid("case");
  copy.name = `${testCase.name} - 副本`;
  currentCaseSet().cases.push(copy);
  selectedCaseId = copy.id;
  save(); render();
}

function deleteCase(id) {
  const caseSet = currentCaseSet();
  caseSet.cases = caseSet.cases.filter((item) => item.id !== id);
  selectedCaseId = caseSet.cases[0]?.id || null;
  save(); render();
}

function updateCaseJson(field, owner, key, label) {
  try {
    const value = JSON.parse(field.value);
    if (key === "assertions" && !Array.isArray(value)) throw new Error("断言必须是数组");
    if (key === "overrides" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error("参数覆盖必须是对象");
    owner[key] = value;
    save(); render();
  } catch (error) {
    alert(`${label} JSON 无效：${error.message}`);
  }
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
      document.querySelectorAll("[data-auth-request-field]").forEach((field) => field.onchange = () => {
        auth.request[field.dataset.authRequestField] = field.value; save(); render();
      });
      document.querySelectorAll("[data-auth-request-json]").forEach((field) => field.onchange = () =>
        updateJson(field, auth.request, field.dataset.authRequestJson));
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
  const data = payload.type === "actor" ? { actor: savedTemplate ? clone(savedTemplate.config) : { name: "新 Actor", variables: { username: "", password: "" }, login: { method: "POST", url: "{{env.baseUrl}}/login", headers: {}, body: {} }, auth: { enabled: false, request: { method: "GET", url: "", headers: {} }, tokenPath: "body.token", headerName: "Authorization", prefix: "Bearer " } } }
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
async function runCaseSet() {
  const caseSet = currentCaseSet();
  if (!caseSet.actionTemplateId) return alert("请先选择一个 Action 模板");
  if (!caseSet.cases.some((item) => item.enabled !== false)) return alert("请至少启用一条用例");
  activeRunController?.abort();
  const controller = new AbortController();
  activeRunController = controller;
  const revision = ++runRevision;
  const workspaceSnapshot = clone(workspace);
  caseRunState = "running";
  caseResults = [];
  selectedCaseResultId = null;
  render();
  try {
    const response = await fetch("/api/execute-case-set", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: workspaceSnapshot, caseSetId }),
      signal: controller.signal
    });
    const result = await response.json();
    if (revision !== runRevision) return;
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    caseResults = result.cases || [];
    caseRunState = result.ok ? "success" : "failure";
    selectedCaseResultId = caseResults.find((item) => !item.ok)?.id || caseResults[0]?.id || null;
  } catch (error) {
    if (revision !== runRevision || error.name === "AbortError") return;
    caseResults = [{ id: "run-error", name: "无法执行用例集", ok: false, error: error.message }];
    caseRunState = "failure";
    selectedCaseResultId = "run-error";
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
    if (!Array.isArray(imported.scenarios)) throw new Error("缺少 scenarios 数组");
    workspace = normalizeWorkspace(imported);
    scenarioId = workspace.scenarios[0]?.id;
    caseSetId = workspace.caseSets[0]?.id;
    selectedCaseId = null;
    selection = null;
    save(); render();
  } catch (error) { alert(`导入失败：${error.message}`); }
}

render();
