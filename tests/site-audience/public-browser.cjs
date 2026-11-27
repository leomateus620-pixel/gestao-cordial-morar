const assert = require("node:assert/strict");
const { chromium, webkit, devices } = require(
  process.env.SITE_AUDIENCE_PLAYWRIGHT_PACKAGE || "playwright",
);
const built = process.argv.includes("--built");
const fixturePort = built ? 5208 : 5198;
const fixtureStorage = `http://127.0.0.1:${fixturePort + 1}`;
const state = async () => fetch(`${fixtureStorage}/__qa/audience`).then((r) => r.json());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function count(data, brand, kind) {
  return data.events.find((item) => item.brand === brand && item.kind === kind)?.total ?? 0;
}
function delta(before, after, brand, kind) {
  return count(after, brand, kind) - count(before, brand, kind);
}
async function totals(before, brand, expected, stage) {
  const latest = Date.now() + 10000;
  while (Date.now() < latest) {
    const snapshot = await state();
    if (Object.entries(expected).every(([k, v]) => delta(before, snapshot, brand, k) === v)) {
      const other = brand === "cordial" ? "morar" : "cordial";
      for (const row of snapshot.events.filter((r) => r.brand === other))
        assert.equal(row.total, count(before, other, row.kind), "other brand changed: " + row.kind);
      console.log(stage, brand, JSON.stringify(expected));
      return snapshot;
    }
    await sleep(200);
  }
  const snapshot = await state();
  console.error(stage, brand, JSON.stringify({ before, after: snapshot, expected }));
  throw new Error("unexpected event totals");
}
const configs = {
  desktop: {
    launch: () => chromium.launch({ channel: "chrome" }),
    context: { viewport: { width: 1365, height: 900 } },
  },
  android: { launch: () => chromium.launch({ channel: "chrome" }), context: devices["Pixel 7"] },
  iphone: { launch: () => webkit.launch(), context: devices["iPhone 13"] },
};
async function guardedContext(browser, settings) {
  const context = await browser.newContext(settings);
  await context.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (
      url.hostname.endsWith(".localhost") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    )
      await route.continue();
    else
      await route.fulfill({
        status: 200,
        body: "Local browser fixture intercepted external navigation.",
      });
  });
  return context;
}
async function submitFixtureLead(page, brand) {
  if (brand === "cordial")
    await page.getByRole("button", { name: "Prefiro enviar uma mensagem" }).click();
  const form = page.locator(".cs-contact-form");
  await form.getByLabel("Seu nome").fill("Validação Audiência");
  await form.getByLabel("Telefone / WhatsApp").fill("55999999999");
  await form
    .getByLabel("Como podemos ajudar?")
    .fill("Teste local de formulário persistido para a audiência.");
  await form.getByRole("checkbox").check();
  const lead = page.waitForResponse(
    (r) => r.url().endsWith("/leads") && r.request().method() === "POST",
  );
  await form.getByRole("button", { name: /Enviar/ }).click();
  const response = await lead;
  assert.equal(response.status(), 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.audienceProof, "string");
}
async function switchIntake(unavailable) {
  const response = await fetch(`${fixtureStorage}/__qa/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unavailable }),
  });
  assert.equal(response.ok, true);
}
async function directAndUnavailable(browser, settings, brand, url) {
  const context = await guardedContext(browser, settings);
  try {
    const page = await context.newPage();
    const intake = (response) =>
      response.url().endsWith("/audience") && response.request().method() === "POST";
    let before = await state();
    await page.goto(url);
    const accepted = page.waitForResponse(intake);
    await page.getByRole("button", { name: "Aceitar audiência", exact: true }).click();
    const initial = await accepted;
    assert.equal(initial.status(), 204);
    const batch = initial.request().postDataJSON();
    assert.equal(batch.events[0].kind, "session_start");
    assert.equal(batch.events[0].attribution, undefined);
    await totals(
      before,
      brand,
      { page_view: 1, property_view: 1, property_click: 0, session_start: 1 },
      "direct without acquisition",
    );

    before = await state();
    await switchIntake(true);
    try {
      const rejected = page.waitForResponse(intake);
      await page.reload();
      assert.equal((await rejected).status(), 503);
      await submitFixtureLead(page, brand);
      assert.equal((await state()).persistedLeads[brand] - before.persistedLeads[brand], 1);
      await totals(
        before,
        brand,
        { page_view: 0, property_view: 0, form_received: 0 },
        "intake failure leaves lead flow available",
      );
    } finally {
      await switchIntake(false);
    }
  } finally {
    await context.close();
  }
}
async function walk(browser, settings, brand, extended) {
  const context = await guardedContext(browser, settings);
  let before = await state();
  const page = await context.newPage();
  const origin = `http://${brand}.localhost:${fixturePort}`;
  const api = "/api/" + brand + "-site/audience";
  const idA = uuid(brand === "cordial" ? 100 : 110);
  const idB = uuid(brand === "cordial" ? 101 : 111);
  const notices = [];
  const outgoing = [];
  page.on("pageerror", (e) => notices.push(e.message));
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith(api)) outgoing.push(req.postDataJSON());
  });
  page.on("response", (res) => {
    if (
      res.request().method() === "POST" &&
      (res.url().includes(api) || res.url().endsWith("/leads"))
    )
      console.log("HTTP", brand, res.url().slice(origin.length), res.status());
  });
  try {
    await page.goto(origin + "/?utm_source=qa&utm_medium=cpc&utm_campaign=acceptance");
    await page
      .getByRole("button", { name: "Aceitar audiência", exact: true })
      .click({ timeout: 15000 });
    await totals(before, brand, { session_start: 1, page_view: 1 }, "grant");
    assert.equal(outgoing[0].events[0].attribution?.campaign, "acceptance");
    if (settings.isMobile)
      await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    const nav = page.getByRole("navigation", {
      name: settings.isMobile ? "Menu móvel" : "Navegação principal",
    });
    await nav.getByRole("link", { name: "Comprar", exact: true }).click();
    await page.waitForURL(/\/buscar\?finalidade=venda/);
    await totals(before, brand, { session_start: 1, page_view: 2, menu_click: 1 }, "Comprar");
    const listingA = page
      .locator(".cs-property-card")
      .filter({ hasText: brand === "cordial" ? "1001" : "2001" })
      .first();
    if (brand === "cordial") {
      await listingA.getByRole("button", { name: "Visualização rápida" }).click();
      await page.getByRole("dialog").waitFor();
      await totals(
        before,
        brand,
        { page_view: 2, property_view: 0, quick_view: 1, property_click: 0 },
        "quick view",
      );
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    await listingA.locator("a.cs-card-arrow").click();
    await page.waitForURL((url) => url.pathname.endsWith(idA));
    await totals(before, brand, { page_view: 3, property_view: 1, property_click: 1 }, "A");
    await page.locator(".cs-property-card a.cs-card-arrow").first().click();
    await page.waitForURL((url) => url.pathname.endsWith(idB));
    await totals(before, brand, { page_view: 4, property_view: 2, property_click: 2 }, "B");
    await page.locator(".cs-property-card a.cs-card-arrow").first().click();
    await page.waitForURL((url) => url.pathname.endsWith(idA));
    await totals(before, brand, { page_view: 5, property_view: 3, property_click: 3 }, "A again");
    const currentProperty = page.url();
    const popupEvent = context.waitForEvent("page");
    await page
      .locator("aside#fale-sobre-imovel")
      .getByRole("link", { name: "Conversar pelo WhatsApp" })
      .click();
    const popup = await popupEvent;
    await popup.close();
    await page.bringToFront();
    await totals(before, brand, { page_view: 5, whatsapp_click: 1 }, "WhatsApp");
    await submitFixtureLead(page, brand);
    const completed = await totals(
      before,
      brand,
      { page_view: 5, property_view: 3, property_click: 3, form_received: 1, whatsapp_click: 1 },
      "campaign journey",
    );
    assert.equal(completed.persistedLeads[brand] - before.persistedLeads[brand], 1);
    assert.ok(
      outgoing
        .flatMap((batch) => batch.events)
        .filter((e) => e.kind === "property_view")
        .every((e) => e.navigation === "navigation"),
    );
    if (!extended) return;

    await page.reload();
    await totals(
      before,
      brand,
      { session_start: 1, page_view: 6, property_view: 4, property_click: 3 },
      "reload",
    );
    const measured = outgoing
      .flatMap((batch) => batch.events)
      .filter((e) => e.kind === "property_view");
    assert.equal(measured.at(-1).navigation, "reload");
    const tab = await context.newPage();
    await tab.goto(currentProperty);
    await totals(
      before,
      brand,
      { session_start: 1, page_view: 7, property_view: 5, property_click: 3 },
      "second tab direct",
    );
    await tab.bringToFront();
    await tab.waitForFunction(
      async (key) =>
        (await navigator.locks.query()).held.filter((lock) => lock.name === key).length === 1,
      brand + ":audience:activity:v1",
    );
    const identityKey = brand + ":audience:identity:v1";
    const original = await tab.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      identityKey,
    );
    await tab.evaluate((key) => {
      const item = JSON.parse(localStorage.getItem(key));
      item.lastActivity = Date.now() - 31 * 60 * 1000;
      localStorage.setItem(key, JSON.stringify(item));
    }, identityKey);
    await tab.reload();
    await totals(
      before,
      brand,
      { session_start: 2, page_view: 8, property_view: 6, property_click: 3 },
      "session expiry",
    );
    const next = await tab.evaluate((key) => JSON.parse(localStorage.getItem(key)), identityKey);
    assert.notEqual(original.sessionId, next.sessionId);
    assert.equal(original.visitorId, next.visitorId);
    await tab.getByRole("button", { name: "Métricas de audiência", exact: true }).click();
    await tab.getByRole("button", { name: "Revogar permissão", exact: true }).click();
    await page.reload();
    await tab.reload();
    await sleep(500);
    await totals(
      before,
      brand,
      { session_start: 2, page_view: 8, property_view: 6, property_click: 3 },
      "revoked both tabs",
    );
    assert.equal(await tab.evaluate((key) => localStorage.getItem(key), identityKey), null);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), identityKey), null);

    const denied = await guardedContext(browser, settings);
    try {
      const p = await denied.newPage();
      await p.goto(currentProperty);
      await p.getByRole("button", { name: "Recusar audiência", exact: true }).click();
      await p.reload();
      await p.getByRole("button", { name: "Métricas de audiência", exact: true }).waitFor();
      await sleep(500);
      await totals(
        before,
        brand,
        { session_start: 2, page_view: 8, property_view: 6, property_click: 3 },
        "denied before ID",
      );
      assert.equal(await p.evaluate((key) => localStorage.getItem(key), identityKey), null);
    } finally {
      await denied.close();
    }
    await directAndUnavailable(browser, settings, brand, currentProperty);
  } catch (e) {
    console.error(
      "journey error",
      brand,
      page.url(),
      notices,
      outgoing.flatMap((batch) => batch.events.map((event) => event.kind)),
    );
    throw e;
  } finally {
    await context.close();
  }
}

(async () => {
  const requested = process.argv.slice(2).filter((value) => value !== "--built");
  for (const mode of requested.length ? requested : Object.keys(configs)) {
    assert.ok(configs[mode], "Choose desktop, android or iphone");
    const { launch, context } = configs[mode];
    const browser = await launch();
    try {
      for (const brand of ["cordial", "morar"])
        await walk(browser, context, brand, mode === "desktop");
      console.log("PASS", mode);
    } finally {
      await browser.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
