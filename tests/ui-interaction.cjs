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
    await page.goto("http://127.0.0.1:4399");

    const scenarioName = page.locator("#scenarioName");
    await scenarioName.fill("可编辑场景名称");
    await scenarioName.press("Tab");
    assert.equal(await page.locator("#scenarioName").getAttribute("value"), "可编辑场景名称", "场景名称应可输入并保存");

    const node = page.locator('[data-node-id="use-a"]');
    const nodeCount = await node.count();
    assert.equal(nodeCount, 1, "示例节点应正常渲染");
    const box = await node.boundingBox();
    await page.mouse.click(box.x + 80, box.y + 30);
    assert.equal(await page.locator('[data-node-id="use-a"].selected').count(), 1, "点击后节点应被选中");
    assert.equal(await page.locator("#deleteNode").count(), 1, "选中后应显示删除按钮");

    page.once("dialog", (dialog) => dialog.accept("主管登录模板"));
    await page.locator("#saveTemplate").click();
    assert.equal(await page.locator('[data-template-id]').count(), 1, "已配置节点应能保存为模板");

    const before = await page.locator(".node").count();
    await page.locator('.library-item[data-library-type="actor"]:not([data-template-id])').dragTo(page.locator(".canvas-inner"), {
      targetPosition: { x: 420, y: 360 },
    });
    assert.equal(await page.locator(".node").count(), before + 1, "应先创建一个独立 Actor 节点实例");
    assert.equal(await page.locator("#saveTemplate").count(), 1, "新节点应立即进入可编辑状态");

    await page.locator("#deleteNode").click();
    assert.equal(await page.locator(".node").count(), before, "应能从属性面板删除节点");

    const edge = page.locator('[data-edge-source="use-a"][data-edge-target="create-project"]');
    const edgeBox = await edge.boundingBox();
    await page.mouse.click(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
    assert.equal(await page.locator(".edge.selected").count(), 1, "点击连线后应被选中");
    assert.equal(await page.locator("#deleteEdge").count(), 1, "选中连线后应显示删除按钮");
    await page.locator("#deleteEdge").click();
    assert.equal(await page.locator('[data-edge-source="use-a"][data-edge-target="create-project"]').count(), 0, "应能删除连线");

    console.log("PASS: 场景命名、节点/连线删除、实例创建与模板保存");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
