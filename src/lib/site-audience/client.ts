import { getSiteBrand, type SiteBrand } from "../cordial-site/brand";
import { SITE_PUBLIC_HOSTS } from "../cordial-site/domains";
import {
  AUDIENCE_MAX_BATCH_EVENTS,
  type AudienceAction,
  type AudienceBatch,
  type AudienceConfig,
  type AudienceEvent,
} from "./contract";
import { audienceAttribution, type AudienceView } from "./navigation";

const SESSION_IDLE_MS = 30 * 60_000;
const VISITOR_LIFETIME_MS = 30 * 24 * 60 * 60_000;
const ACTIVITY_IDLE_MS = 15_000;
const SAMPLE_MS = 10_000;
const RETRY_COOLDOWN_MS = 5_000;
const MAX_QUEUE = 100;
const pointerEvents = ["pointerdown", "keydown", "wheel", "touchmove"] as const;
const isUuid = (input: unknown): input is string =>
  typeof input === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input);

export function audienceStorageKeys(brand: SiteBrand) {
  return {
    preference: `${brand}:audience:preference:v1`,
    identity: `${brand}:audience:identity:v1`,
    activityLock: `${brand}:audience:activity:v1`,
  };
}

type Preference = "granted" | "denied";
type PreferenceRecord = { policyVersion: string; choice: Preference };
export function readAudiencePreference(brand: SiteBrand): PreferenceRecord | null {
  try {
    const value = JSON.parse(localStorage.getItem(audienceStorageKeys(brand).preference) ?? "null");
    return typeof value?.policyVersion === "string" &&
      (value.choice === "granted" || value.choice === "denied")
      ? { policyVersion: value.policyVersion, choice: value.choice }
      : null;
  } catch {
    return null;
  }
}
export function writeAudiencePreference(brand: SiteBrand, preference: PreferenceRecord): boolean {
  try {
    localStorage.setItem(audienceStorageKeys(brand).preference, JSON.stringify(preference));
    return true;
  } catch {
    return false;
  }
}
export function clearAudienceIdentity(brand: SiteBrand) {
  try {
    localStorage.removeItem(audienceStorageKeys(brand).identity);
  } catch {
    /* Storage access may be disabled. */
  }
}

export function audienceEndpoint(brand: SiteBrand) {
  return `${getSiteBrand(brand).apiBase}/audience`;
}

export function audienceCredentials(brand: SiteBrand): RequestCredentials {
  const official = SITE_PUBLIC_HOSTS[brand];
  const hostname = window.location.hostname.toLowerCase();
  // QA can be behind the site's existing HTTP Basic gate.
  return hostname === official || hostname === `www.${official}` ? "omit" : "same-origin";
}

type Identity = {
  visitorId: string;
  expiresAt: number;
  sessionId: string;
  lastActivity: number;
};
type QueueEntry = Pick<Identity, "visitorId" | "sessionId"> & { event: AudienceEvent };
type AudienceController = ReturnType<typeof createAudience>;
const controllers = new Map<SiteBrand, AudienceController>();

export function measureAudienceAction(brand: SiteBrand, action: AudienceAction) {
  try {
    controllers.get(brand)?.action(action);
  } catch {
    /* A measurement failure cannot interrupt navigation or contact. */
  }
}

export function prepareAudienceForm(brand: SiteBrand) {
  const controller = controllers.get(brand);
  if (!controller?.eligible()) return null;
  return {
    policyVersion: controller.policyVersion,
    record(proof: string, propertyId?: string) {
      try {
        controller.action({ kind: "form_received", proof, propertyId, placement: "contact" });
      } catch {
        /* Lead persistence succeeds independently of audience measurement. */
      }
    },
  };
}

export function activateAudience(brand: SiteBrand, config: AudienceConfig, onDisabled: () => void) {
  controllers.get(brand)?.stop();
  const controller = createAudience(brand, config, onDisabled);
  controllers.set(brand, controller);
  return controller;
}

function createAudience(brand: SiteBrand, config: AudienceConfig, onDisabled: () => void) {
  const endpoint = audienceEndpoint(brand);
  const keys = audienceStorageKeys(brand);
  const abort = new AbortController();
  const canMeasureDuration = typeof navigator.locks?.request === "function";
  let view: AudienceView | null = null;
  let shownKey = "";
  let shownSession = "";
  let firstDocumentPage = true;
  let queue: QueueEntry[] = [];
  let sendTimer: number | undefined;
  let sending = false;
  let resumeAfter = 0;
  let lockPending = false;
  let releaseLock: (() => void) | undefined;
  let sampleAt = performance.now();
  let lastInput = -Infinity;
  let live = true;
  const visible = () => document.visibilityState === "visible";
  const allowed = () => {
    if (!live) return false;
    const preference = readAudiencePreference(brand);
    return preference?.policyVersion === config.policyVersion && preference.choice === "granted";
  };

  function readIdentity(): Identity | null {
    const value = JSON.parse(localStorage.getItem(keys.identity) ?? "null");
    if (
      !isUuid(value?.visitorId) ||
      !isUuid(value?.sessionId) ||
      typeof value.expiresAt !== "number" ||
      typeof value.lastActivity !== "number"
    )
      return null;
    return value;
  }

  function session(): { identity: Identity; created: boolean } {
    const now = Date.now();
    const saved = readIdentity();
    const visitor = saved && saved.expiresAt > now ? saved : null;
    const created =
      !visitor ||
      visitor.lastActivity < 0 ||
      now < visitor.lastActivity ||
      now - visitor.lastActivity >= SESSION_IDLE_MS;
    const identity = {
      visitorId: visitor?.visitorId ?? crypto.randomUUID(),
      expiresAt: visitor?.expiresAt ?? now + VISITOR_LIFETIME_MS,
      sessionId: created ? crypto.randomUUID() : visitor.sessionId,
      lastActivity: now,
    };
    if (created || now - visitor.lastActivity >= 1000)
      localStorage.setItem(keys.identity, JSON.stringify(identity));
    return { identity, created };
  }

  function takeBatch(): AudienceBatch | null {
    const first = queue[0];
    if (!first) return null;
    const events: AudienceEvent[] = [];
    for (const entry of queue) {
      if (
        events.length === AUDIENCE_MAX_BATCH_EVENTS ||
        entry.visitorId !== first.visitorId ||
        entry.sessionId !== first.sessionId
      )
        break;
      events.push(entry.event);
    }
    queue.splice(0, events.length);
    return { v: 1, visitorId: first.visitorId, sessionId: first.sessionId, events };
  }

  function retireSession(sessionId: string) {
    queue = queue.filter((entry) => entry.sessionId !== sessionId);
    if (!allowed()) return;
    try {
      const identity = readIdentity();
      if (identity?.sessionId === sessionId) {
        localStorage.setItem(keys.identity, JSON.stringify({ ...identity, lastActivity: -1 }));
        resumeAfter = Date.now() + RETRY_COOLDOWN_MS;
      }
    } catch {
      /* A future navigation may recover if storage is available again. */
    }
  }

  async function post(batch: AudienceBatch, retry: boolean) {
    const startsSession = batch.events.some((event) => event.kind === "session_start");
    const body = JSON.stringify(batch);
    const send = () =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Site-Audience-Policy": config.policyVersion,
        },
        credentials: audienceCredentials(brand),
        referrerPolicy: "no-referrer",
        cache: "no-store",
        body,
        keepalive: true,
        signal: abort.signal,
      });
    if (!allowed()) return;
    for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
      try {
        if (!allowed()) return;
        const response = await send();
        if (response.status === 403 || response.status === 404) {
          stop();
          clearAudienceIdentity(brand);
          onDisabled();
          return;
        }
        if (response.status < 500) {
          if (response.status === 409 || (startsSession && !response.ok))
            retireSession(batch.sessionId);
          return;
        }
      } catch {
        if (abort.signal.aborted) return;
      }
    }
    if (startsSession) retireSession(batch.sessionId);
  }

  function flush(leaving = false) {
    window.clearTimeout(sendTimer);
    sendTimer = undefined;
    if (!allowed()) {
      queue = [];
      return;
    }
    if (leaving) {
      for (let batch = takeBatch(); batch; batch = takeBatch()) void post(batch, false);
      return;
    }
    if (sending) return;
    const batch = takeBatch();
    if (!batch) return;
    sending = true;
    void post(batch, true).finally(() => {
      sending = false;
      if (queue.length) flush();
    });
  }

  function enqueue(identity: Identity, event: AudienceEvent) {
    if (queue.length >= MAX_QUEUE) return;
    queue.push({ visitorId: identity.visitorId, sessionId: identity.sessionId, event });
    if (sendTimer === undefined) sendTimer = window.setTimeout(flush, 250);
  }

  function documentAcquisition() {
    if (!firstDocumentPage) return { navigation: "navigation" as const };
    const initial = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const current = new URL(window.location.href);
    const isDocumentEntry =
      initial &&
      initial.name.split("#")[0] === `${current.origin}${current.pathname}${current.search}`;
    if (!isDocumentEntry) return { navigation: "navigation" as const };
    return {
      navigation: initial.type === "reload" ? ("reload" as const) : ("navigation" as const),
      attribution: audienceAttribution(current, document.referrer, brand, config),
    };
  }

  function display(currentView: AudienceView, identity: Identity, created: boolean) {
    const key = `${currentView.page}:${currentView.propertyId ?? ""}:${currentView.renderKey ?? ""}`;
    if (shownKey === key && shownSession === identity.sessionId && !created) return;
    const { page, propertyId } = currentView;
    const { attribution, navigation } = documentAcquisition();
    firstDocumentPage = false;
    if (created)
      enqueue(identity, {
        kind: "session_start",
        id: crypto.randomUUID(),
        measurableActivity: canMeasureDuration,
        ...(attribution ? { attribution } : {}),
        page,
      });
    enqueue(identity, { kind: "page_view", id: crypto.randomUUID(), page });
    if (page === "property" && propertyId)
      enqueue(identity, {
        kind: "property_view",
        id: crypto.randomUUID(),
        page,
        propertyId,
        navigation,
      });
    shownKey = key;
    shownSession = identity.sessionId;
  }

  function sample(until = performance.now()) {
    try {
      if (!view || !releaseLock || !allowed()) return;
      const end = Math.min(until, lastInput + ACTIVITY_IDLE_MS);
      const activeSeconds = Math.min(15, Math.floor((end - sampleAt) / 1000));
      if (activeSeconds < 1) return;
      sampleAt += activeSeconds * 1000;
      const active = readIdentity();
      if (
        !active ||
        active.lastActivity < 0 ||
        active.sessionId !== shownSession ||
        active.expiresAt <= Date.now()
      )
        return;
      enqueue(active, {
        kind: "active_time",
        id: crypto.randomUUID(),
        page: view.page,
        activeSeconds,
      });
    } catch {
      /* Optional timing is unavailable if storage or the clock cannot be read. */
    }
  }

  function unlock() {
    releaseLock?.();
    releaseLock = undefined;
  }

  function tryLock() {
    if (
      !canMeasureDuration ||
      releaseLock ||
      lockPending ||
      !view ||
      !visible() ||
      !document.hasFocus() ||
      !allowed() ||
      performance.now() - lastInput >= ACTIVITY_IDLE_MS
    )
      return;
    lockPending = true;
    void navigator.locks
      .request(keys.activityLock, { ifAvailable: true }, (lock) => {
        lockPending = false;
        if (!lock || !view || !visible() || !document.hasFocus() || !allowed()) return;
        sampleAt = performance.now();
        return new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
      })
      .catch(() => {
        lockPending = false;
      });
  }

  function touch(now: number) {
    if (now - lastInput >= ACTIVITY_IDLE_MS) {
      sample(now);
      sampleAt = now;
    }
    lastInput = now;
    tryLock();
  }

  function show(engaged: boolean) {
    try {
      if (!view || !visible() || !allowed() || Date.now() < resumeAfter) return;
      const current = session();
      display(view, current.identity, current.created);
      if (engaged && document.hasFocus()) touch(performance.now());
    } catch {
      /* Disallowed or unavailable storage is fail-closed. */
    }
  }

  function action(value: AudienceAction) {
    if (!view || !visible() || !allowed() || Date.now() < resumeAfter) return;
    const current = session();
    display(view, current.identity, current.created);
    touch(performance.now());
    const optionalProperty =
      value.kind === "whatsapp_click" &&
      value.placement !== "card" &&
      value.placement !== "quick_view" &&
      !value.propertyId &&
      view.page === "property"
        ? view.propertyId
        : undefined;
    enqueue(current.identity, {
      ...value,
      ...(optionalProperty ? { propertyId: optionalProperty } : {}),
      id: crypto.randomUUID(),
      page: view.page,
    });
  }

  function updateView(next: AudienceView | null) {
    if (
      view?.page === next?.page &&
      view?.propertyId === next?.propertyId &&
      view?.renderKey === next?.renderKey
    )
      return;
    sample();
    view = next;
    sampleAt = performance.now();
    if (!next) {
      shownKey = "";
      unlock();
      return;
    }
    show(true);
  }

  function onInput(event: Event) {
    if (event.isTrusted && performance.now() - lastInput >= 250 && visible() && document.hasFocus())
      show(true);
  }
  function onHidden() {
    sample();
    unlock();
    lastInput = -Infinity;
    flush(true);
  }
  function onVisibility() {
    if (visible()) show(true);
    else onHidden();
  }
  function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) shownKey = "";
    show(true);
  }
  function onBlur() {
    sample();
    unlock();
    lastInput = -Infinity;
  }
  function onFocus() {
    show(true);
  }
  function onStorage(event: StorageEvent) {
    if ((event.key === keys.preference || event.key === null) && !allowed()) stop();
  }

  const timer = window.setInterval(() => {
    if (visible() && document.hasFocus()) {
      sample();
      if (performance.now() - lastInput >= ACTIVITY_IDLE_MS) unlock();
      else tryLock();
    }
  }, SAMPLE_MS);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHidden);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  window.addEventListener("storage", onStorage);
  for (const event of pointerEvents) window.addEventListener(event, onInput, { passive: true });

  function stop() {
    live = false;
    queue = [];
    abort.abort();
    unlock();
    window.clearInterval(timer);
    window.clearTimeout(sendTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHidden);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("storage", onStorage);
    for (const event of pointerEvents) window.removeEventListener(event, onInput);
    if (controllers.get(brand)?.stop === stop) controllers.delete(brand);
  }

  return { updateView, action, stop, eligible: allowed, policyVersion: config.policyVersion };
}
