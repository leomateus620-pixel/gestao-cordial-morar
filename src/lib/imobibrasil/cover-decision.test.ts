import { describe, expect, it } from "vitest";
import { shouldSendAsCover } from "./cover-decision";

const base = { readReliable: false, remoteHasCover: false, linkHasCover: false, coversSentThisRun: 0, isFirstDesired: true };

describe("shouldSendAsCover", () => {
  it("primeira foto sem capa conhecida vira capa mesmo sem leitura do site", () => {
    expect(shouldSendAsCover(base)).toBe(true);
  });
  it("não cria segunda capa quando o vínculo já tem capa", () => {
    expect(shouldSendAsCover({ ...base, linkHasCover: true })).toBe(false);
  });
  it("respeita a leitura confiável do site", () => {
    expect(shouldSendAsCover({ ...base, readReliable: true, remoteHasCover: true })).toBe(false);
  });
  it("só a primeira foto do Gestão e só uma por rodada", () => {
    expect(shouldSendAsCover({ ...base, isFirstDesired: false })).toBe(false);
    expect(shouldSendAsCover({ ...base, coversSentThisRun: 1 })).toBe(false);
  });
});
