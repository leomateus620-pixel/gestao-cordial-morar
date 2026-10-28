import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { MarketingReportDocument } from "./report-document";
import { cordialReportLogo, morarReportLogo } from "./report-brand.server";

const WIDTH = 595.28,
  HEIGHT = 841.89,
  MARGIN = 42,
  BODY = WIDTH - 2 * MARGIN;
const color = {
  ink: rgb(0.09, 0.106, 0.129),
  muted: rgb(0.37, 0.4, 0.43),
  brand: rgb(0.118, 0.392, 0.49),
  dark: rgb(0.075, 0.243, 0.302),
  copper: rgb(0.851, 0.471, 0.176),
  sand: rgb(0.961, 0.945, 0.922),
  line: rgb(0.86, 0.88, 0.88),
  white: rgb(1, 1, 1),
  faint: rgb(0.975, 0.979, 0.98),
};
const titles = {
  executive: "Resumo executivo",
  detailed: "Desempenho de campanhas",
  funnel: "Leads e atendimento",
};
const coverageLabels: Record<string, string> = {
  data: "Com dados",
  empty: "Coleta vazia",
  pending: "Pendente",
  partial: "Parcial",
  error: "Erro",
};
const platformLabels: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  manual: "Manual",
};
const safe = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[^\u0020-\u00ff\n]/g, "");
const integer = (value: number | null | undefined) =>
  value == null ? "n/d" : value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const decimal = (value: number | null | undefined, digits = 2) =>
  value == null ? "n/d" : value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const percent = (value: number | null | undefined) =>
  value == null ? "n/d" : `${decimal(value)}%`;
function money(value: number | null, currency: string | null) {
  if (value === null || !currency) return "n/d";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
  } catch {
    return "n/d";
  }
}
function date(value: string, year = true) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}${year ? `/${match[1]}` : ""}` : "não informada";
}
function dateTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "não disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
function words(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (font.widthOfTextAtSize(`${line}${line ? " " : ""}${word}`, size) <= maxWidth) {
        line += `${line ? " " : ""}${word}`;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
/** Vector layout and official embedded logo. The same authorized snapshot supplies every page. */
export async function renderMarketingReport(
  snapshot: MarketingReportDocument,
  options: { synthetic?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const entityName = snapshot.entity
    ? { campaign: "campanha", adset: "conjunto", ad: "anúncio" }[snapshot.entity.level]
    : "campanha";
  const plural = `${entityName}s`;
  const title = snapshot.entity ? `Desempenho de ${plural}` : titles[snapshot.scope.type];
  const units = snapshot.entity ? `registros de ${plural}` : "campanhas";
  const agency = snapshot.scope.imobiliaria === "cordial" ? "Cordial Imóveis" : "Morar Imóveis";
  doc.setTitle(`${agency} | Marketing | ${title}`);
  doc.setAuthor(agency);
  doc.setSubject(
    options.synthetic
      ? "Demonstração com dados sintéticos, sem dados pessoais."
      : "Relatório privado de marketing, gerado a partir de um snapshot autorizado.",
  );
  const regular = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const asset = snapshot.scope.imobiliaria === "cordial" ? cordialReportLogo : morarReportLogo;
  const logo =
    asset.format === "png" ? await doc.embedPng(asset.base64) : await doc.embedJpg(asset.base64);
  const text = (
    p: PDFPage,
    value: string,
    x: number,
    top: number,
    size = 10,
    heavy = false,
    fill = color.ink,
    maxWidth?: number,
  ) => {
    const font = heavy ? bold : regular;
    const lines = maxWidth ? words(value, font, size, maxWidth) : [safe(value)];
    lines.forEach((line, index) =>
      p.drawText(line, { x, y: HEIGHT - top - size - index * size * 1.4, size, font, color: fill }),
    );
    return lines.length * size * 1.4;
  };
  const right = (
    p: PDFPage,
    value: string,
    end: number,
    top: number,
    size = 10,
    heavy = false,
    fill = color.ink,
  ) =>
    text(
      p,
      value,
      end - (heavy ? bold : regular).widthOfTextAtSize(safe(value), size),
      top,
      size,
      heavy,
      fill,
    );
  const rect = (
    p: PDFPage,
    x: number,
    top: number,
    width: number,
    height: number,
    fill = color.sand,
  ) => p.drawRectangle({ x, y: HEIGHT - top - height, width, height, color: fill });
  const line = (
    p: PDFPage,
    x1: number,
    top1: number,
    x2: number,
    top2: number,
    fill = color.line,
    thickness = 0.6,
  ) =>
    p.drawLine({
      start: { x: x1, y: HEIGHT - top1 },
      end: { x: x2, y: HEIGHT - top2 },
      color: fill,
      thickness,
    });
  const period = `${date(snapshot.scope.filters.since)} a ${date(snapshot.scope.filters.until)}`;
  const header = (large = false) => {
    const p = doc.addPage([WIDTH, HEIGHT]);
    const h = large ? 110 : 82;
    rect(
      p,
      0,
      0,
      WIDTH,
      h,
      snapshot.scope.imobiliaria === "cordial" ? color.dark : rgb(0.2, 0.2, 0.2),
    );
    const w = large ? 165 : 128,
      lh = (w * logo.height) / logo.width;
    p.drawImage(logo, { x: MARGIN, y: HEIGHT - (h - lh) / 2 - lh, width: w, height: lh });
    right(p, "MARKETING", WIDTH - MARGIN, large ? 28 : 23, 10, true, color.white);
    right(
      p,
      options.synthetic ? "AMOSTRA SINTÉTICA" : "RELATÓRIO PRIVADO",
      WIDTH - MARGIN,
      large ? 47 : 41,
      8,
      false,
      rgb(0.78, 0.87, 0.89),
    );
    if (large)
      right(
        p,
        `Emitido em ${dateTime(snapshot.capturedAt)}`,
        WIDTH - MARGIN,
        76,
        8,
        false,
        rgb(0.78, 0.87, 0.89),
      );
    rect(p, 0, h, WIDTH, 3, color.copper);
    return p;
  };
  const section = (p: PDFPage, title: string, top: number, detail?: string) => {
    text(p, title, MARGIN, top, 13, true);
    if (detail) right(p, detail, WIDTH - MARGIN, top + 2, 8, false, color.muted);
  };
  const first = header(true);
  text(first, title, MARGIN, 134, 25, true);
  text(first, period, MARGIN, 171, 12, true, color.brand);
  text(
    first,
    `${integer(snapshot.total)} ${units} no escopo  |  ${snapshot.scope.filters.platform ? platformLabels[snapshot.scope.filters.platform] : "Todas as plataformas"}`,
    MARGIN,
    192,
    9,
    false,
    color.muted,
  );
  const account = snapshot.scope.filters.accountId
    ? `Conta ${snapshot.scope.filters.accountId}`
    : "Todas as contas autorizadas";
  text(first, account, MARGIN, 213, 8.5, false, color.muted, 306);
  right(
    first,
    `Moeda: ${snapshot.kpis.currency ?? "sem consolidação"}`,
    WIDTH - MARGIN,
    213,
    8.5,
    false,
    color.muted,
  );
  text(
    first,
    `Fuso dos dados: ${snapshot.timezones.map((zone) => (zone === "America/Sao_Paulo" ? "São Paulo / Brasília" : zone)).join(", ") || "não informado"}`,
    MARGIN,
    230,
    8.5,
    false,
    color.muted,
    BODY,
  );
  const kpis = snapshot.financialVisible
    ? [
        {
          label: "INVESTIMENTO",
          value: money(snapshot.kpis.spend, snapshot.kpis.currency),
          note: "Total no período",
        },
        {
          label: "LEADS META",
          value: snapshot.kpis.hasData ? integer(snapshot.kpis.leads) : "n/d",
          note: "Reportados pela plataforma",
        },
        {
          label: "CUSTO POR LEAD",
          value: money(snapshot.kpis.cpl, snapshot.kpis.currency),
          note: "Investimento / leads Meta",
        },
        { label: "CTR", value: percent(snapshot.kpis.ctr), note: "Todos os cliques / impressões" },
      ]
    : [
        {
          label: "IMPRESSÕES",
          value: snapshot.kpis.hasData ? integer(snapshot.kpis.impressions) : "n/d",
          note: "Exibições dos anúncios",
        },
        {
          label: "CLIQUES (TODOS)",
          value: snapshot.kpis.hasData ? integer(snapshot.kpis.clicks) : "n/d",
          note: "Inclui cliques sem saída",
        },
        {
          label: "LEADS META",
          value: snapshot.kpis.hasData ? integer(snapshot.kpis.leads) : "n/d",
          note: "Reportados pela plataforma",
        },
        { label: "CTR", value: percent(snapshot.kpis.ctr), note: "Todos os cliques / impressões" },
      ];
  const kpiWidth = BODY / 4;
  rect(first, MARGIN, 257, BODY, 88, color.sand);
  kpis.forEach((kpi, index) => {
    const x = MARGIN + index * kpiWidth + 12;
    if (index) line(first, x - 12, 272, x - 12, 330, rgb(0.84, 0.82, 0.79));
    text(first, kpi.label, x, 270, 7.7, true, color.muted);
    let size = 23;
    while (bold.widthOfTextAtSize(safe(kpi.value), size) > kpiWidth - 24 && size > 13) size--;
    text(first, kpi.value, x, 288, size, true, color.brand);
    text(first, kpi.note, x, 323, 6.7, false, color.muted);
  });
  if (snapshot.scope.type === "funnel") {
    section(first, "Da plataforma ao atendimento", 370);
    const metrics = [
      {
        title: "Leads reportados na Meta",
        count: snapshot.kpis.hasData ? snapshot.kpis.leads : null,
        note: "Métrica publicitária; atribuição da plataforma",
      },
      {
        title: "Submissões recebidas",
        count: snapshot.funnel.submissions,
        note: "Formulários recuperados e preservados no CRM",
      },
      {
        title: "Atendimentos únicos vinculados",
        count: snapshot.funnel.attendances,
        note: "Acompanhamento interno, sem atribuição de venda",
      },
    ];
    metrics.forEach((metric, index) => {
      const top = 402 + index * 50;
      rect(first, MARGIN, top, BODY, 44, index % 2 ? color.white : color.faint);
      text(first, metric.title, MARGIN + 12, top + 7, 10, true);
      text(first, metric.note, MARGIN + 12, top + 24, 8, false, color.muted);
      right(first, integer(metric.count), WIDTH - MARGIN - 12, top + 7, 22, true, color.brand);
    });
    text(
      first,
      `${integer(snapshot.funnel.linkedSubmissions)} submissões têm campanha vinculada. As três etapas têm definições e datas próprias; não representam uma taxa única de conversão.`,
      MARGIN,
      564,
      9,
      false,
      color.muted,
      BODY,
    );
  } else if (snapshot.entity?.grain === "period") {
    section(first, "Agregado do período completo", 370, "Sem soma de alcance");
    const values = [
      ["Impressões", integer(snapshot.kpis.impressions)],
      ["Cliques (todos)", integer(snapshot.kpis.clicks)],
      ["Alcance no recorte exato", integer(snapshot.kpis.reach)],
      ["Frequência no recorte exato", decimal(snapshot.kpis.frequency)],
    ];
    values.forEach(([label, value], index) => {
      const top = 402 + index * 34;
      text(first, label, MARGIN, top, 10, false, color.muted);
      right(first, value, WIDTH - MARGIN, top, 12, true, color.brand);
      line(first, MARGIN, top + 26, WIDTH - MARGIN, top + 26);
    });
    text(
      first,
      "Este snapshot contém o agregado do intervalo. Ele não contém uma série diária; alcance e frequência de várias entidades não são consolidados.",
      MARGIN,
      553,
      9,
      false,
      color.muted,
      BODY,
    );
  } else {
    section(first, "Evolução dos resultados", 370, "Leads reportados por dia");
    const plotX = MARGIN + 28,
      plotTop = 406,
      plotWidth = BODY - 38,
      plotHeight = 126,
      baseline = plotTop + plotHeight;
    const start = Date.parse(`${snapshot.scope.filters.since}T00:00:00Z`),
      end = Date.parse(`${snapshot.scope.filters.until}T00:00:00Z`);
    const days = Math.round((end - start) / 86400000) + 1,
      step = plotWidth / Math.max(days, 1);
    const byDay = new Map(
      snapshot.trend.filter((d) => d.leads !== null).map((d) => [d.date, d.leads]),
    );
    const maxValue = Math.max(1, ...snapshot.trend.map((d) => d.leads ?? 0));
    const magnitude = 10 ** Math.floor(Math.log10(maxValue));
    const topValue = Math.ceil(maxValue / magnitude / 4) * magnitude * 4;
    let missing = 0;
    for (let index = 0; index < days; index++) {
      const day = new Date(start + index * 86400000).toISOString().slice(0, 10);
      if (!byDay.has(day)) {
        rect(first, plotX + index * step, plotTop, step, plotHeight, color.sand);
        missing++;
      }
    }
    for (let index = 0; index <= 4; index++) {
      const y = baseline - (index * plotHeight) / 4;
      line(first, plotX, y, plotX + plotWidth, y, color.line, 0.4);
      right(first, integer((topValue * index) / 4), plotX - 8, y - 4, 7.5, false, color.muted);
    }
    for (const point of snapshot.trend) {
      if (point.leads === null) continue;
      const index = Math.round((Date.parse(`${point.date}T00:00:00Z`) - start) / 86400000);
      const height = (point.leads / topValue) * plotHeight;
      rect(
        first,
        plotX + index * step + step * 0.2,
        baseline - Math.max(height, 0.9),
        Math.max(0.3, step * 0.6),
        Math.max(height, 0.9),
        color.brand,
      );
    }
    const tickIndexes = [
      ...new Set(
        Array.from({ length: Math.min(5, days) }, (_, index) =>
          Math.round((index * (days - 1)) / Math.max(1, Math.min(5, days) - 1)),
        ),
      ),
    ];
    for (const index of tickIndexes) {
      const label = date(new Date(start + index * 86400000).toISOString(), false),
        x = plotX + (index + 0.5) * step;
      text(
        first,
        label,
        Math.min(plotX + plotWidth - 26, Math.max(plotX, x - 13)),
        baseline + 10,
        7.5,
        false,
        color.muted,
      );
    }
    rect(first, MARGIN, 566, 7, 7, color.sand);
    text(
      first,
      `${missing} ${missing === 1 ? "dia sem métrica comparável" : "dias sem métrica comparável"}. Faixas claras indicam ausência, não zero.`,
      MARGIN + 13,
      565,
      8,
      false,
      color.muted,
    );
  }
  section(
    first,
    `${plural[0].toUpperCase()}${plural.slice(1)} em destaque`,
    612,
    "Ranking por leads Meta",
  );
  const topRows = [...snapshot.rows]
    .filter((row) => row.leads !== null)
    .sort((a, b) => (b.leads ?? 0) - (a.leads ?? 0))
    .slice(0, 3);
  if (!topRows.length)
    text(
      first,
      "Ainda não há coleta suficiente para montar o ranking.",
      MARGIN,
      644,
      10,
      false,
      color.muted,
    );
  topRows.forEach((row, index) => {
    const top = 641 + index * 29;
    line(first, MARGIN, top + 24, WIDTH - MARGIN, top + 24, color.line, 0.4);
    text(first, String(index + 1).padStart(2, "0"), MARGIN, top, 9, true, color.copper);
    const label = words(row.name, regular, 9, 340)[0];
    text(first, label, MARGIN + 26, top, 9);
    right(first, `${integer(row.leads)} leads`, WIDTH - MARGIN, top, 10, true, color.brand);
  });
  const issues =
    (snapshot.coverage.partial ?? 0) +
    (snapshot.coverage.error ?? 0) +
    (snapshot.coverage.pending ?? 0);
  line(first, MARGIN, 750, MARGIN, 780, color.copper, 2.5);
  text(
    first,
    !snapshot.rows.length
      ? `Nenhum registro de ${entityName} neste snapshot.`
      : issues
        ? `Atenção à cobertura: ${issues} ${issues === 1 ? "campanha exige" : "campanhas exigem"} acompanhamento.`
        : "Cobertura disponível para o escopo selecionado.",
    MARGIN + 12,
    750,
    9,
    true,
  );
  text(
    first,
    `${integer(snapshot.coverage.data)} com dados | ${integer(snapshot.coverage.empty)} vazias | ${integer(snapshot.coverage.partial)} parciais | ${integer(snapshot.coverage.pending)} pendentes | ${integer(snapshot.coverage.error)} com erro`,
    MARGIN + 12,
    766,
    7.8,
    false,
    color.muted,
  );

  // Full authorized scope, never just the 25 visible dashboard rows. Repeated table header on every page.
  let tablePage: PDFPage,
    tableTop = 0;
  const newTablePage = () => {
    tablePage = header();
    text(
      tablePage,
      `${plural[0].toUpperCase()}${plural.slice(1)} do período`,
      MARGIN,
      108,
      21,
      true,
    );
    text(
      tablePage,
      `${period}  |  ${integer(snapshot.rows.length)} registros exportados`,
      MARGIN,
      140,
      9,
      false,
      color.muted,
    );
    rect(tablePage, MARGIN, 165, BODY, 28, color.brand);
    text(
      tablePage,
      `${entityName.toUpperCase()} / SITUAÇÃO`,
      MARGIN + 8,
      175,
      7,
      true,
      color.white,
    );
    for (const [label, x] of [
      ["LEADS", 286],
      ["CLIQUES", 340],
      ["IMPRESSÕES", 408],
      [snapshot.financialVisible ? "INVESTIMENTO" : "CTR", 481],
      [snapshot.financialVisible ? "CPL" : "ALCANCE", WIDTH - MARGIN - 8],
    ] as const)
      right(tablePage, label, x, 175, 6.8, true, color.white);
    tableTop = 193;
  };
  newTablePage();
  if (!snapshot.rows.length)
    text(
      tablePage!,
      `Nenhum registro de ${entityName} neste recorte.`,
      MARGIN + 8,
      tableTop + 22,
      11,
      false,
      color.muted,
    );
  snapshot.rows.forEach((row, index) => {
    const nameLines = words(row.name, bold, 9.1, 203);
    const metaLines = words(
      `${platformLabels[row.platform] ?? row.platform} | ${row.status} | ${coverageLabels[row.coverage] ?? "Não verificada"}`,
      regular,
      7.2,
      203,
    );
    const accountLines = row.accountId ? words(`Conta ${row.accountId}`, regular, 7, 203) : [];
    const rowHeight = Math.max(
      45,
      12 + nameLines.length * 12.2 + metaLines.length * 10 + accountLines.length * 9,
    );
    if (tableTop + rowHeight > 771) newTablePage();
    if (index % 2 === 0) rect(tablePage!, MARGIN, tableTop, BODY, rowHeight, color.faint);
    let localTop = tableTop + 9;
    nameLines.forEach((value) => {
      text(tablePage!, value, MARGIN + 8, localTop, 9.1, true);
      localTop += 12.2;
    });
    metaLines.forEach((value) => {
      text(tablePage!, value, MARGIN + 8, localTop, 7.2, false, color.muted);
      localTop += 10;
    });
    accountLines.forEach((value) => {
      text(tablePage!, value, MARGIN + 8, localTop, 7, false, color.muted);
      localTop += 9;
    });
    right(tablePage!, integer(row.leads), 286, tableTop + 11, 9.3, true);
    right(tablePage!, integer(row.clicks), 340, tableTop + 11, 9.3);
    right(tablePage!, integer(row.impressions), 408, tableTop + 11, 9.3);
    if (snapshot.financialVisible) {
      right(tablePage!, money(row.spend, row.currency), 481, tableTop + 11, 8.4);
      right(tablePage!, money(row.cpl, row.currency), WIDTH - MARGIN - 8, tableTop + 11, 8.4);
      right(tablePage!, `CTR ${percent(row.ctr)}`, 408, tableTop + 27, 6.8, false, color.muted);
    } else {
      right(tablePage!, percent(row.ctr), 481, tableTop + 11, 9.3);
      right(tablePage!, integer(row.reach), WIDTH - MARGIN - 8, tableTop + 11, 9.3);
    }
    line(
      tablePage!,
      MARGIN,
      tableTop + rowHeight,
      WIDTH - MARGIN,
      tableTop + rowHeight,
      color.line,
      0.35,
    );
    tableTop += rowHeight;
  });

  const appendix = header();
  text(appendix, "Leitura, cobertura e fontes", MARGIN, 108, 21, true);
  text(
    appendix,
    "Informações para interpretar o relatório com segurança.",
    MARGIN,
    140,
    9,
    false,
    color.muted,
  );
  const updates = snapshot.rows
    .map((row) => row.updatedAt)
    .filter((value): value is string => !!value)
    .sort();
  const information = [
    [
      "ESCOPO",
      `${agency} | ${platformLabels[snapshot.scope.filters.platform ?? ""] ?? "Todas as plataformas"}\n${account}\nStatus: ${snapshot.scope.filters.status ?? "todos"}${snapshot.scope.filters.search ? ` | Busca: ${snapshot.scope.filters.search}` : ""}`,
    ],
    [
      "ATUALIZAÇÃO",
      `Última coleta: ${dateTime(snapshot.entity?.completedAt ?? updates.at(-1))}\nColeta mais antiga: ${dateTime(updates[0])}\nSnapshot: ${dateTime(snapshot.capturedAt)} (Brasília)`,
    ],
    [
      "ENTREGA DO ARQUIVO",
      `${integer(snapshot.rows.length)} de ${integer(snapshot.total)} ${units} no snapshot\n${snapshot.financialVisible ? "Valores financeiros autorizados" : "Sem valores financeiros nem custos derivados"}\nVersão do relatório: ${snapshot.version}`,
    ],
    [
      "FUSO E MOEDA",
      `${snapshot.timezones.join(", ") || "Fuso não informado"}\n${snapshot.kpis.currency ? `Moeda consolidada: ${snapshot.kpis.currency}` : "Moedas sem consolidação conjunta"}\nDatas das métricas preservam o fuso da conta`,
    ],
  ];
  information.forEach(([title, value], index) => {
    const x = MARGIN + (index % 2) * (BODY / 2 + 8),
      top = 173 + Math.floor(index / 2) * 101;
    text(appendix, title, x, top, 8, true, color.brand);
    text(appendix, value, x, top + 19, 8.3, false, color.muted, BODY / 2 - 16);
  });
  section(appendix, "Como os indicadores são calculados", 388);
  let definitionTop = 420;
  snapshot.definitions.forEach((definition, index) => {
    text(
      appendix,
      String(index + 1).padStart(2, "0"),
      MARGIN,
      definitionTop,
      8,
      true,
      color.copper,
    );
    const height = text(
      appendix,
      definition,
      MARGIN + 27,
      definitionTop,
      9,
      false,
      color.muted,
      BODY - 27,
    );
    definitionTop += height + 15;
  });
  line(appendix, MARGIN, 733, WIDTH - MARGIN, 733);
  text(appendix, "n/d = não disponível", MARGIN, 746, 9, true);
  text(
    appendix,
    "Ausência, restrição de acesso e coleta incompleta não são convertidas em zero. Alcance e frequência sem agregado compatível permanecem indisponíveis.",
    MARGIN,
    763,
    8,
    false,
    color.muted,
    BODY,
  );
  for (const [index, p] of doc.getPages().entries()) {
    line(p, MARGIN, 801, WIDTH - MARGIN, 801, color.line, 0.5);
    text(
      p,
      `${agency} | Marketing${options.synthetic ? " | DADOS SINTÉTICOS" : " | Uso interno"}`,
      MARGIN,
      812,
      7.5,
      false,
      color.muted,
    );
    right(
      p,
      `${String(index + 1).padStart(2, "0")} / ${String(doc.getPageCount()).padStart(2, "0")}`,
      WIDTH - MARGIN,
      812,
      7.5,
      true,
      color.brand,
    );
  }
  return doc.save();
}
