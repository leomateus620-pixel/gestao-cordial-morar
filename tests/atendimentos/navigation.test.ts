import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attendanceWorkspaceView,
  expandAttendanceStage,
  parseAttendanceWorkspace,
} from "../../src/lib/atendimentos/workspace-navigation";

async function workspaceRouter(initialEntry: string) {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  const { createMemoryHistory, createRootRoute, createRoute, createRouter } =
    await import("@tanstack/react-router");
  if (previousEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnv;
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/atendimentos",
    validateSearch: (search) => ({ ...search, ...parseAttendanceWorkspace(search) }),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    isServer: false,
    origin: "http://localhost",
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();
  return router;
}

test("installed router retains filters, list origin and separate stage/detail state through Back and Forward", async () => {
  const filters = {
    clienteId: "client-1",
    track: "aluguel",
    corretorId: "broker-1",
    periodo: "mes",
    imobiliaria: "cordial",
    status: "novo",
  };
  const router = await workspaceRouter(
    `/atendimentos?${new URLSearchParams({ ...filters, modo: "lista" })}`,
  );
  const listKey = router.history.location.state.__TSR_key;
  await router.navigate({
    to: "/atendimentos",
    search: (previous) => expandAttendanceStage(previous, "primeiro_contato"),
    resetScroll: false,
  });
  assert.equal(router.latestLocation.search.origem, "lista");
  assert.equal(router.latestLocation.search.modo, "etapa");
  const stageKey = router.history.location.state.__TSR_key;
  assert.notEqual(stageKey, listKey);
  const current = () => router.latestLocation.search as Record<string, unknown>;
  for (const [key, value] of Object.entries(filters)) assert.equal(current()[key], value);

  await router.navigate({
    to: "/atendimentos",
    search: (previous) => ({ ...previous, etapa: "visita", id: "attendance-1" }),
    resetScroll: false,
  });
  assert.deepEqual(attendanceWorkspaceView(parseAttendanceWorkspace(current())), {
    kind: "etapa",
    stage: "visita",
    returnTo: "lista",
  });
  const detailKey = router.history.location.state.__TSR_key;
  const reloadHref = router.history.location.href;
  const reloaded = await workspaceRouter(reloadHref);
  assert.deepEqual(reloaded.latestLocation.search, router.latestLocation.search);

  await router.navigate({
    to: "/atendimentos",
    search: (previous) => ({ ...previous, id: undefined }),
    resetScroll: false,
  });
  assert.equal(current().id, undefined);
  assert.equal(current().etapa, "visita");

  // Memory history has no mounted browser adapter. Explicit load after a real
  // history move reconciles the installed Router; physical focus/scroll is UI QA.
  router.history.back();
  await router.load();
  assert.equal(router.history.location.state.__TSR_key, detailKey);
  assert.equal(current().id, "attendance-1");
  assert.equal(current().etapa, "visita");
  router.history.back();
  await router.load();
  assert.equal(router.history.location.state.__TSR_key, stageKey);
  assert.equal(current().id, undefined);
  assert.equal(current().etapa, "primeiro_contato");
  router.history.forward();
  await router.load();
  assert.equal(current().id, "attendance-1");
  assert.equal(current().etapa, "visita");
  for (const [key, value] of Object.entries(filters)) assert.equal(current()[key], value);

  await router.navigate({
    to: "/atendimentos",
    search: (previous) => ({ ...previous, modo: previous.origem, id: undefined }),
  });
  assert.deepEqual(attendanceWorkspaceView(parseAttendanceWorkspace(current())), { kind: "lista" });
  for (const [key, value] of Object.entries(filters)) assert.equal(current()[key], value);
});

test("installed router applies safe workspace fallback on a reloaded invalid-stage deep link", async () => {
  const router = await workspaceRouter(
    "/atendimentos?modo=etapa&etapa=arquivado&id=attendance-1&track=venda",
  );
  const search = router.state.matches.at(-1)!.search;
  assert.deepEqual(attendanceWorkspaceView(parseAttendanceWorkspace(search)), { kind: "funil" });
  assert.equal(search.id, "attendance-1");
  assert.equal(search.track, "venda");
});
