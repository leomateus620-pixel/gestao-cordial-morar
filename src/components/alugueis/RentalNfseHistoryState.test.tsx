import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { RentalNfseHistoryState } from "./RentalNfseHistoryState";

function render(
  input: { failed?: boolean; loading?: boolean; count?: number; tests?: boolean } = {},
) {
  return renderToStaticMarkup(
    <RentalNfseHistoryState
      failed={input.failed ?? false}
      loading={input.loading ?? false}
      count={input.count ?? 0}
      tests={input.tests ?? false}
      onRetry={() => {}}
    >
      Registro fiscal persistido
    </RentalNfseHistoryState>,
  );
}
test("failed history announces the failure with a retry action, never an empty history", () => {
  const html = render({ failed: true });
  assert.match(html, /role="alert"/);
  assert.match(html, /Tentar novamente/);
  assert.doesNotMatch(html, /Nenhuma/);
});
test("a reopened history loading does not claim an empty result", () => {
  const html = render({ loading: true });
  assert.match(html, /Carregando histórico fiscal/);
  assert.doesNotMatch(html, /Nenhuma/);
});
test("only a successful empty query may report no records, scoped to real or test", () => {
  assert.match(render(), /Nenhuma operação real/);
  assert.match(render({ tests: true }), /Nenhuma validação de teste/);
  assert.match(render({ count: 1 }), /Registro fiscal persistido/);
  assert.doesNotMatch(render({ count: 1 }), /Nenhuma/);
});
