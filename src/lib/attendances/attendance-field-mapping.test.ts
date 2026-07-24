import assert from "node:assert/strict";
import test from "node:test";
import { mapCanonicalPropertyFields } from "./attendance-field-mapping.ts";

test("free-form interest never becomes a linked property without a relationship id", () => {
  assert.deepEqual(
    mapCanonicalPropertyFields({
      propertyTitle: "Qual andar é, de frente ou fundos e se está ocupado",
    }),
    {
      interestDescription: "Qual andar é, de frente ou fundos e se está ocupado",
    },
  );
});

test("linked property fields remain canonical when a relationship id exists", () => {
  assert.deepEqual(
    mapCanonicalPropertyFields({
      propertyId: "im1",
      propertyCode: "CRD-SR-0001",
      propertyTitle: "Residencial Harmonia Centro",
      interestDescription: "Preferência por andar alto",
    }),
    {
      propertyId: "im1",
      propertyCode: "CRD-SR-0001",
      propertyTitle: "Residencial Harmonia Centro",
      interestDescription: "Preferência por andar alto",
    },
  );
});
