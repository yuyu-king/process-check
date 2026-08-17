import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCaseSet, executeWorkspace } from "./engine.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "public");
const port = Number(process.env.PORT || 4399);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function bodyJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 5_000_000) throw new Error("请求体超过 5 MB");
  }
  return JSON.parse(raw || "{}");
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/api/execute") {
      const { workspace, scenarioId } = await bodyJson(request);
      const result = await executeWorkspace(workspace, scenarioId);
      return sendJson(response, 200, result);
    }
    if (request.method === "POST" && url.pathname === "/api/execute-case-set") {
      const { workspace, caseSetId, caseIds } = await bodyJson(request);
      const result = await executeCaseSet(workspace, caseSetId, { caseIds });
      return sendJson(response, 200, result);
    }
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
    const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = normalize(join(root, requested));
    if (!file.startsWith(root)) return sendJson(response, 403, { error: "Forbidden" });
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not found");
    response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch (error) {
    if (error.code === "ENOENT" || error.message === "Not found") return sendJson(response, 404, { error: "Not found" });
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Process Check 已启动：http://127.0.0.1:${port}`);
  console.log("仅监听本机；Actor 的 Cookie 只在单次执行期间保存在内存中。");
});
