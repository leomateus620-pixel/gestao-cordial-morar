/**
 * MANUAL ONLY: run in a disposable, isolated Node process through the authorized Lovable workflow.
 * PUBLIC_BOT_RUN_RUNTIME_SMOKE=true is required. This is outside every automated *.test.ts suite.
 * Uses real scoped persistence/catalog/AI, at most one extraction per brand, and no voice or analytics.
 * The TEST-NET address is a synthetic fixture injected into in-process Requests. Overriding ingress
 * attestation below tests handler behavior ONLY; it neither proves nor enables production ingress.
 * No persistent settings are changed. Remove only printed synthetic session/quota/open-limit/usage
 * identifiers afterwards through Lovable; retain global paid usage/cost reservations from this run.
 * Never run this by importing it into an application worker or a process serving visitors.
 */
import { randomUUID } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { handlePublicBot } from "../../src/lib/public-property-bot/http.server";
import { repository } from "../../src/lib/public-property-bot/repository.server";
import { interpret } from "../../src/lib/public-property-bot/provider.server";
import {
  draftSchema,
  emptyFilters,
  eventSchema,
  suggestionSchema,
  type BotAction,
  type BotBrand,
  type SearchDraft,
  type SearchFilters,
  type TurnResult,
} from "../../src/lib/public-property-bot/contracts";
import { dailyIdentity, sha256 } from "../../src/lib/public-property-bot/quota.server";
import { cookieName, readToken } from "../../src/lib/public-property-bot/session.server";
import { readBoundedBody } from "../../src/lib/public-property-bot/transport";
import { centralContact, toCard } from "../../src/lib/public-property-bot/cards";
import { hardMatch } from "../../src/lib/public-property-bot/ranking";
import { BotError } from "../../src/lib/public-property-bot/errors";
import { sitePublicHost } from "../../src/lib/cordial-site/domains";

const FIXTURE_IP = "192.0.2.123";
const brands: BotBrand[] = ["cordial", "morar"];
const sessionSchema = z
  .object({
    draft: draftSchema,
    turns: z.array(z.unknown()).max(25),
    voice: z.boolean(),
    enabled: z.boolean(),
    exhausted: z.boolean(),
    suggestions: z.array(suggestionSchema).max(4),
    contactHref: z.string().max(2000),
  })
  .strict();
class SmokeFailure extends Error {
  constructor(
    public stage: string,
    public status?: number,
  ) {
    super(stage);
  }
}
function check(ok: unknown, stage: string): asserts ok {
  if (!ok) throw new SmokeFailure(stage);
}
type CleanupSession = { brand: BotBrand; tokenHash: string; requestIds: string[] };
type BrandReport = {
  brand: BotBrand;
  ok: boolean;
  stage: string;
  httpStatus?: number;
  aiCalls: number;
  costReservations: number;
  elapsedMs: number;
  turns: number;
  cards: number;
  suggestions: number;
  persisted: boolean;
  crossBrandDenied: boolean;
  centralLinksVerified: boolean;
};

async function run() {
  const previous = {
    PUBLIC_BOT_INGRESS_VERIFIED: process.env.PUBLIC_BOT_INGRESS_VERIFIED,
    PUBLIC_BOT_TRUSTED_IP_HEADER: process.env.PUBLIC_BOT_TRUSTED_IP_HEADER,
  };
  const cleanup: { synthetic: true; day?: string; ipKey?: string; sessions: CleanupSession[] } = {
    synthetic: true,
    sessions: [],
  };
  const reports: BrandReport[] = [];
  let paidCalls = 0,
    reservations = 0;
  let setupFailed = false;
  const dependencies = {
    repo: {
      ...repository,
      async reserveCost(...args: Parameters<typeof repository.reserveCost>) {
        check(reservations < 2, "paid_budget_cap");
        await repository.reserveCost(...args);
        reservations++;
      },
    },
    async interpret(...args: Parameters<typeof interpret>) {
      check(paidCalls < 2 && reservations > paidCalls, "unreserved_paid_call");
      paidCalls++;
      return interpret(...args);
    },
  };
  try {
    check(process.env.PUBLIC_BOT_RUN_RUNTIME_SMOKE === "true", "manual_gate_required");
    check(
      process.env.PUBLIC_BOT_IP_SECRET && process.env.PUBLIC_BOT_IP_SECRET.length >= 32,
      "missing_runtime_configuration",
    );
    process.env.PUBLIC_BOT_INGRESS_VERIFIED = "true";
    process.env.PUBLIC_BOT_TRUSTED_IP_HEADER = "cf-connecting-ip";
    const fixtureIdentity = await dailyIdentity(
      new Request("https://example.invalid", {
        headers: { "cf-connecting-ip": FIXTURE_IP },
      }),
    );
    cleanup.day = fixtureIdentity.day;
    cleanup.ipKey = fixtureIdentity.key;
    for (const brand of brands) {
      const started = Date.now();
      const callsBefore = paidCalls,
        reservesBefore = reservations;
      const report: BrandReport = {
        brand,
        ok: false,
        stage: "session",
        aiCalls: 0,
        costReservations: 0,
        elapsedMs: 0,
        turns: 0,
        cards: 0,
        suggestions: 0,
        persisted: false,
        crossBrandDenied: false,
        centralLinksVerified: false,
      };
      reports.push(report);
      let cookie = "";
      const prefix = brand === "cordial" ? "CORDIAL_SITE" : "MORAR_SITE";
      const origin = `https://${sitePublicHost(brand, process.env[`VITE_${prefix}_PUBLIC_HOST`])}`;
      const request = (endpoint: "session" | "chat", body: object) =>
        new Request(`${origin}/api/${brand}-site/bot/${endpoint}`, {
          method: "POST",
          signal: AbortSignal.timeout(60000),
          headers: {
            origin,
            "content-type": "application/json",
            "cf-connecting-ip": FIXTURE_IP,
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
        });
      try {
        const opened = await handlePublicBot(
          request("session", {}),
          brand,
          "session",
          dependencies,
        );
        if (opened.status !== 200) throw new SmokeFailure("session_http", opened.status);
        check(opened.headers.get("cache-control") === "no-store", "session_cache_policy");
        const setCookie = opened.headers.get("set-cookie") ?? "";
        check(
          /;\s*HttpOnly(?:;|$)/i.test(setCookie) &&
            /;\s*Secure(?:;|$)/i.test(setCookie) &&
            /;\s*SameSite=Strict(?:;|$)/i.test(setCookie),
          "session_cookie_policy",
        );
        cookie = setCookie.split(";", 1)[0];
        const token = readToken(request("session", {}), brand);
        check(token && cookie.startsWith(`${cookieName(brand)}=`), "session_token_missing");
        const tokenHash = await sha256(token);
        const identifiers: CleanupSession = { brand, tokenHash, requestIds: [] };
        cleanup.sessions.push(identifiers);
        const openedData = sessionSchema.parse(
          JSON.parse(new TextDecoder().decode(await readBoundedBody(opened, 256000, 60000))),
        );
        check(
          openedData.enabled && !openedData.exhausted && openedData.turns.length === 0,
          "fresh_synthetic_session",
        );
        report.suggestions = openedData.suggestions.length;
        const [facets, config, saleDocs] = await Promise.all([
          repository.facets(brand),
          repository.configuration(brand),
          repository.candidates(brand, { ...emptyFilters(), operation: "venda" }),
        ]);
        const sample =
          saleDocs[0] ??
          (
            await repository.candidates(brand, {
              ...emptyFilters(),
              operation: "aluguel",
            })
          )[0];
        const operation = sample?.property.operation ?? "venda";
        const type =
          sample?.property.type && facets.types.includes(sample.property.type)
            ? sample.property.type
            : null;
        const city =
          sample?.property.city && facets.cities.includes(sample.property.city)
            ? sample.property.city
            : null;
        const ceiling = Math.min(1e12, Math.max(1e9, sample?.property.price ?? 0));
        const filters: SearchFilters = {
          ...emptyFilters(),
          operation,
          type,
          city,
          budget: { min: null, max: { value: ceiling, inclusive: true } },
        };
        check(
          openedData.contactHref === centralContact(brand, config.whatsapp),
          "session_central_contact",
        );
        let draft: SearchDraft = openedData.draft;
        async function send(action: BotAction): Promise<TurnResult> {
          const requestId = randomUUID();
          identifiers.requestIds.push(requestId);
          const chatRequest = request("chat", { requestId, revision: draft.revision, action });
          const response = await handlePublicBot(chatRequest, brand, "chat", dependencies);
          if (response.status !== 200) throw new SmokeFailure("chat_http", response.status);
          check(
            response.headers.get("content-type")?.startsWith("text/event-stream"),
            "chat_stream_type",
          );
          check(response.headers.get("cache-control") === "no-store", "chat_cache_policy");
          const raw = new TextDecoder().decode(
            await readBoundedBody(
              { body: response.body, signal: chatRequest.signal },
              256000,
              60000,
            ),
          );
          const events = raw
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => eventSchema.parse(JSON.parse(line.slice(5))));
          check(
            events.length > 0 &&
              events.every(
                (event, index) =>
                  event.requestId === requestId &&
                  event.sequence === index &&
                  event.type !== "error",
              ),
            "stream_event_contract",
          );
          const last = events.at(-1);
          check(
            events[0].type === "accepted" && last?.type === "done" && last.result,
            "stream_completed",
          );
          check(
            !last.result.unavailable &&
              !last.result.exhausted &&
              last.result.draft.revision === draft.revision + 1,
            "turn_succeeded",
          );
          check(
            events.some((event) => event.type === "filters_updated"),
            "canonical_state_event",
          );
          draft = last.result.draft;
          report.turns++;
          return last.result;
        }
        // Public facet values only; the synthetic request itself is never logged or stored as transcript.
        const prompt = `Quero ${operation === "venda" ? "comprar" : "alugar"} ${type ? `um imóvel do tipo ${JSON.stringify(type)}` : "um imóvel"}${city ? ` na cidade ${JSON.stringify(city)}` : ""}, até R$ ${ceiling.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${operation === "aluguel" ? " por mês" : ""}. Sem preferência de quartos, banheiros, suítes, vagas, área ou diferenciais. Pesquise com esses critérios.`;
        let result = await send({ kind: "text", text: prompt });
        check(
          paidCalls - callsBefore === 1 && reservations - reservesBefore === 1,
          "one_extraction_per_brand",
        );
        check(result.draft.filters.operation === operation, "interpreted_operation");
        if (result.question)
          result = await send({
            kind: "filters",
            patch: filters,
            countsAnswered: true,
            budgetAnswered: true,
          });
        check(result.question === null, "structured_search_completed");
        const current = await repository.resolve(
          brand,
          result.cards.map((card) => card.id),
        );
        check(
          new Set(result.cards.map((card) => card.id)).size === result.cards.length,
          "unique_cards",
        );
        for (const card of result.cards) {
          const document = current.find(
            (doc) => doc.brand === brand && doc.property.id === card.id,
          );
          check(
            document &&
              document.version === card.version &&
              hardMatch(document.property, result.draft.filters),
            "current_public_cards",
          );
          const expected = toCard(document, config.whatsapp);
          check(
            card.detailPath === expected.detailPath &&
              card.whatsappUrl === expected.whatsappUrl &&
              card.imagePath === expected.imagePath,
            "canonical_card_links",
          );
        }
        report.cards = result.cards.length;
        report.centralLinksVerified = true;
        const persisted = await repository.readSession(brand, tokenHash);
        check(
          persisted.draft.revision === result.draft.revision &&
            identifiers.requestIds.every((id) =>
              persisted.turns.some((turn) => turn.requestId === id),
            ),
          "durable_turns",
        );
        report.persisted = true;
        try {
          await repository.readSession(brand === "cordial" ? "morar" : "cordial", tokenHash);
        } catch (error) {
          report.crossBrandDenied = error instanceof BotError && error.code === "session_expired";
        }
        check(report.crossBrandDenied, "cross_brand_session_isolation");
        report.stage = "complete";
        report.ok = true;
      } catch (error) {
        report.stage = error instanceof SmokeFailure ? error.stage : "runtime_failure";
        if (error instanceof SmokeFailure && error.status) report.httpStatus = error.status;
      } finally {
        report.aiCalls = paidCalls - callsBefore;
        report.costReservations = reservations - reservesBefore;
        report.elapsedMs = Date.now() - started;
        cookie = "";
      }
    }
  } catch {
    setupFailed = true;
  } finally {
    for (const key of Object.keys(previous) as Array<keyof typeof previous>) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    const ok =
      !setupFailed &&
      reports.length === 2 &&
      reports.every((report) => report.ok) &&
      paidCalls <= 2 &&
      reservations <= 2;
    // The only output: sanitized statuses/counts and exact identifiers of these synthetic records.
    console.log(
      JSON.stringify({
        synthetic: true,
        ok,
        setupFailed,
        productionIngressAttested: false,
        aiCalls: paidCalls,
        costReservations: reservations,
        reports,
        cleanup,
      }),
    );
    process.exitCode = ok ? 0 : 1;
  }
}
const directlyInvoked =
  !!process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;
if (directlyInvoked) {
  if (process.env.PUBLIC_BOT_RUN_RUNTIME_SMOKE === "true") await run();
  else {
    console.log(JSON.stringify({ synthetic: true, skipped: true, manualGateRequired: true }));
    process.exitCode = 1;
  }
}
