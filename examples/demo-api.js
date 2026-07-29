import http from "node:http";

const projects = new Map();
let nextProjectId = 1;
const sessions = new Map();

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}
async function body(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || "{}");
}
function currentUser(request) {
  const token = (request.headers.cookie || "").match(/session=([^;]+)/)?.[1];
  return sessions.get(token);
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:4321");
  if (request.method === "POST" && url.pathname === "/login") {
    const input = await body(request);
    const token = Math.random().toString(36).slice(2);
    sessions.set(token, input.username);
    return json(response, 200, { username: input.username }, { "set-cookie": `session=${token}; Path=/; HttpOnly` });
  }
  const user = currentUser(request);
  if (!user) return json(response, 401, { error: "unauthorized" });
  if (request.method === "POST" && url.pathname === "/projects") {
    const input = await body(request);
    const id = String(nextProjectId++);
    projects.set(id, { id, ...input, creator: user, approvedBy: [] });
    return json(response, 201, projects.get(id));
  }
  const match = url.pathname.match(/^\/projects\/([^/]+)\/approve$/);
  if (request.method === "POST" && match) {
    const project = projects.get(match[1]);
    if (!project) return json(response, 404, { error: "not found" });
    if (!project.approvedBy.includes(user)) project.approvedBy.push(user);
    const emailSent = project.approvedBy.length === project.approvers.length;
    return json(response, 200, { projectId: project.id, approvedBy: project.approvedBy, emailSent });
  }
  json(response, 404, { error: "not found" });
}).listen(4321, "127.0.0.1", () => {
  console.log("示例业务 API 已启动：http://127.0.0.1:4321");
});
