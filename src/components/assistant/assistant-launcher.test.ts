import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantLauncherStore, shouldShowAssistantLauncher } from "./launcher-state";

test("botão aparece nas telas comuns", () => {
  assert.equal(shouldShowAssistantLauncher("/imoveis"), true);
  assert.equal(shouldShowAssistantLauncher("/atendimentos"), true);
});

test("botão some no Assistente", () => {
  assert.equal(shouldShowAssistantLauncher("/assistente"), false);
  assert.equal(shouldShowAssistantLauncher("/assistente/agenda"), false);
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
