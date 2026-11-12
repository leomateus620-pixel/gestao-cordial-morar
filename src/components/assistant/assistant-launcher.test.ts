import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantLauncherStore, shouldShowAssistantLauncher } from "./launcher-state";
import { canUseAssistant } from "../../lib/access-control.ts";

const team = { perfil: "corretor", modules: ["agenda", "atendimentos"] } as never;
const viewer = { perfil: "atendimentos_viewer", modules: ["atendimentos"] } as never;

test("botão aparece nas telas comuns", () => {
  assert.equal(shouldShowAssistantLauncher("/imoveis", team), true);
  assert.equal(shouldShowAssistantLauncher("/atendimentos", team), true);
});

test("botão some no Assistente", () => {
  assert.equal(shouldShowAssistantLauncher("/assistente", team), false);
  assert.equal(shouldShowAssistantLauncher("/assistente/agenda", team), false);
});

test("Consulta de Atendimentos não vê o botão nem usa as páginas do bot", () => {
  assert.equal(shouldShowAssistantLauncher("/atendimentos", viewer), false);
  assert.equal(shouldShowAssistantLauncher("/imoveis", viewer), false);
  assert.equal(canUseAssistant(viewer), false);
  assert.equal(shouldShowAssistantLauncher("/imoveis", null), false);
});

test("abrir pelo botão avisa o painel", () => {
  let calls = 0;
  const off = assistantLauncherStore.subscribe(() => calls++);
  assistantLauncherStore.set(true);
  assert.equal(assistantLauncherStore.get(), true);
  assistantLauncherStore.set(false);
  off();
  assert.equal(calls, 2);
});
