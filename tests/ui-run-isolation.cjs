const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const server = spawn(process.execPath, ["src/server.js"], { stdio: "ignore" });
  let browser;
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let runCount = 0;
    await page.route("**/api/execute", async (route) => {
      runCount += 1;
      const failed = runCount === 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(failed
          ? { ok: false, error: "旧 Action 失败", events: [{ type: "action:failure", label: "旧 Action 失败" }] }
          : { ok: true, events: [{ type: "actor:success", label: "Actor 登录成功" }, { type: "scenario:success", label: "场景成功" }] })
      });
    });
    await page.goto("http://127.0.0.1:4399");

    await page.locator("#runButton").click();
    await page.locator(".status.failure").waitFor({ state: "visible" });
    assert.equal(await page.getByText("旧 Action 失败", { exact: true }).count() > 0, true);

    const action = page.locator('[data-node-id="create-project"]');
    const box = await action.boundingBox();
    await page.mouse.click(box.x + 80, box.y + 30);
    await page.locator("#deleteNode").click();

    assert.equal(await page.locator(".status").textContent(), "未运行", "修改场景后旧运行状态应立即失效");
    assert.equal(await page.getByText("旧 Action 失败", { exact: true }).count(), 0, "删除 Action 后不应保留其错误日志");

    await page.locator("#runButton").click();
    await page.locator(".status.success").waitFor({ state: "visible" });
    assert.equal(await page.getByText("旧 Action 失败", { exact: true }).count(), 0, "新运行不能被旧错误污染");
    console.log("PASS: 删除失败 Action 后，Actor-only 运行与旧结果隔离");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
