const assert = require("node:assert/strict");
const test = require("node:test");

const browserModule = process.env.AUDIENCE_PLAYWRIGHT_MODULE || "playwright";
const { chromium, webkit, devices } = require(browserModule);
const previewUrl =
  process.env.AUDIENCE_PREVIEW_URL || "http://127.0.0.1:5184/tests/dashboard/audience-preview.html";
const chromeChannel = process.env.AUDIENCE_CHROME_CHANNEL;
const timeout = { timeout: 10_000 };

async function checkDashboard(page, hasTouch) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const navigate = (params) => {
    const url = new URL(previewUrl);
    url.search = new URLSearchParams(params);
    return page.goto(url.href, timeout);
  };
  const loading = page.getByRole("status", { name: "Carregando a audiência do período" });
  const cordialLeader = "Casa térrea no Jardim Europa";
  const morarLeader = "Casa com varanda no Jardim das Oliveiras";
  const heading = (name) => page.getByRole("heading", { name });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const text = (value) => page.getByText(value, { exact: true });

  await navigate({ state: "loading" });
  await loading.waitFor(timeout);
  await heading("Apartamento na Vila Madalena").waitFor(timeout);
  assert.equal(await button("Cliques").getAttribute("aria-pressed"), "true");
  await text("Nº 1 em cliques").waitFor(timeout);
  await button("Fichas").click(timeout);
  await heading(cordialLeader).waitFor(timeout);
  const titleBounds = await heading("Audiência dos sites").boundingBox();
  const brandBounds = await page.getByRole("tablist", { name: "Imobiliária" }).boundingBox();
  assert.ok(brandBounds.x >= titleBounds.x + titleBounds.width - 1);

  await button("Mês").click(timeout);
  await heading("Top 10 do mês").waitFor(timeout);

  const morarTab = page.getByRole("tab", { name: /Morar Imóveis/ });
  if (hasTouch) {
    await morarTab.tap(timeout);
  } else {
    await page.getByRole("tab", { name: /Cordial Imóveis/ }).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-choice") === "morar",
    );
    await page.keyboard.press("Enter");
  }
  await loading.waitFor(timeout);
  assert.equal(
    await text(cordialLeader).count(),
    0,
    "A troca oculta imediatamente a marca anterior.",
  );
  assert.equal(await button("Mês").getAttribute("aria-pressed"), "true");
  await heading(morarLeader).waitFor(timeout);
  assert.equal(await heading("Top 10 do mês").count(), 1);
  assert.equal(
    await page
      .getByRole("list", { name: "Imóveis por visualizações da ficha" })
      .locator("li")
      .count(),
    5,
  );

  await button("Cliques").click(timeout);
  await heading("Apartamento no Alto do Lago").waitFor(timeout);
  await button("Detalhar").click(timeout);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("list", { name: "Ações no site por frequência" }).waitFor(timeout);
  await dialog.getByText("Anuncie", { exact: true }).first().waitFor(timeout);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", ...timeout });

  await page.getByRole("tab", { name: "Origens" }).click(timeout);
  await text("Origem / mídia").waitFor(timeout);
  await text("visita-agendada").waitFor(timeout);
  const [clientWidth, scrollWidth] = await page.evaluate(() => [
    document.documentElement.clientWidth,
    document.documentElement.scrollWidth,
  ]);
  assert.equal(clientWidth, scrollWidth, "O detalhamento de origens não alarga a página.");

  await button("Período anterior").click(timeout);
  await text("outubro de 2026").waitFor(timeout);
  await navigate({ brand: "morar", theme: "dark" });
  await heading("Apartamento no Alto do Lago").waitFor(timeout);
  await button("Dia").click(timeout);
  await text("Por hora").waitFor(timeout);
  const chart = page.locator(".sa-chart");
  const { width, height } = await chart.boundingBox();
  const position = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  await (hasTouch ? chart.tap({ position }) : chart.click({ position }));
  assert.ok(await page.locator(".recharts-tooltip-wrapper").isVisible());
  await text("Dados do gráfico").click(timeout);
  await page.getByRole("columnheader", { name: "Hora" }).waitFor(timeout);
  await button("Como medimos").click(timeout);
  await dialog.getByText("Saídas rápidas", { exact: true }).waitFor(timeout);

  for (const [state, label] of [
    ["disabled", "Coleta desligada"],
    ["unavailable", "Período sem cobertura"],
    ["zero", "Interesse nos imóveis"],
    ["retained", "Interesse nos imóveis"],
    ["error", "Relatório indisponível"],
    ["unauthorized", "Acesso restrito"],
    ["partial", "Interesse nos imóveis"],
  ]) {
    await navigate({ state });
    await text(label).waitFor(timeout);
    assert.equal(await text("Coleta habilitada").isVisible(), false);
    assert.equal(await text("Cobertura parcial no período").isVisible(), false);
    if (["partial", "retained"].includes(state)) {
      await button("Como medimos").click();
      await dialog.getByText(/Cobertura parcial no período/).waitFor();
      await page.keyboard.press("Escape");
    }
    if (state === "zero") {
      assert.deepEqual(await page.locator(".sa-interest dd").allTextContents(), ["0", "0"]);
      assert.deepEqual(await page.locator(".sa-kpi > strong").allTextContents(), ["0", "0", "0"]);
    }
  }
  assert.deepEqual(errors, []);
}

const browserCases = [
  ["Chrome desktop", chromium, { viewport: { width: 1365, height: 900 } }],
  ["Chrome com perfil Pixel 7", chromium, devices["Pixel 7"]],
  ["WebKit com perfil iPhone 13", webkit, devices["iPhone 13"]],
];
test("Prévia de audiência", { concurrency: true }, async (suite) => {
  await Promise.all(
    browserCases.map(([name, engine, options]) =>
      suite.test(name, async () => {
        const browser = await engine.launch(
          engine === chromium && chromeChannel ? { channel: chromeChannel } : {},
        );
        try {
          const page = await browser.newPage(options);
          await checkDashboard(page, options.hasTouch);
        } finally {
          await browser.close();
        }
      }),
    ),
  );
});
