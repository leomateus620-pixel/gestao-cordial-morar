import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { saoPauloKeyOf } from "../../src/lib/dates";
import type { AudienceReport, AudienceView } from "../../src/lib/site-audience/report";

const migration = new URL("../../drizzle/migrations/0116_site_audience.sql", import.meta.url);
const rollback = new URL("../../docs/site-audience/rollback.sql", import.meta.url);
const listingA = "00000000-0000-0000-0000-00000000000a";
const listingB = "00000000-0000-0000-0000-00000000000b";
const otherBrand = "00000000-0000-0000-0000-00000000000c";
const id = () => randomUUID();
const event = (kind: string, page: string, fields = {}) => ({ id: id(), kind, page, ...fields });
const view = (propertyId: string, navigation = "navigation") =>
  event("property_view", "property", { propertyId, navigation });
const page = (name: string) => event("page_view", name);
const saoPauloClock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

test("audience migration records known journeys and gives only authorized aggregate access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE FUNCTION public.is_meta_reviewer() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION public.is_atendimentos_viewer() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE TABLE public.cordial_site_eligible (public_id uuid PRIMARY KEY);
      CREATE TABLE public.morar_site_eligible (public_id uuid PRIMARY KEY);
      INSERT INTO public.cordial_site_eligible VALUES ('${listingA}'), ('${listingB}');
      INSERT INTO public.morar_site_eligible VALUES ('${otherBrand}');
    `);
    await db.exec(await readFile(migration, "utf8"));
    await db.exec(
      await readFile(
        new URL(
          "../../drizzle/migrations/0118_site_audience_interaction_totals.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0119_site_audience_action_summary.sql", import.meta.url),
        "utf8",
      ),
    );
    const configure = (brand: string, env: string, enabled: boolean) =>
      db.query("SELECT public.site_audience_configure($1,$2,'qa-v1',$3)", [brand, env, enabled]);
    const report = async (
      brand: string,
      view: AudienceView,
      period = "day",
      offset = 0,
      env = "qa",
    ) => {
      const { rows } = await db.query<{ result: AudienceReport }>(
        "SELECT public.site_audience_report($1,$2,$3,$4,$5,'qa-v1') AS result",
        [brand, env, period, offset, view],
      );
      return rows[0].result;
    };
    const visitor = id();
    const session = id();
    const ingest = async (
      events: unknown[],
      sessionId = session,
      visitorId = visitor,
      source = "qa",
      environment = "qa",
    ) => {
      const { rows } = await db.query<{ state: string }>(
        "SELECT public.site_audience_ingest('cordial',$1,'qa-v1',$2,$3,$4,$5,$6,$7,$8,$9) AS state",
        [
          environment,
          "a".repeat(64),
          sessionId,
          visitorId,
          JSON.stringify(events),
          source ? "paid" : "direct",
          source || null,
          source ? "cpc" : null,
          source ? "qa-campanha" : null,
        ],
      );
      return rows[0].state;
    };

    assert.equal((await report("cordial", "overview")).status, "disabled");
    assert.equal(await ingest([event("session_start", "home")]), "disabled");
    await configure("cordial", "qa", true);
    await db.query("SELECT pg_sleep(0.01)");
    const zero = await report("cordial", "overview");
    if (zero.status !== "ready" || zero.view !== "overview")
      assert.fail("coverage must report an observed zero");
    assert.deepEqual(zero.overview.totals, {
      visitors: 0,
      sessions: 0,
      views: 0,
      propertyViews: 0,
      propertyClicks: 0,
      menuClicks: 0,
    });
    assert.equal((await report("cordial", "overview", "month", 3)).status, "unavailable");
    assert.equal(await ingest([page("home")]), "missing_session");

    const known = [
      event("session_start", "home", { measurableActivity: false }),
      page("home"),
      event("menu_click", "home", { menu: "buy", placement: "header" }),
      page("buy"),
      event("search", "buy"),
      page("search"),
      event("property_click", "search", { propertyId: listingA }),
      page("property"),
      view(listingA),
      event("quick_view", "property", { propertyId: listingB }),
      event("property_click", "property", { propertyId: listingB }),
      page("property"),
      view(listingB),
      event("property_click", "property", { propertyId: listingA }),
      page("property"),
      view(listingA),
      event("whatsapp_click", "property", { propertyId: listingA }),
      event("form_received", "property", { propertyId: listingA }),
      view(otherBrand),
    ];
    assert.equal(await ingest(known), "ok");
    assert.equal(await ingest(known), "ok");
    assert.equal(await ingest([page("property"), view(listingA, "reload")]), "ok");
    assert.equal(await ingest([page("property")], session, id()), "invalid");
    await db.query("SELECT pg_sleep(0.01)");
    let snapshot = await report("cordial", "overview");
    if (snapshot.status !== "ready" || snapshot.view !== "overview")
      assert.fail("expected overview");
    assert.deepEqual(snapshot.overview.totals, {
      visitors: 1,
      sessions: 1,
      views: 7,
      propertyViews: 4,
      propertyClicks: 3,
      menuClicks: 1,
    });
    assert.equal(snapshot.overview.previous, null);
    assert.equal(snapshot.overview.behavior.activeTime, null);
    assert.deepEqual(snapshot.overview.behavior.searchToSecondProperty, { count: 1, sample: 1 });
    assert.deepEqual(snapshot.overview.behavior.propertyToWhatsapp, { count: 1, sample: 1 });
    assert.deepEqual(snapshot.overview.behavior.forms, { count: 1, sample: 1 });
    assert.equal(snapshot.overview.properties.views.length, 2);
    assert.deepEqual(snapshot.overview.properties.views[0], {
      publicId: listingA,
      listing: null,
      views: 3,
      clicks: 2,
      sessions: 1,
      reopens: 1,
      returnSessions: 0,
      whatsapp: 1,
      forms: 1,
      previews: 0,
    });
    assert.equal(snapshot.overview.properties.views[1].previews, 1);
    assert.deepEqual(snapshot.overview.menus, [{ key: "buy", count: 1 }]);
    assert.equal(
      snapshot.overview.trend.reduce((sum, bucket) => sum + (bucket.views ?? 0), 0),
      7,
    );

    const origin = await report("cordial", "origins");
    if (origin.status !== "ready" || origin.view !== "origins") assert.fail("expected origins");
    assert.deepEqual(origin.origins, [
      {
        channel: "paid",
        source: "qa",
        medium: "cpc",
        campaign: "qa-campanha",
        entryPage: "home",
        sessions: 1,
        propertySessions: 1,
        contactSessions: 1,
      },
    ]);
    assert.equal((await report("morar", "origins")).status, "disabled");
    assert.equal((await report("cordial", "overview", "day", 0, "production")).status, "disabled");

    await db.query(
      "UPDATE site_audience.sessions SET last_activity_at = now()-interval '31 minutes' WHERE id=$1",
      [session],
    );
    assert.equal(await ingest([page("buy")]), "expired_session");
    assert.equal(
      await ingest(
        [
          event("session_start", "property", { measurableActivity: false }),
          page("property"),
          view(listingA),
        ],
        id(),
        visitor,
        "",
      ),
      "ok",
    );
    await db.query("DELETE FROM public.cordial_site_eligible WHERE public_id=$1", [listingA]);
    assert.equal(
      await ingest(
        [event("session_start", "property"), page("property"), view(listingA)],
        id(),
        id(),
        "",
      ),
      "ok",
    );
    await db.query("SELECT pg_sleep(0.01)");
    snapshot = await report("cordial", "overview");
    if (snapshot.status !== "ready" || snapshot.view !== "overview")
      assert.fail("expected later return");
    assert.deepEqual(snapshot.overview.totals, {
      visitors: 2,
      sessions: 3,
      views: 9,
      propertyViews: 5,
      propertyClicks: 3,
      menuClicks: 1,
    });
    assert.equal(snapshot.overview.properties.views[0].views, 4);
    assert.equal(snapshot.overview.properties.views[0].returnSessions, 1);
    assert.equal(snapshot.overview.properties.views[0].listing, null);

    const week = await report("cordial", "pages", "week");
    const month = await report("cordial", "pages", "month");
    if (week.status !== "ready" || month.status !== "ready")
      assert.fail("expected current periods");
    const startOfWeek = new Date(week.from);
    const startOfMonth = new Date(month.from);
    assert.equal(saoPauloClock.format(startOfWeek), "00:00:00");
    assert.equal(new Date(`${saoPauloKeyOf(startOfWeek)}T00:00:00Z`).getUTCDay(), 1);
    assert.equal(saoPauloClock.format(startOfMonth), "00:00:00");
    assert.match(saoPauloKeyOf(startOfMonth), /-01$/);
    await configure("cordial", "qa", false);
    assert.equal(await ingest([page("home")]), "disabled");
    assert.equal((await report("cordial", "overview")).status, "ready");

    await configure("cordial", "production", true);
    assert.equal(
      await ingest(
        [event("session_start", "property"), page("property"), view(listingB)],
        id(),
        id(),
        "",
        "production",
      ),
      "ok",
    );
    await db.query("SELECT pg_sleep(0.01)");
    const smallOverview = await report("cordial", "overview", "day", 0, "production");
    if (smallOverview.status !== "ready" || smallOverview.view !== "overview")
      assert.fail("expected production overview");
    assert.equal(smallOverview.overview.totals.views, 1);
    assert.equal(smallOverview.overview.totals.propertyViews, 1);
    assert.equal(smallOverview.overview.totals.propertyClicks, 0);
    assert.deepEqual(smallOverview.overview.properties.views, []);
    assert.deepEqual(smallOverview.overview.pages, []);
    assert.equal(smallOverview.overview.behavior.multipleProperties, null);
    const smallOrigin = await report("cordial", "origins", "day", 0, "production");
    if (smallOrigin.status !== "ready" || smallOrigin.view !== "origins")
      assert.fail("expected withheld origin summary");
    assert.equal(smallOrigin.totalSessions, 1);
    assert.equal(smallOrigin.withheldSessions, 1);
    assert.deepEqual(smallOrigin.origins, []);

    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query("SELECT * FROM site_audience.events"), /permission denied/);
      if (role !== "service_role") {
        await assert.rejects(report("cordial", "overview"), /permission denied/);
        await assert.rejects(configure("cordial", "qa", true), /permission denied/);
      }
      await db.exec("RESET ROLE");
    }
    const singleSessionActions = [
      event("gallery_open", "property", { propertyId: listingB }),
      event("favorite_change", "property", { propertyId: listingB }),
      event("selection_change", "property", { propertyId: listingB }),
      event("phone_click", "contact"),
      event("email_click", "contact"),
    ];
    const actionSession = id(),
      actionVisitor = id();
    await ingest(
      [event("session_start", "property"), page("property"), ...singleSessionActions],
      actionSession,
      actionVisitor,
      "",
      "production",
    );
    await ingest(singleSessionActions, actionSession, actionVisitor, "", "production");
    const details = await report("cordial", "pages", "day", 0, "production");
    assert.ok(details.status === "ready" && details.view === "pages");
    assert.deepEqual(
      details.actions?.map((row) => [row.key, row.count]),
      ["email_click", "favorite_change", "gallery_open", "phone_click", "selection_change"].map(
        (key) => [key, 1],
      ),
    );
    await db.exec(await readFile(rollback, "utf8"));
    const { rows } = await db.query<{ target: string | null }>(
      "SELECT to_regnamespace('site_audience') AS target",
    );
    assert.equal(rows[0].target, null);
  } finally {
    await db.close();
  }
});
