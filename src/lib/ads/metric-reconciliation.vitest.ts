import { expect, it } from "vitest";
import { missingDayEvidenceIdentity, revisionEvidenceEnough } from "./metric-reconciliation";
it("continued delivery on another day cannot postpone disappearance review indefinitely", () => {
  const disappeared = { data: "2026-10-01", spend: 12, impressions: 20 };
  expect(
    missingDayEvidenceIdentity(
      [disappeared, { data: "2026-10-02", spend: 50, impressions: 100 }],
      ["2026-10-01"],
    ),
  ).toBe(
    missingDayEvidenceIdentity(
      [disappeared, { data: "2026-10-02", spend: 80, impressions: 200 }],
      ["2026-10-01"],
    ),
  );
  expect(missingDayEvidenceIdentity([disappeared], ["2026-10-01"])).not.toBe(
    missingDayEvidenceIdentity([{ ...disappeared, spend: 13 }], ["2026-10-01"]),
  );
});
it("missing period spend cannot authorize deletion of previously positive data", () => {
  expect(
    revisionEvidenceEnough({
      firstSeen: "2026-10-01T10:00:00Z",
      now: Date.parse("2026-10-01T10:30:00Z"),
      missingDays: ["2026-09-30"],
      verifiedEmptyDays: ["2026-09-30"],
      dailySpend: 0,
      periodSpend: null,
      dailyImpressions: 0,
      periodImpressions: 0,
    }),
  ).toBe(false);
});
