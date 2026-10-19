import { test } from "node:test";
import assert from "node:assert/strict";
import type { PublicProperty } from "../../src/lib/cordial-site/contract";
import {
  searchReturnPath,
  searchNavigationContext,
  readSearchOrigin,
  rememberSearchCardOrigin,
  readSearchCardOrigin,
  readSearchCardScroll,
  propertyUrl,
  propertyWhatsapp,
  whatsappNumber,
  trackSiteEvent,
  photoIndexFromHash,
} from "../../src/lib/cordial-site/experience";

const id = "10000000-0000-4000-8000-000000000001";
const property = { id, reference: "471", responsible: null } as PublicProperty;

test("a preview's current photo survives a full-sheet link and clamps safely after gallery changes", () => {
  assert.equal(photoIndexFromHash("#foto-3", 6), 2);
  assert.equal(photoIndexFromHash("#foto-9", 4), 3);
  assert.equal(photoIndexFromHash("#foto-0", 4), 0);
  assert.equal(photoIndexFromHash("#foto-3", 0), 0);
  assert.equal(photoIndexFromHash("", 6), null);
  assert.equal(photoIndexFromHash("#outside", 6), null);
});

test("return accepts only the corresponding public search and preserves filters, page and presentation", () => {
  const path = "/site/buscar?cidade=Santa+Rosa&bairro=Centro&pagina=3&visualizacao=lista";
  assert.equal(searchReturnPath(path), path);
  for (const input of [
    null,
    "https://outside.invalid/site/buscar?cidade=Centro",
    "/gestao",
    "/site/imovel/x",
    "/site-morar/buscar",
    "javascript:alert(1)",
  ])
    assert.equal(searchReturnPath(input), "/site/buscar");
  assert.equal(
    searchReturnPath("/site-morar/buscar?tipo=Casa", "morar"),
    "/site-morar/buscar?tipo=Casa",
  );
  assert.equal(searchReturnPath("/site/buscar", "morar"), "/site-morar/buscar");
});

test("only a recognized search-to-property navigation receives return context", () => {
  const path = "/site/buscar?pagina=2&visualizacao=lista";
  assert.deepEqual(searchNavigationContext(`/site/imovel/${id}`, path, "cordial"), {
    brand: "cordial",
    propertyId: id,
    path,
  });
  assert.equal(searchNavigationContext(`/site/imovel/${id}`, "/site", "cordial"), undefined);
  assert.equal(
    searchNavigationContext(`/site/imovel/${id}`, "https://outside.invalid/site/buscar", "cordial"),
    undefined,
  );
  assert.equal(searchNavigationContext(`/site-morar/imovel/${id}`, path, "cordial"), undefined);
});

test("return belongs to the current history entry, including reload and same-ID direct reentry", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const entry: { state: Record<string, unknown> } = { state: {} };
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { history: entry },
    });
    entry.state = {
      publicSiteSearch: searchNavigationContext(
        `/site/imovel/${id}`,
        "/site/buscar?pagina=2&visualizacao=lista",
        "cordial",
      ),
    };
    assert.equal(readSearchOrigin(id), "/site/buscar?pagina=2&visualizacao=lista");
    // Reload/back retain this entry; another property or another brand cannot use it.
    assert.equal(readSearchOrigin(id), "/site/buscar?pagina=2&visualizacao=lista");
    assert.equal(readSearchOrigin("10000000-0000-4000-8000-000000000002"), "/site/buscar");
    assert.equal(readSearchOrigin(id, "morar"), "/site-morar/buscar");
    // A new direct/external entry of the SAME ID has no inherited search.
    entry.state = {};
    assert.equal(readSearchOrigin(id), "/site/buscar");
    entry.state = {
      publicSiteSearch: {
        brand: "cordial",
        propertyId: id,
        path: "https://outside.invalid/phishing",
      },
    };
    assert.equal(readSearchOrigin(id), "/site/buscar");
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("card focus is stored on the source entry and used only for the same recognized search", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const location = {
    origin: "https://cordialgestao.com",
    pathname: "/site/buscar",
    search: "?cidade=Santa+Rosa&visualizacao=lista",
  };
  const history = {
    state: { __TSR_index: 2 } as Record<string, unknown>,
    replaceState(next: Record<string, unknown>) {
      this.state = next;
    },
  };
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { history, location, scrollY: 732 },
    });
    const context = searchNavigationContext(
      `/site/imovel/${id}`,
      location.pathname + location.search,
      "cordial",
    )!;
    rememberSearchCardOrigin(context);
    assert.equal(history.state.__TSR_index, 2);
    assert.equal(readSearchCardOrigin(), id);
    assert.equal(readSearchCardScroll(), 732);
    assert.equal(readSearchCardOrigin("morar"), null);
    location.search = "?cidade=Outra";
    assert.equal(readSearchCardOrigin(), null);
    assert.equal(readSearchCardScroll(), null);
    location.pathname = "/site/imovel/" + id;
    location.search = "";
    assert.equal(readSearchCardOrigin(), null);
    // The configured public root host maps /buscar to the same internal source.
    location.origin = "https://cordial.example";
    location.pathname = "/buscar";
    location.search = context.path.slice("/site/buscar".length);
    history.state = { publicSiteCardFocus: context };
    assert.equal(readSearchCardOrigin("cordial", "cordial.example"), id);
    assert.equal(readSearchCardOrigin("cordial", "other.example"), null);
    // A different/new search entry does not inherit the marker.
    history.state = {};
    location.pathname = "/site/buscar";
    assert.equal(readSearchCardOrigin(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("public links preserve the Gestão /site prefix and distinguish Morar", () => {
  assert.equal(
    propertyUrl(property, "https://cordialgestao.com"),
    `https://cordialgestao.com/site/imovel/${id}`,
  );
  assert.equal(
    propertyUrl(property, "https://preview.invalid/ignored-path"),
    `https://preview.invalid/site/imovel/${id}`,
  );
  assert.equal(
    propertyUrl(property, "https://cordialgestao.com", "morar"),
    `https://cordialgestao.com/site-morar/imovel/${id}`,
  );
  assert.equal(propertyUrl(property, ""), `/site/imovel/${id}`);
  assert.equal(propertyUrl(property, "javascript:alert(1)"), `/site/imovel/${id}`);
});

test("WhatsApp resolves the published person, valid central fallback, and REF/link without waiting for analytics", () => {
  assert.equal(whatsappNumber("(55) 99999-0000"), "5555999990000");
  assert.equal(whatsappNumber("+55 (55) 3511-0000"), "555535110000");
  assert.equal(whatsappNumber(""), null);
  assert.equal(whatsappNumber("123"), null);
  const url = propertyUrl(property, "https://cordialgestao.com");
  const central = propertyWhatsapp(property, "(55) 99999-0000", url);
  assert.ok(central);
  const parsed = new URL(central);
  assert.equal(parsed.pathname, "/5555999990000");
  assert.equal(parsed.searchParams.get("text"), `Olá! Tenho interesse no imóvel REF 471. ${url}`);
  const assigned = {
    ...property,
    responsible: {
      kind: "person",
      name: "Pessoa de teste",
      role: "Atendimento",
      whatsapp: "(51) 98888-0000",
      photoUrl: null,
    },
  } as PublicProperty;
  assert.equal(
    new URL(propertyWhatsapp(assigned, "(55) 99999-0000", url)!).pathname,
    "/5551988880000",
  );
  assert.equal(
    propertyWhatsapp(
      { ...assigned, responsible: { ...assigned.responsible!, whatsapp: "invalid" } },
      "(55) 99999-0000",
      url,
    ),
    central,
  );
  assert.equal(propertyWhatsapp(property, "", url), null);
});

test("analytics requires consent, dispatches asynchronously, and drops PII/unknown/nested fields", async () => {
  const originals = ["window", "localStorage"].map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  const target = new EventTarget();
  const events: Array<Record<string, unknown>> = [];
  let consent: string | null = null;
  target.addEventListener("cordial:analytics", (event) =>
    events.push((event as CustomEvent<Record<string, unknown>>).detail),
  );
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: target });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => consent },
    });
    trackSiteEvent("whatsapp_click", { propertyId: id, reference: "471", source: "card" });
    await Promise.resolve();
    assert.equal(events.length, 0);
    consent = "granted";
    const unsafe = {
      propertyId: id,
      reference: "471",
      source: "card",
      active: true,
      count: 5,
      name: "PRIVATE-NAME",
      phone: "PRIVATE-PHONE",
      email: "PRIVATE-EMAIL",
      message: "PRIVATE-MESSAGE",
    };
    trackSiteEvent("selection_changed", unsafe);
    assert.equal(events.length, 0, "the local command must not wait for metrics");
    await Promise.resolve();
    assert.deepEqual(events[0], {
      name: "selection_changed",
      propertyId: id,
      reference: "471",
      source: "card",
      active: true,
      count: 5,
    });
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE-/);
    trackSiteEvent("favorite_changed", {
      source: { name: "PRIVATE-NESTED" },
      count: Number.NaN,
    } as unknown as Parameters<typeof trackSiteEvent>[1]);
    await Promise.resolve();
    assert.deepEqual(events[1], { name: "favorite_changed" });
    trackSiteEvent("gallery_open", { propertyId: id });
    consent = "denied";
    await Promise.resolve();
    assert.equal(events.length, 2, "revoking consent before queued dispatch prevents it");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("storage blocked");
        },
      },
    });
    assert.doesNotThrow(() => trackSiteEvent("property_open", { propertyId: id }));
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
