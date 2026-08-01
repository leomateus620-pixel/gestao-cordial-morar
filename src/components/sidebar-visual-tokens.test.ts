import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const stylesSource = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");
const componentSources = ["./app-shell.tsx", "./sidebar-menu.tsx"]
  .map((path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"))
  .join("\n");

function getToken(name: string) {
  const value = stylesSource.match(new RegExp(`--app-sidebar-${name}:\\s*([^;]+);`))?.[1].trim();
  assert.ok(value, `Missing --app-sidebar-${name}`);
  return value;
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(firstHex: string, secondHex: string) {
  const first = relativeLuminance(firstHex);
  const second = relativeLuminance(secondHex);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("keeps sidebar presentation token-driven and free of heavy glass effects", () => {
  for (const token of [
    "background",
    "elevated-surface",
    "hover-surface",
    "active-surface",
    "border",
    "primary-text",
    "secondary-text",
    "section-text",
    "icon-foreground",
    "accent",
    "focus-ring",
    "width-expanded",
    "width-collapsed",
    "row-height",
  ]) {
    getToken(token);
  }

  assert.doesNotMatch(componentSources, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(componentSources, /\brgba?\(/i);

  const surface = stylesSource.match(/@utility sidebar-glass\s*{([^}]+)}/)?.[1] ?? "";
  assert.doesNotMatch(surface, /gradient|backdrop-filter/i);
});

test("keeps primary and secondary sidebar text at WCAG AA contrast", () => {
  const backgrounds = ["background", "hover-surface", "active-surface"];
  const foregrounds = ["primary-text", "secondary-text"];

  for (const background of backgrounds) {
    for (const foreground of foregrounds) {
      const ratio = contrastRatio(getToken(background), getToken(foreground));
      assert.ok(
        ratio >= 4.5,
        `${foreground} on ${background} has only ${ratio.toFixed(2)}:1 contrast`,
      );
    }
  }

  assert.ok(contrastRatio(getToken("background"), getToken("section-text")) >= 4.5);
});
