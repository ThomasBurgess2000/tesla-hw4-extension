const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { test, expect, chromium } = require("@playwright/test");

const projectRoot = path.resolve(__dirname, "..");
const extensionPath = path.join(projectRoot, "extension");
const fixturePath = path.join(projectRoot, "test", "fixtures", "inventory.html");

let server;
let baseUrl;

test.beforeAll(async () => {
  const fixtureHtml = await fs.readFile(fixturePath, "utf8");
  const inventoryBatches = {
    my: {
      0: [
        { VIN: "5YJYGDEE2LF059373", Model: "my" },
        { VIN: "5YJYGDEDXMF110434", Model: "my" }
      ],
      2: [
        { VIN: "7SAYGDEE0PA131200", Model: "my" }
      ]
    },
    ms: {
      0: [
        { VIN: "5YJSA7E65PF501500", Model: "ms" },
        { VIN: "5YJSA7E65PF502123", Model: "ms" }
      ]
    },
    mx: {
      0: [
        { VIN: "7SAXCDE50PF375000", Model: "mx" },
        { VIN: "7SAXCDE50PF381111", Model: "mx" }
      ]
    },
    m3: {
      0: [
        { VIN: "5YJ3E1EA7PF123456", Model: "m3" },
        { VIN: "5YJ3E1EA7RF123456", Model: "m3" }
      ]
    },
    mslegacy: {
      0: [
        { VIN: "5YJSA1E26JF250000", Model: "ms" },
        { VIN: "5YJSA1E26KF350000", Model: "ms" }
      ]
    }
  };

  server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/inventory/api/v4/inventory-results") {
      let offset = 0;
      let model = "my";

      try {
        const query = JSON.parse(requestUrl.searchParams.get("query"));
        offset = Number(query.offset) || 0;
        model = String(query.query && query.query.model || "my").toLowerCase();
      } catch (error) {}

      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        results: (inventoryBatches[model] && inventoryBatches[model][offset]) || []
      }));
      return;
    }

    if (!request.url || request.url === "/" || request.url.startsWith("/inventory")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(fixtureHtml);
      return;
    }

    response.writeHead(404);
    response.end("Not found");
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/inventory/used/my`;
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

test("loads the extension and badges existing and newly added listings", async () => {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    const cards = page.locator(".vehicle-card");
    await expect(cards.nth(0).locator(".tesla-hw-badge")).toHaveText("HW3");
    await expect(cards.nth(1).locator(".tesla-hw-badge")).toHaveText("HW3");

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await expect(cards.nth(2)).toBeVisible();
    await expect(cards.nth(2).locator(".tesla-hw-badge")).toHaveText("HW4");
  } finally {
    await context.close();
  }
});

test("classifies model-specific transition ranges", async () => {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const page = await context.newPage();
    await page.goto(baseUrl.replace("/my", "/ms"), { waitUntil: "domcontentloaded" });
    await expect(page.locator(".vehicle-card").nth(0).locator(".tesla-hw-badge")).toHaveText("HW3/HW4");
    await expect(page.locator(".vehicle-card").nth(1).locator(".tesla-hw-badge")).toHaveText("HW4");

    await page.goto(baseUrl.replace("/my", "/mx"), { waitUntil: "domcontentloaded" });
    await expect(page.locator(".vehicle-card").nth(0).locator(".tesla-hw-badge")).toHaveText("HW3/HW4");
    await expect(page.locator(".vehicle-card").nth(1).locator(".tesla-hw-badge")).toHaveText("HW4");

    await page.goto(baseUrl.replace("/my", "/m3"), { waitUntil: "domcontentloaded" });
    await expect(page.locator(".vehicle-card").nth(0).locator(".tesla-hw-badge")).toHaveText("HW3");
    await expect(page.locator(".vehicle-card").nth(1).locator(".tesla-hw-badge")).toHaveText("HW4");

    await page.goto(baseUrl.replace("/my", "/mslegacy"), { waitUntil: "domcontentloaded" });
    await expect(page.locator(".vehicle-card").nth(0).locator(".tesla-hw-badge")).toHaveText("HW2.5");
    await expect(page.locator(".vehicle-card").nth(1).locator(".tesla-hw-badge")).toHaveText("HW2.5/HW3");
  } finally {
    await context.close();
  }
});
