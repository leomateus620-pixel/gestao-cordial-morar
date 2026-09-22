import { strict as assert } from "node:assert";
import test from "node:test";
import { findCrossAccountConflicts } from "./cross-account";

test("Cordial e Morar mudam o preço de jeitos diferentes: divergência entre contas", () => {
  // Cordial já importada (Gestão = 200); agora chega a Morar com 300.
  const out = findCrossAccountConflicts({
    fields: ["valor"],
    thisConfirmed: { valor: "100" },
    thisRemote: { valor: "300" },
    otherRemote: { valor: "200" },
    local: { valor: "200" },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].local, "200");
});

test("mudança só numa conta entra normalmente", () => {
  const out = findCrossAccountConflicts({
    fields: ["valor"],
    thisConfirmed: { valor: "100" },
    thisRemote: { valor: "200" },
    otherRemote: { valor: "100" },
    local: { valor: "100" },
  });
  assert.equal(out.length, 0);
});

test("as duas contas mudaram para o mesmo valor: convergência", () => {
  const out = findCrossAccountConflicts({
    fields: ["valor"],
    thisConfirmed: { valor: "100" },
    thisRemote: { valor: "200" },
    otherRemote: { valor: "200" },
    local: { valor: "200" },
  });
  assert.equal(out.length, 0);
});

test("resultado não depende da ordem das importações", () => {
  const cordialFirst = findCrossAccountConflicts({
    fields: ["valor"], thisConfirmed: { valor: "100" }, thisRemote: { valor: "200" },
    otherRemote: { valor: "300" }, local: { valor: "100" },
  });
  const morarFirst = findCrossAccountConflicts({
    fields: ["valor"], thisConfirmed: { valor: "100" }, thisRemote: { valor: "300" },
    otherRemote: { valor: "200" }, local: { valor: "100" },
  });
  assert.equal(cordialFirst.length, 1);
  assert.equal(morarFirst.length, 1);
});

test("Cordial→200 e Morar→300: a ordem das importações não decide", () => {
  const confirmed = { valor: 100 };
  const local = { valor: 100 };
  const a = findCrossAccountConflicts({ fields: ["valor"], thisConfirmed: confirmed, thisRemote: { valor: 200 }, otherRemote: { valor: 300 }, otherConfirmed: confirmed, local });
  const b = findCrossAccountConflicts({ fields: ["valor"], thisConfirmed: confirmed, thisRemote: { valor: 300 }, otherRemote: { valor: 200 }, otherConfirmed: confirmed, local });
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
});
