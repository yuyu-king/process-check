const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const server = spawn(process.execPath, ["src/server.js"], { stdio: "ignore" });
  let browser;
  try {
    await new Promise((resolve) => setTimeout(resolve, 350));
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    });
    const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
    await page.goto("http://127.0.0.1:4399");
    await page.evaluate(() => {
      localStorage.setItem("process-check.workspace.v1", JSON.stringify({
        version: 3,
        name: "接口条件验证",
        activeEnvironment: "local",
        environments: { local: { baseUrl: "http://127.0.0.1:4399" } },
        variables: {},
        templates: {
          actors: [],
          actions: [{
            id: "health-action",
            name: "健康检查",
            config: {
              name: "健康检查",
              request: { method: "GET", url: "{{env.baseUrl}}/", headers: {} }
            }
          }]
        },
        scenarios: [{ id: "empty-flow", name: "空流程", nodes: [], edges: [] }],
        caseSets: [{
          id: "health-cases",
          name: "健康检查参数验证",
          actorTemplateId: "",
          actionTemplateId: "health-action",
          cases: [
            {
              id: "enabled-case",
              name: "正常请求",
              enabled: true,
              overrides: {},
              assertions: [{ source: "status", operator: "equals", expected: 200 }]
            },
            {
              id: "disabled-case",
              name: "暂不运行",
              enabled: false,
              overrides: { url: "{{env.baseUrl}}/missing" },
              assertions: [{ source: "status", operator: "equals", expected: 404 }]
            }
          ]
        }]
      }));
    });
    await page.reload();
    await page.locator('[data-mode="cases"]').click();

    assert.equal(await page.locator("[data-case-row]").count(), 2, "用例集应以表格展示每条参数用例");
    assert.equal(await page.locator("#caseActionTemplate").inputValue(), "health-action", "应引用已有 Action 模板");

    await page.locator('[data-case-row="enabled-case"]').click();
    await page.locator("#caseName").fill("健康检查成功");
    await page.locator("#caseName").press("Tab");
    assert.equal(await page.locator('[data-case-row="enabled-case"] strong').textContent(), "健康检查成功", "用例名称应可编辑并保存");

    await page.locator("#runCaseSetButton").click();
    await page.locator(".status.success").waitFor();
    assert.match(await page.locator(".status.success").textContent(), /1\/1 通过/, "批量执行应跳过禁用用例并汇总结果");
    assert.equal(await page.locator('[data-case-result="enabled-case"]').count(), 1, "应展示单条用例的运行结果");

    console.log("PASS: 接口用例集编辑、Action 模板引用、批量运行与禁用用例跳过");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
