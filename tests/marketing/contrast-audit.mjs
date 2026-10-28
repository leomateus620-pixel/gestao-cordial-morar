/** Source-color contrast calculation, not a browser/compliance audit.
 * Run: node tests/marketing/contrast-audit.mjs
 * Light theme only; alpha-composite over a flat background, no blur or shadows.
 */
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8").split(
  ".dark {",
)[0];
const clamp = (value) => Math.max(0, Math.min(1, value));
const encode = (value) => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
function oklch(L, C, hue) {
  const a = C * Math.cos((hue * Math.PI) / 180),
    b = C * Math.sin((hue * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((value) => clamp(encode(value)));
}
function token(name) {
  const match = css.match(new RegExp(`--${name}: oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)`));
  if (!match) throw new Error(`Token missing: ${name}`);
  return oklch(...match.slice(1).map(Number));
}
const composite = (color, alpha, background) =>
  color.map((value, i) => alpha * value + (1 - alpha) * background[i]);
const hex = (value) => value.match(/[a-f\d]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
const luminance = (color) =>
  color
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const background = token("background"),
  foreground = token("foreground");
const card = composite([1, 1, 1], 0.62, background);
const glass = composite([1, 1, 1], 0.64, background);
const entries = [];
const add = (name, foreground, background, minimum = 4.5) =>
  entries.push({
    name,
    ratio: Number(ratio(foreground, background).toFixed(2)),
    minimum,
    passes: ratio(foreground, background) >= minimum,
  });
add("foreground / background", foreground, background);
add("primary-foreground / primary button", token("primary-foreground"), token("primary"));
add("primary / background", token("primary"), background);
add("muted-foreground / card", token("muted-foreground"), card);
for (const alpha of [0.46, 0.48, 0.54, 0.55, 0.58, 0.6, 0.65, 0.7])
  add(
    `foreground/${Math.round(alpha * 100)} / liquid-panel (flat)`,
    composite(foreground, alpha, glass),
    glass,
  );
add("foreground/60 / active card", composite(foreground, 0.6, card), card);
add("foreground/65 / active card", composite(foreground, 0.65, card), card);
add("chartSuccess 100% line / active card", hex("2F9E68"), card, 3);
add("chart axis #6B7280 / liquid-panel", hex("6B7280"), glass);
add("chartSystem 18% bar / liquid-panel", composite(hex("1E647D"), 0.18, glass), glass, 3);
add("chartSuccess 82% bar / liquid-panel", composite(hex("2F9E68"), 0.82, glass), glass, 3);
add("input border / background", token("input"), background, 3);
console.log(
  JSON.stringify(
    {
      method:
        "WCAG relative luminance after OKLCH to sRGB conversion and alpha compositing; source colors only, flat light surfaces",
      entries,
    },
    null,
    2,
  ),
);
