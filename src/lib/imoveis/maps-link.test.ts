import assert from "node:assert/strict";
import test from "node:test";
import { extractMapsCoords, isGoogleMapsUrl, isShortMapsUrl, mapsEmbedUrl } from "./maps-link";

test("aceita links do Google Maps e recusa outros", () => {
  assert.equal(isGoogleMapsUrl("https://maps.app.goo.gl/abc123"), true);
  assert.equal(
    isGoogleMapsUrl("https://www.google.com/maps/place/Santa+Rosa/@-27.87,-54.48,15z"),
    true,
  );
  assert.equal(isGoogleMapsUrl("https://www.waze.com/ul?ll=-27,-54"), false);
  assert.equal(isGoogleMapsUrl("nao é link"), false);
});

test("identifica link curto do app", () => {
  assert.equal(isShortMapsUrl("https://maps.app.goo.gl/abc123"), true);
  assert.equal(isShortMapsUrl("https://www.google.com/maps/@-27.87,-54.48,15z"), false);
});

test("extrai coordenadas dos formatos comuns", () => {
  assert.deepEqual(extractMapsCoords("https://www.google.com/maps/@-27.8702,-54.4812,17z"), {
    lat: -27.8702,
    lng: -54.4812,
  });
  assert.deepEqual(
    extractMapsCoords("https://www.google.com/maps/place/x/data=!3d-27.5!4d-54.25"),
    { lat: -27.5, lng: -54.25 },
  );
  assert.deepEqual(extractMapsCoords("https://www.google.com/maps?q=-27.1,-54.2"), {
    lat: -27.1,
    lng: -54.2,
  });
  assert.equal(extractMapsCoords("https://maps.app.goo.gl/abc123"), null);
});

test("monta o embed sem chave de API", () => {
  const url = mapsEmbedUrl({ lat: -27.87, lng: -54.48 });
  assert.ok(url.includes("q=-27.87,-54.48"));
  assert.ok(url.includes("output=embed"));
});
