import { describe, expect, it } from "vitest";
import { extractMapsCoords, isGoogleMapsUrl, isShortMapsUrl, mapsEmbedUrl } from "./maps-link";

describe("maps-link", () => {
  it("aceita links do Google Maps e recusa outros", () => {
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isGoogleMapsUrl("https://www.google.com/maps/place/Santa+Rosa/@-27.87,-54.48,15z")).toBe(
      true,
    );
    expect(isGoogleMapsUrl("https://www.waze.com/ul?ll=-27,-54")).toBe(false);
    expect(isGoogleMapsUrl("nao é link")).toBe(false);
  });

  it("identifica link curto do app", () => {
    expect(isShortMapsUrl("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isShortMapsUrl("https://www.google.com/maps/@-27.87,-54.48,15z")).toBe(false);
  });

  it("extrai coordenadas dos formatos comuns", () => {
    expect(extractMapsCoords("https://www.google.com/maps/@-27.8702,-54.4812,17z")).toEqual({
      lat: -27.8702,
      lng: -54.4812,
    });
    expect(extractMapsCoords("https://www.google.com/maps/place/x/data=!3d-27.5!4d-54.25")).toEqual({
      lat: -27.5,
      lng: -54.25,
    });
    expect(extractMapsCoords("https://www.google.com/maps?q=-27.1,-54.2")).toEqual({
      lat: -27.1,
      lng: -54.2,
    });
    expect(extractMapsCoords("https://maps.app.goo.gl/abc123")).toBeNull();
  });

  it("monta o embed sem chave de API", () => {
    expect(mapsEmbedUrl({ lat: -27.87, lng: -54.48 })).toContain("q=-27.87,-54.48");
    expect(mapsEmbedUrl({ lat: -27.87, lng: -54.48 })).toContain("output=embed");
  });
});
