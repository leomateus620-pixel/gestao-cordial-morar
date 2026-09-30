import assert from "node:assert/strict";
import test from "node:test";

import { buildBasicAuthHeader } from "./client.server.ts";

test("header Basic usa CNPJ só dígitos e base64 de login:senha", () => {
  const header = buildBasicAuthHeader("42.767.687/0001-35", "senha123");
  assert.equal(
    header,
    `Basic ${Buffer.from("42767687000135:senha123", "utf-8").toString("base64")}`,
  );
});

test("header Basic preserva login sem pontuação e senha com caracteres especiais", () => {
  const header = buildBasicAuthHeader("35080386000173", "a:b/c d");
  const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf-8");
  assert.equal(decoded, "35080386000173:a:b/c d");
});
